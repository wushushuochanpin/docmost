---
file: docs/iterations/20261018_01_agent-document-mcp/design/prototype-authority.md
description: 记录原型的规划范围而不将需求稿冒充运行证据。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-19 11:56:57 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [design]
disclaimer: 本文可能更新，仅供参考；现状以当前代码、产品和源系统为准，拟议行为以正式评审后的需求为准，本文不代表功能已经实现。
---

# 原型计划

```yaml
prototype_authority:
  kind: executable_html
  entry: design/consent-prototype.html
  status: locally_reviewed_partial
  target_client: Web
  reuse_level: adapt
  linked_use_cases: [UC-01, UC-02, UC-03, UC-04, UC-05]
  screen_ids: [AUTH-CONSENT, AGENT-LIST, AGENT-DETAIL, AGENT-ACTIVITY, AGENT-POLICY, AGENT-AUDIT, EDITOR-BUSY]
  evidence: ["2026-10-19 headless Chrome: empty selection, submit, draft reveal, 375px overflow passed"]
```

本次交付完整PRD评审稿及设计输入，不宣称视觉设计定稿。正式前端施工前需补授权、撤销、互斥与未决结果的可执行状态演示；使用现有设置组件视觉，外部Agent使用占位场景。没有低风险原型豁免。

2026-10-19：补充许可与恢复状态可执行原型，按 adapt 迁移到 Mantine；仅 UC-01/UC-03 的基础状态已本地检查，其他管理页面仍为后续范围，不代表 P0 已验收。

P1 UC-04/UC-05：新增 `management-prototype.html`（adapt）。本地 Chrome 检查撤销确认/取消、错误回读、详情直达与 375px 布局通过；正式实现复用 Mantine、SettingsTitle、现有设置侧栏与用户角色，不复制原型模拟数据。页面路由映射为 account/agent-connections、详情与 activity 子路由，以及 agent-policy/agent-audit。

P1 最终状态：上述管理原型已迁移至完整应用，并完成权限、撤销、断网重试、直接路由和手机布局回归，证据见 [P1 业务报告](../test/p1-business-integration.md)。前文未完成状态为历史记录。
