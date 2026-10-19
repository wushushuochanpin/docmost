---
file: docs/iterations/20261018_01_agent-document-mcp/design/design-to-code-contract.md
description: 当前P0交互的组件映射和验证边界。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-19 10:56:06 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [design]
disclaimer: 本文记录本地实现与测试事实，不代表生产部署或完整产品放行。
---

# 设计到代码输入

PRD / SDD 已确认。P0 许可与恢复原型为 [consent-prototype.html](consent-prototype.html)，状态 locally_reviewed_partial；连接管理、策略和审计界面仍未交付。

| 交互 | 正式组件 | 已验证 |
|---|---|---|
| 许可空间/scope/期限、允许/拒绝 | features/agent-oauth/consent-page.tsx | 真实 React 组件 + HTTP 服务、CSRF、空选择禁用、许可回调、375px |
| 文档占用/持久化状态、查看草稿/重试 | features/editor/page-editor.tsx + durable/* | 双节点 provider + 完整 PageEditor 输入、保存、草稿空态、故障只读与重试 |
| 历史归因和带版本确认恢复 | page-history/history-item + use-history-restore | 完整历史面板归因、取消、冲突、恢复、双方同步、移动布局与选择保持 |

复用现有 Mantine、路由、登录会话、确认弹窗和 Tiptap。恢复只展示当前账户的隔离草稿供手工复制，不自动覆盖。服务端错误使用稳定错误码，不暴露堆栈。具体边界和证据见 [P0报告](../test/p0-business-integration.md)。
