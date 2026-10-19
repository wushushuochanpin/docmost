---
file: docs/iterations/20261018_01_agent-document-mcp/public/README.md
description: 第三方 Agent 接入入口与受支持的授权流程。
created_at: 2026-10-19 14:18:03 Asia/Shanghai
updated_at: 2026-10-19 14:27:15 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认 PRD/SDD、当前 OAuth/MCP 代码和本地验收结果
applies_to: [implementation, release]
disclaimer: 文档可能更新，仅供参考；当前代码、产品与原始验收证据优先。未部署，文中 HOST 为占位地址，不是已开放服务。
---

# 第三方 Agent 接入

本包用于独立实现的 Docmost MCP，不依赖官方商业 MCP。当前为待发布接入文档，尚无可用公网地址。接入前由实例维护者提供真实 HTTPS 地址、预登记 client_id 和沙箱空间。

- [开发者指南](developer-guide.md)：登记、OAuth、工具、示例、错误和保留政策。
- [客户端兼容矩阵](client-compatibility.md)：精确版本与实测边界。
- [运维手册](../release/p2-operations.md)：启停、诊断、告警、恢复和回退。
- [部署后验收清单](../release/p2-deployment-gates.md)：哪些已在本地验证、哪些不得提前勾选。

公开不是匿名写入。第三方 Agent 必须通过用户主动 OAuth 授权；权限同时受客户端允许范围、用户选择的 scope/空间、当前 ACL 和工作区写入策略限制。授权不会赋予管理员绕过私密文档 ACL 的能力。
