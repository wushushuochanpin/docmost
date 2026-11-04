---
file: docs/iterations/20261104_01_agent-connection-permissions/test/acceptance-checklist.md
description: 验收检查表与当前证据边界
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 15:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 本次候选工作树与隔离测试结果
applies_to: [agent, mcp, permissions]
disclaimer: 勾选表示本候选提交有对应自动化证据；豆包真实客户端和部署未完成，不得据此宣称已上线。
---

# 验收清单

- [ ] AC01 豆包真实 OAuth 授权与读写回读。**未验证**：本机客户端绑定生产连接器，无可驱动的隔离授权；本地 DCR/同意/token/MCP 编辑自动化通过，不能替代真实豆包。
- [x] AC02 Codex 预登记兼容与真实读写。**通过**：`codex-cli 0.166.0-alpha.5.1` 真实 PKCE、发现、创建/编辑/读回、幂等、禁写和撤销拒绝；DCR 支持仍未实测，见 [证据](verification-evidence.md)。
- [x] AC03 API 令牌生命周期、权限和旧令牌兼容。**通过（服务端/HTTP/UI 创建冒烟）**：默认只读、空间、写、一次展示、列表、降权、用户明确升权、撤销、过期；旧令牌保持只读 MCP 和原 HTTP 行为。
- [x] AC04 OAuth 授权、缩权、重新授权升权与撤销。**自动化通过**：既有 OAuth 生命周期、DCR 端到端、缩权/撤销和重放测试；真实豆包重新授权未验证。
- [x] AC05 租户/对象权限、策略及撤销竞争。**通过**：两工作区/多用户矩阵、跨租户/猜 ID、最终提交授权屏障、API 令牌降权竞态。
- [x] AC06 协作、Y.Doc、幂等与审计。**通过**：全应用浏览器、协作节点、Y.Doc 字节、历史/恢复、幂等和 outbox 回归。
- [x] AC07 DCR 安全、资源绑定和滥用防护。**通过（自动化）**：严格回调、loopback/HTTPS、未知字段、限流/数量上限、关闭开关、PKCE/resource/refresh 重放、hostile Origin；未抓取外部 URL。
- [ ] AC08 迁移、备份恢复、灰度与回退。**部分**：一次性 PostgreSQL 16 全迁移、顺序检查、备份恢复两个 workspace + Y.Doc 通过；未部署、未做线上灰度/回退/同候选身份验收。
