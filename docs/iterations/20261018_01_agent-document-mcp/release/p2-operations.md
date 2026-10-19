---
file: docs/iterations/20261018_01_agent-document-mcp/release/p2-operations.md
description: MCP 启停、只读诊断、告警与安全回退运行手册。
created_at: 2026-10-19 14:21:19 Asia/Shanghai
updated_at: 2026-10-19 14:47:53 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认 PRD/SDD、当前 OAuth/MCP 代码和本地验收结果
applies_to: [operations, release]
disclaimer: 文档可能更新，仅供参考；当前代码、产品与原始验收证据优先。未部署，文中 HOST 为占位地址，不是已开放服务。
---

# MCP 运维准备

本手册及脚本已准备，本轮没有部署、创建生产监控任务、发送告警消息或应用迁移。上线负责人、值班人员和通知渠道需在实际发布前填写，不能把角色名称当成已指定人员。

## 配置与启用顺序

| 真实配置/策略 | 用途 | 操作边界 |
|---|---|---|
| AGENT_OAUTH_ENABLED | 开启 OAuth 发现/认证入口 | false 会影响现有 OAuth 读取；不是“只停写”开关 |
| AGENT_OAUTH_ORIGIN | 唯一公网 HTTPS origin | issuer 与 resource 从它生成；不能含路径/查询/片段 |
| AGENT_OAUTH_ADMIN_USER_IDS | 客户端登记账号白名单 | 逗号分隔 ID，最小授权，不等于所有 workspace admin |
| AGENT_OAUTH_RESPONSE_KEY | 授权响应加密/许可相关秘密 | 32 字节 Base64，通过秘密存储配置，不写入文档或日志 |
| DOCUMENT_COMMAND_ENABLED | 文档持久化与互斥协议 | 不能通过关闭它绕过旧客户端写入保护 |
| DOCUMENT_COMMAND_SIGNING_KEY | 编辑版本/上下文签名 | 各节点一致的 32 字节 Base64；轮换会使旧上下文失效，需规划 |
| agent_policies.enabled | 工作区 Agent 写入开关 | 默认 false；通过“Agent 策略”管理，关闭保留读取和历史 |
| 工作区既有 ai.mcp | 原 MCP 总能力开关 | 关闭会同时影响读取，不用于仅停止新增写入 |

部署前保留五份追加迁移，禁止修改已合并迁移。先一致备份和迁移演练，再部署同版本后端/协作节点及新前端；使用非 superuser、非 BYPASSRLS 的应用数据库角色。测试 Redis 与生产隔离。保持工作区写入关闭，确认旧节点已排空且旧浏览器无法写入，然后才由管理员为指定试用空间/用户启用。

## 只停 Agent 写入

管理员打开“设置 → Agent 策略”，关闭写入并确认。记录操作者、时间、策略 version。API 等价操作为 GET /api/agent-policy 取得版本和 csrf_token，再 PUT 同一路径，携带 Origin、X-CSRF-Token、expected_version 及完整策略值，enabled=false。409 时重新读取，不覆盖别人的策略调整。

关闭成功后验证：新写返回 MCP_DISABLED；fetch/get_page 仍可读；既有 get_operation、历史和审计仍保留。若最终提交先于关闭已取得授权屏障，则该提交保留；关闭先于最终提交则拒绝并释放预留，不声称撤回已提交内容。重新启用需确认原事故原因已排除并再次读取当前策略版本。

## 只读诊断

仓库已安装依赖，使用 Node 22+。通过部署秘密管理向进程注入 `MCP_DIAGNOSTIC_DATABASE_URL`，不要把连接串放入命令参数、工单或 shell 历史；脚本不读取 .env。

```sh
node scripts/mcp/diagnose.mjs --workspace WORKSPACE_UUID
node scripts/mcp/diagnose.mjs --workspace WORKSPACE_UUID --operation OPERATION_UUID
```

脚本只执行 repeatable-read/read-only 事务，设置 workspace RLS 上下文，statement_timeout=5s、lock_timeout=1s。拒绝 superuser/BYPASSRLS；所有查询显式限定 workspace，操作不属于该 workspace 返回 NOT_FOUND_OR_FORBIDDEN。它是供受信任运维人员使用的数据库工具，不是向第三方 Agent 暴露的租户选择 API。建议独立 LOGIN NOSUPERUSER NOBYPASSRLS 角色，仅授予 workspaces、document_operations、document_gates、document_updates、document_recovery_snapshots、document_outbox、agent_quota_reservations 的 SELECT，禁止写表。

退出码：0=本次采样无已定义告警；2=需要处理的告警；1=配置/权限/数据库/查询失败。1 必须报“采集失败”，不能当作健康。未知 workspace 和错误 operation 不返回成功。

输出包括 pending 数量和年龄、实际 recovering 状态年龄、outbox 数量和年龄、已提交完整性检查、live 同步待完成数量、保留 journal 行数/字节和日配额预留数。按 operation 仅返回状态、时间、page ID、gate/fence、快照数和待通知数；不返回正文、标题、结果载荷、幂等键、请求 hash、Cookie、access/refresh token。

