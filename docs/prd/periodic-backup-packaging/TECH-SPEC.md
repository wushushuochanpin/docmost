# 技术规格：Docmost 定期备份打包文件

## 1. 设计原则

- 可恢复优先：备份成功不等于可恢复，必须内置校验与演练机制。
- 最小侵入：优先复用现有 NestJS 模块、存储抽象、队列和权限框架。
- 资源可控：备份任务必须可限速、可取消、可追踪。
- 安全默认开启：加密、鉴权、审计默认启用。

## 2. 现状与差距

## 2.1 现状（当前代码）

- 数据存储：
  - PostgreSQL（`DATABASE_URL`）
  - 文件存储驱动 `local | s3`（`StorageService` 抽象）
- 已有导出能力：
  - `apps/server/src/integrations/export` 可导出页面/空间 ZIP（非实例级）
- 调度能力：
  - 已使用 `@nestjs/schedule`（如 telemetry、trash cleanup）
- 部署形态：
  - Docker compose 默认将本地文件挂载到 `/app/data/storage`

## 2.2 差距

- 缺少“数据库 + 文件”的统一快照打包能力。
- 缺少备份策略管理、任务状态、恢复入口、审计与告警闭环。

## 3. 目标架构

新增模块建议：`apps/server/src/integrations/backup/`

- `backup.module.ts`
- `services/backup-policy.service.ts`
- `services/backup-job.service.ts`
- `services/backup-scheduler.service.ts`
- `services/backup-package.service.ts`
- `services/backup-restore.service.ts`
- `controllers/backup.controller.ts`
- `dto/*`

核心依赖复用：

- `EnvironmentService`：读取新增备份配置项
- `StorageService`：读写备份产物（本地/S3）
- `QueueModule`：异步执行重任务，避免阻塞 HTTP 线程
- CASL + AuthGuard：权限控制

## 4. 数据模型（建议）

## 4.1 `backupPolicies`

- `id` (uuid)
- `workspaceId` (uuid)
- `name` (string)
- `enabled` (boolean)
- `cronExpr` (string)
- `timezone` (string, default `UTC`)
- `retentionDays` (int, nullable)
- `retentionCount` (int, nullable)
- `targetDriver` (`local` | `s3`)
- `targetConfig` (jsonb, 加密存储敏感字段)
- `lastRunAt` (timestamp, nullable)
- `createdBy`, `createdAt`, `updatedAt`

## 4.2 `backupJobs`

- `id` (uuid)
- `workspaceId` (uuid)
- `policyId` (uuid, nullable; 手动触发可为空)
- `triggerType` (`schedule` | `manual` | `api`)
- `triggeredByUserId` (uuid, nullable；仅 `manual` 时必填，用于列表展示「操作人」与审计；`schedule`/`api` 为空时展示为「系统」)
- `status` (`pending` | `running` | `success` | `failed` | `canceled`)；语义与流转见下「备份任务状态机」
- `startedAt`, `endedAt`
- `durationMs` (bigint)
- `artifactPath` (string)
- `artifactSizeBytes` (bigint)
- `checksum` (string)
- `errorCode` (string, nullable)
- `errorMessage` (text, nullable)
- `metadata` (jsonb)

**备份任务状态机**（`backupJobs.status`）：

- 枚举：`pending`（等待中）、`running`（备份中）、`success`（成功）、`failed`（失败）、`canceled`（已取消）。
- 流转：`pending` → `running` → `success` | `failed` | `canceled`；`pending`/`running` 时可主动置为 `canceled`。
- 执行方式：**异步**。触发后创建任务（`pending`），由队列/Worker 消费并置为 `running`，完成后置为终态；列表需展示上述全部状态（含「备份中」），可通过轮询或 WebSocket 刷新。

## 4.3 `backupRestores`

- `id` (uuid)
- `workspaceId` (uuid)
- `jobId` (uuid)
- `mode` (`dry-run` | `apply`)
- `status` (`pending` | `running` | `success` | `failed`)
- `startedAt`, `endedAt`
- `report` (jsonb)
- `operatorId` (uuid)

## 5. 打包规范

- **每次备份一个包**：每次备份任务产生一份完整快照（一个独立包），可单独还原，无依赖链；不做增量。
- **DB 格式**：使用 **plain SQL**（`pg_dump -Fp`）后 gzip，即 `docmost.sql.gz`，便于通用工具打开（文本编辑器、psql、任意 PG 客户端）。参见 [02_备份页面_COS与格式说明.md](./02_备份页面_COS与格式说明.md)。

建议包结构（逻辑）：

```text
backup-<workspaceId>-<yyyyMMddHHmmss>.tar.zst
  /manifest.json
  /db/docmost.sql.gz         # plain SQL, gzip 压缩
  /storage/...               # 文件快照
  /checksums/SHA256SUMS
  /meta/version.txt
```

`manifest.json` 最小字段：

- `docmostVersion`
- `createdAt`
- `workspaceId`
- `storageDriver`
- `dbDump`（大小、checksum）
- `storageFiles`（总数、总大小、采样校验）
- `schemaVersion`

