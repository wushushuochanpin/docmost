---
file: docs/operations/kubernetes-deployment/README.md
description: Docmost production Kubernetes architecture, delivery boundary, initial cutover, verification, and recovery runbook.
created_at: 2026-10-20 08:46:35 Asia/Shanghai
updated_at: 2026-10-21 09:43:30 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: .github/workflows/deploy.yml, deploy/k8s/production, and the live xenzify-dev K3s cluster
applies_to:
  - operations
  - architecture
  - deployment
disclaimer: 本文可能更新，仅供参考；当前代码、实际运行状态和源系统优先。
---

# Docmost Kubernetes production

## Runtime boundary

`book.superchat.help` 的应用进程运行在 `xenzify-dev` 单节点 K3s 的 `docmost`
namespace。宿主 Nginx 代理固定 ClusterIP `10.43.30.30:3000`。PostgreSQL 和 Redis
暂时保留在原 Compose 数据卷中，只通过节点私网 `10.3.0.16` 暴露给集群 Service；
普通发布不重启这两个依赖，也不操作宿主 Docker。

应用存储使用 Retain PV `docmost-storage`，宿主路径为 `/var/lib/docmost/storage`。
应用 Secret 为集群内 `docmost-env`，不进入仓库。GitHub ARC Runner 使用独立的
`arc-systems/docmost-deployer` ServiceAccount，仅获得 `docmost` namespace 发布权限。

## Delivery path

合并到 `main` 会触发 `.github/workflows/deploy.yml`：

1. ARC Runner 构建 `linux/amd64` 镜像并推送 GHCR。
2. 工作流取得构建产物 digest，先以同一镜像执行独立迁移 Job，成功后渲染 `runtime.yaml`；可变 tag 不进入 Deployment。
3. 通过 Kubernetes server-side dry-run 后更新 Service 和 Deployment。
4. 等待滚动发布，核对运行镜像，检查 Pod 内 `/api/health` 和公网健康状态。
5. apply 后任一步失败时恢复上一条 Deployment image，并保留集群诊断。

仓库门禁 `scripts/check-k8s-deployment.py` 禁止恢复 SSH、服务器源码构建和 Compose
应用发布路径。Release workflow 与生产 Deploy workflow 是不同入口：前者创建版本发布，
后者部署合并后的精确 SHA。

## Initial migration

首次迁移需要在合并后的服务器 checkout 上运行：

```bash
scripts/bootstrap-docmost-k8s.sh
```

它创建 Retain PV/PVC、最小 RBAC 和依赖 Service，复制现有应用存储，给 Postgres/Redis
增加节点私网映射，并从服务器 `.env` 生成集群 Secret。等新 Deployment Ready 且内部
健康检查通过后运行：

```bash
scripts/cutover-docmost-k8s.sh
```

切流脚本先验证 K8s upstream，再校验并 reload Nginx；公网健康后只停止旧 Docmost
应用容器。它不会重启宿主机、数据库、Redis 或整组 Compose。

## Verification and recovery

验收至少包括 source SHA 注解、image digest、Pod Ready、数据库与 Redis 健康、公网
`/api/health`、首页资源以及本次用户路径。UI 改动仍需浏览器真实交互，HTTP 200 不能
替代该证据。

普通发布失败由 workflow 恢复上一 digest。首次切流失败时，脚本自动恢复 Nginx 文件；
若需人工回到旧运行时，先启动旧 `docmost` 容器，确认 `127.0.0.1:3000/api/health`，
再把 Nginx upstream 恢复到 `127.0.0.1:3000`，执行 `nginx -t` 和 reload。不要重启服务器。

## MCP OAuth runtime configuration

`docmost-env` 是生产运行配置的唯一注入来源。MCP 设置页总开关存于工作区，
`AGENT_OAUTH_ENABLED` 与 `DOCUMENT_COMMAND_ENABLED` 则由服务器配置控制；
`GET /api/agent-capabilities` 在登录后分别返回这两个服务的开关状态，不返回秘密。

启用前保留数据库、附件、Secret 和 Deployment 的受限备份。为应用创建独立的
`docmost_runtime` LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE 账号，
仅授予 docmost 数据库连接、public schema 使用、现有表 SELECT/INSERT/UPDATE/DELETE、
序列 USAGE/SELECT；为原迁移所有者设置相同的后续默认授权。不要授予 superuser 角色成员资格，
也不要关闭 FORCE RLS。原管理员账号只用于受控迁移和备份，不再注入应用。

应用使用受限账号后，发布工作流使用同一镜像的独立 Job 执行
`node apps/server/dist/database/migrate.js latest`。迁移凭据仅由 `docmost-migration-env`
注入该 Job；Job 失败时不发布应用，完成后 24 小时自动清理。迁移所有者为原 `docmost`，
新增对象沿用上述默认授权。应用 Pod 不得引用该 Secret；部署 Role 只在 docmost namespace
增加 Job 管理权限。没有新增迁移时，应用启动仍会检查现有迁移记录。

在 `docmost-env` 中配置：

- `DATABASE_URL`：上述受限账号，现有数据库地址和数据库名保持不变。
- `AGENT_OAUTH_ENABLED=true`、`DOCUMENT_COMMAND_ENABLED=true`。
- `AGENT_OAUTH_ORIGIN=https://book.superchat.help`。
- `AGENT_OAUTH_ADMIN_USER_IDS`：允许登记客户端的明确账号 ID。
- `AGENT_OAUTH_RESPONSE_KEY`、`DOCUMENT_COMMAND_SIGNING_KEY`：分别生成的 32 字节 Base64 秘密；
  已配置时保留原值。仅保存在集群 Secret 和受限备份中。

配置先在恢复副本中验证，数据库、Redis、存储与生产隔离，禁止向外发送通知。
生产 Secret 更新后通过正常合并发布注入新 Pod；发布后检查 OAuth 发现、旧 API 密钥读取、
真实文档编辑及有授权的 MCP 创建/读回，再开启工作区试用范围的写入。

可在 Agent 策略中停用新增写入，保留已保存内容和读取。已产生文档 journal/gate 后，
不要通过恢复超级用户连接、关闭文档命令协议或切换到不兼容版本回退。
本次启用前备份位于 `/root/backups/docmost_mcp_oauth_20261021`，不纳入清理范围。