`retained_journal_*` 是保留总量，`journal_tail_*` 是 revision 超过已持久化 checkpoint 的尾部。旧 gate 的 checkpoint 默认为 0，直到真实写入/持久化确认后更新，诊断不会猜测旧数据已落盘。`recovering_age_seconds` 使用实际状态进入时间；迁移前存量 recovering 以迁移时间作为基线。采样超时退出 1。

## 告警接线方案

部署后由现有监控/作业系统每 30 秒对明确试用 workspace 采样，收集结构化 JSON 和退出码；连续缺失两次或退出 1 报采集故障。不要通过本脚本自动发现和遍历所有租户。workspace/operation/page ID 只进入受控日志，不用作无限高基数的时序指标 label。

| 信号 | 阈值/级别 | 责任角色 | 处理 |
|---|---|---|---|
| COMMITTED_INTEGRITY_FAILURE | 任意一条，critical | 后端与协作值班 | 立即停新写；确认数据库事实、快照、备份，不重试原写 |
| PENDING_OVER_60S | 操作年龄 >60 秒，warning | 后端值班 | 查询同 operation，检查 worker/事务阻塞，保留预留 |
| RECOVERING_OVER_5M | recovering 状态年龄 >5 分钟，critical | 协作值班 | 排查 owner/fence/DB，升级人工，禁止删锁 |
| OUTBOX_OVER_5M | 最老未送达 >5 分钟，warning | 后端值班 | 查效果消费和重试；不能重做文档写入来补通知 |
| 采集失败/缺失 | 退出 1 或连续两次缺失 | 运维值班 | 查连接、SELECT 权限、RLS、模式和负载 |
| 越权、内容丢失、重复创建、fence 绕过 | 确认任意一次，停止放行 | 事故负责人 | 停新写、保护现场、回滚评估 |

通知接收人、升级渠道、去重键、恢复通知、静默窗口与送达回执由实际监控系统配置；本轮未向任何人发送通知。部署后必须注入测试告警，确认检测→送达→确认→恢复闭环，而不只验证脚本输出。

应用日志 DOCUMENT_RECOVERY_BATCH_FAILED、DOCUMENT_OUTBOX_RETRY 继续用于排查。新增受限 GET /api/agent-observability 和可选 AGENT_METRICS 日志提供 OAuth、刷新重放、冲突、事务/恢复耗时、checkpoint/维护失败及事件循环数据。入口要求登录、AGENT_OAUTH_ADMIN_USER_IDS 白名单和当前工作区管理权限；仅向受信任运维开放，响应不可缓存。优先通过现有日志采集每个节点，不向第三方 Agent 分发管理员 Cookie。

开启 AGENT_TELEMETRY_LOG_ENABLED=true 后按 instance_id 收集每分钟快照。使用 `node scripts/mcp/evaluate-metrics.mjs previous.json current.json` 判定窗口信号；退出 1 报采集失败、2 转告警、重启 baseline_required 重新建立基线。阈值、计数覆盖范围与直方图口径见 [监控合同](../test/p2-retention-observability.md)。采集器本轮没有接通外部通知，仍须执行上述送达演练。

## 恢复与回退

应用恢复 worker 每 5 秒扫描工作区（分页）并核对门闩/操作，在 PostgreSQL 锁和 fence 下决定终态，已 committed 的操作重试 live 同步；outbox 单独重试。先使用 get_operation、网页活动和上述只读诊断确认事实，观察下一次 worker 周期。恢复失败只按运行手册排查，不直接 UPDATE status、DELETE gate/Redis 锁、清空 journal 或换键重做请求。

没有面向任意运维人员的“强制恢复”接口。本次不增加绕过正常恢复协议的写库命令。持续异常由协作负责人在隔离副本复现，修复后通过兼容版本与原恢复路径处理；保留工单、诊断时间和前后状态。自动恢复的用户可见结果仍以持久化操作记录为准。

回退优先停新写并保留当前持久化协议版本。若拟回退至不理解新 journal/permit 的旧版本，必须停止新授权与写入、排空操作和协作连接、完成并验证二进制持久化、确保无未决状态、完成一致备份恢复演练；条件不满足不能仅关闭 MCP 后切旧程序。不得执行破坏性 down migration。

备份包含 pages.ydoc、journal、gates、operations、history、snapshots、outbox、grant/OAuth 状态和配额预留的一致快照。恢复环境必须隔离公网及 Redis；恢复后重新处理 generation、旧授权与执行资格，不能让恢复点后的旧执行者继续写。恢复 hash 对比、权限、历史和重放测试通过后才可能另行授权切换。

## 留存与容量准备

已实现默认关闭的有界清理，启用配置、对象窗口、保留名单和恢复限制见 [留存合同](../test/p2-retention-observability.md)。启用前确认所有节点理解 result_expired_at，实际备份窗口与 AGENT_RETENTION_BACKUP_DAYS 一致，保留名单一致，留存/注销例外有负责人。先在隔离恢复副本验证批次耗时与历史，再为批准范围启用；关闭开关不能恢复已经删除的载荷。AGENT_RETENTION_BATCH 记录各类清理数量，agent_maintenance_runs 在同一事务保存工作区计数审计；失败输出 AGENT_MAINTENANCE_FAILED，并增加 retention_failure。
