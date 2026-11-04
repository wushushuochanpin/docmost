---
file: docs/iterations/20261104_01_agent-connection-permissions/test/verification-evidence.md
description: 本次实现的可复现验证记录
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 15:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 本次候选工作树、隔离 PostgreSQL 16/Redis、真实 Codex 客户端
applies_to: [agent, mcp, permissions]
disclaimer: 本地自动化与真实 Codex 通过不等于豆包真实客户端、部署或生产验收通过。
---

# 验证证据

候选基线：`916433bf` + 本次未提交工作树（无部署、无迁移应用到业务库）。所有测试使用一次性 PostgreSQL 16.14、Redis 7.4.4、Node.js 22.23.0；P0/P2 测试不读取 `.env` 业务数据库。

## 已通过

| 层 | 命令/证据 | 结果 |
|---|---|---|
| 服务端单测 | `pnpm --filter server test --runInBand` | 45 suites / 301 passed，11 skipped；0 failed |
| 客户端单测 | `pnpm --filter client test` | 20 files / 169 passed |
| 构建 | `pnpm run server:build`、`pnpm --filter client build` | 通过 |
| P0/P1/P2 隔离集成 | `apps/server/test/agent-mcp-p0/run.mjs`（`P0_PG_BIN` / `P0_REDIS_BIN` / `P0_OAUTH_MODULE`） | 13 suites / 161 tests passed；含全应用浏览器、协作、历史、恢复、Y.Doc、双客户端 |
| 新连接权限 | `connection-permissions.spec.ts` | 11 tests passed：DCR 注册/元数据/授权/同意/token/MCP 编辑、API 令牌默认只读/空间/写/升权确认/降权提交屏障/撤销幂等/过期/旧令牌兼容 |
| DCR 安全负例 | 同上 + 既有 `oauth.spec.ts` / `oauth-business.spec.ts` | 非法回调、limit、关闭开关、未知字段、PKCE/resource/refresh 重放、hostile Origin 拒绝 |
| 真实 Codex | `P2_ACCEPTANCE=true` + `P1_CODEX_BIN=~/.codex/plugins/.plugin-appserver/codex-cli/bin/codex`；报告 [codex-p2-probe.json](codex-p2-probe.json) | `codex-cli 0.166.0-alpha.5.1`：真实 PKCE 授权、工具发现、读取、新建文件夹/文档、编辑、读回、幂等重放、禁写拒绝、撤销后拒绝；预登记公开客户端路径，不是 DCR |
| 数据库迁移 | 一次性 PostgreSQL 16 上执行全部 `dist/database/migrations` | 69 个迁移全部成功；新表列/触发器/`document_operations.credential_*` 已核验 |
| 迁移顺序 | `pnpm run security:migration-order` | 通过 |
| 备份恢复 | `BACKUP_TEST_PG_BIN=.../pg16/bin BACKUP_TEST_REDIS_BIN=.../redis-server pnpm run test:backup` | 通过；真实 worker 队列、归档、全新 PostgreSQL 恢复，两个 workspace、RLS 表、Y.Doc 字节和附件完整 |
| 安全/打包门禁 | `security:workspace-scope`、`guard:prosemirror-singleton`、`guard:realtime-deployment`、`guard:bundle-integrity` | 全部通过 |
| 交互原型 | [S1–S8 可执行原型](../design/agent-connections-prototype.html) | 用户于 2026-11-04 15:04 确认按原型实施 |

## 未通过/未验证

- **AC01 豆包工作真实客户端：未验证。** 本机 DoubaoWork 2.34.12 的连接器指向其生产服务（`book.superchat.help`）并保存既有生产 Bearer 令牌；没有可用的隔离测试环境、可驱动的浏览器授权或客户端测试凭据。没有把本地模拟 DCR 写成豆包真实通过。本轮只验证了 DCR 协议、同意、token、MCP 工具调用的本地端到端路径，以及既有只读 MCP 工具集的自动化回归。
- **Codex 动态注册：未验证。** 本轮真实 Codex 使用预登记公开客户端，与既有 P1/P2 路径一致；Codex 是否支持 DCR 仍需独立实测。
- **AC08 灰度、部署、线上同一候选身份及真实队列备份：未执行。** 发布开关默认关闭；部署与回退演练未在真实环境完成。
- 本轮没有向业务数据库应用迁移，也没有部署。

## 复现提示

- 测试需要显式设置 `P0_PG_BIN`、`P0_REDIS_BIN`、`P0_OAUTH_MODULE`；本机工具来自一次性构建的 PostgreSQL 16.14 与 Redis 7.4.4。
- `P0_OAUTH_MODULE` 指向 `@node-oauth/oauth2-server@5.3.1`，P0 脚本会校验版本。
- 真实 Codex 报告中的 `deployment: none` 表示临时运行时配置，不是桌面端持久连接。
- 旧 API 令牌仍走原 `/integration-keys/*` 路径和 MCP 只读工具；新 MCP 令牌只允许 `/mcp`，列表不返回明文。
