---
file: docs/iterations/20261026_01_identity-center/test/verification-evidence.md
description: 认证中心接入的verification-evidence记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:52:06 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 验证证据

候选：`codex/identity-center-integration` 工作区，基线 `5de24fbc`，尚未提交、推送或部署。以下是 2026-10-26 本地执行证据，不是 CI 或生产验收报告。

| 验证项 | 结果与范围 |
| --- | --- |
| 客户端定向回归 | 9 个测试文件、93 项通过；包括身份入口/绑定/失败回流、会话失效、旧响应隔离、4401 边界、真实待处理查询取消、树模型与创建默认值 |
| 服务端定向回归 | 15 个套件、87 项通过，无跳过；包括身份协议与回调、11 项真实 PostgreSQL 原子性/约束用例、HTTP 会话、退出、Socket.IO 认证完成前消息、协作撤销、敏感 URL 日志脱敏 |
| OIDC 协议集成 | `node --test apps/server/src/core/identity/identity.oidc.integration.mjs`：10 项通过；真实 openid-client、RSA/JWKS 签名、nonce、issuer、audience、过期、auth_time/maxAge；提供方为本地测试服务，不代表真实扫码通过 |
| MCP 适配回归 | `pnpm --filter server exec jest --runInBand core/agent-oauth/agent-mcp-auth.guard.spec.ts`：5 项通过；实际 Passport JWT 策略，授权仓库和 SessionService 为 mock，不替代真实 MCP 端到端验收 |
| 完整构建 | `pnpm run server:build` 通过，包含 client 与 server 构建；Node.js 22.23.0 |
| 静态检查 | 修改的服务端 TypeScript ESLint 通过；ProseMirror singleton、realtime deployment、migration order 三个守卫通过 |
| 真实备份恢复 | `pnpm run test:backup` 通过：一次性 PostgreSQL 16/Redis，真实 worker 排队、归档、全新库恢复；两个工作区、RLS 表、Y.Doc 二进制、附件完整；权限错误无重试掩盖 |
| 浏览器实测 | Chrome 打开既有测试文档，`.tiptap.ProseMirror[contenteditable=true]` 可见，无“页面加载失败”；退出 200，重进受保护页跳登录，中心关闭时入口隐藏，无未处理异常 |
| 独立协作进程 | 独立 collab 进程在隔离 PG/Redis 配置启动，健康接口 200；未替代跨实例撤销延迟实测 |

浏览器结果见 [browser-evidence.json](browser-evidence.json)。原始本机日志位于 `/tmp/docmost-identity-runtime/`：`final-client-tests.log`、`final-all-server-tests.log`、`final-oidc.log`、`final-build.log`、`final-eslint.log`、`final-backup.log`、`browser.log`。这些是本次临时运行记录，不是持久 CI 报告。

测试数据库和 Redis 是专用一次性依赖，通过 SSH 隧道访问，未连接生产数据库/Redis，未创建 CI runner。备份回归使用专用只读备份角色验证；HTTP 进程未接收备份/迁移凭证。

尚未完成：真实中心独立 client 登记与权限验证、真实扫码及跨产品 SSO、移动浏览器专项验收、真实跨实例撤销时间测量、生产部署及同一候选提交的共享 ARC job→Pod/排空归零证据。以上仍为发布门槛；默认 `IDENTITY_ENABLED=false`，不以模拟提供方和本地测试替代。