## 6. 关键流程

## 6.1 备份执行流程

1. 读取策略并生成任务记录（`pending`）；触发方立即返回，任务由队列/Worker 异步执行。
2. Worker 取到任务后获取分布式锁（Redis）防止并发重入，将状态更新为 `running`（备份中）。
3. 执行 DB dump（流式压缩）。
4. 执行文件快照：
   - `local`：遍历本地目录并流式写入包；
   - `s3`：按 prefix 拉取对象并流式写入包。
5. 生成 checksum 与 manifest。
6. 上传/落盘备份产物。
7. 更新任务为 `success`（或失败时 `failed`），写审计日志与指标。
8. 释放锁，执行保留策略清理。若中途异常或取消，将任务置为 `failed` 或 `canceled`。

## 6.2 恢复流程

1. **选择还原源**（手工选择其一）：
   - **按任务**：从本实例备份任务列表选择某次成功任务的 `jobId`，后端按 `artifactPath` 定位包；
   - **按 COS**：当目标为 S3/COS 时，拉取配置 bucket/prefix 下的备份对象列表，用户选择一条（如 key），后端从 COS 拉取该包；
   - **按上传**：用户上传备份包到服务端临时存储，后端对该上传文件进行还原。
2. 权限校验 + 二次确认（含所选备份的展示，如时间、大小）。
3. 下载/读取并校验备份包完整性。
4. `dry-run`：仅做结构和兼容校验，生成报告。
5. `apply`：恢复 DB，再恢复文件，最后做抽样一致性检查。
6. 记录恢复任务报告与审计日志。

## 7. API 草案（v1）

- `POST /backups/policies`
  - 创建策略
- `PATCH /backups/policies/:id`
  - 更新/启停策略
- `GET /backups/policies`
  - 查询策略列表
- `POST /backups/jobs/run`
  - 手动触发备份
- `GET /backups/jobs`
  - 查询任务列表
- `GET /backups/jobs/:id`
  - 查询任务详情
- `POST /backups/jobs/:id/restore`
  - 按任务 ID 执行恢复（`mode=dry-run|apply`）
- `GET /backups/jobs/:id/download-url`
  - 获取短时效下载链接
- `GET /backups/artifacts`（或等价）
  - 当目标为 S3/COS 时：列出配置 bucket/prefix 下的备份对象，供用户**手工选择**后还原（返回 key、大小、最后修改时间等）
- `POST /backups/restore-from-artifact`
  - 按 COS key（或 artifact 标识）发起恢复（body 含 `artifactKey`、`mode` 等）
- `POST /backups/restore-from-upload`
  - 上传备份包后发起恢复（如 multipart 上传，再 `mode=dry-run|apply`）；或先上传得到临时 ID，再调恢复接口传入该 ID

权限建议：仅 Workspace `owner/admin` 可用。

## 8. 环境变量建议

- `BACKUP_ENABLED=true`
- `BACKUP_DEFAULT_CRON=0 0 2 * * *`
- `BACKUP_DEFAULT_TIMEZONE=UTC`
- `BACKUP_RETENTION_DAYS=30`
- `BACKUP_LOCAL_PATH=/app/data/backups`
- `BACKUP_ENCRYPTION_ENABLED=true`
- `BACKUP_ENCRYPTION_KEY_ID=...`（或 KMS 配置）
- `BACKUP_MAX_PARALLEL=1`
- `BACKUP_STREAM_CHUNK_MB=16`
- `BACKUP_VERIFY_AFTER_CREATE=true`

## 9. 安全与合规

- 数据加密：
  - 传输层 TLS；
  - 静态加密（SSE-KMS 或应用层加密）。
- 访问控制：
  - 最小权限 IAM（仅允许指定 bucket/prefix）。
- 审计：
  - 策略变更、下载、恢复、删除均写入审计日志。
- 密钥管理：
  - 不在日志输出明文密钥；
  - 支持密钥轮换（兼容旧包解密策略）。

## 10. 可观测性

Prometheus 指标建议：

- `docmost_backup_job_total{status=...}`
- `docmost_backup_job_duration_seconds`
- `docmost_backup_artifact_size_bytes`
- `docmost_backup_last_success_timestamp`
- `docmost_backup_restore_total{mode,status}`

日志要求：

- 每个任务必须带 `jobId`、`workspaceId`、`triggerType`。
- 错误日志需包含可执行修复建议（例如权限不足、磁盘空间不足）。

## 11. 兼容与迁移

- 对现有功能无破坏性变更。
- 数据库新增备份相关表，不修改核心业务表结构。
- 恢复仅保证“同大版本”强兼容，跨大版本需显式告警。

## 12. 失败场景与回滚策略

- DB dump 失败：标记失败并保留错误上下文，不生成无效产物。
- 文件快照中断：中止任务并删除半成品。
- 上传失败：重试后仍失败则保留本地临时产物供人工接管。
- 恢复失败：自动停止并输出阶段性报告，不继续覆盖后续步骤。
