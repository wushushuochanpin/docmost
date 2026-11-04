---
file: docs/iterations/20261104_01_agent-connection-permissions/README.md
description: Agent 连接与权限迭代文档入口
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 15:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# Agent 连接与权限管理

状态：本地实现与自动化验证完成，真实 Codex 通过；**豆包真实客户端、DCR-on-Codex 和部署验收未完成**，不代表已上线。迭代模式：existing_system_iteration。交互原型 S1–S8 已于 2026-11-04 经用户确认；当前候选工作树、测试环境与未完成项见 [验证证据](test/verification-evidence.md) 和 [验收清单](test/acceptance-checklist.md)。

阅读顺序：[PRD](prd/PRD.md) → [变更影响](prd/change-impact-assessment.md) → [交互合同](design/screen-state-inventory.md) → [SDD](sdd/SDD.md) → [任务拆解](implementation/task-breakdown.md) → [测试](test/test-plan.md) → [发布回滚](release/README.md)。

旧方案 [第三方 Agent 文档 MCP](../20261018_01_agent-document-mcp/README.md) 中“API key 永不写入”和“无动态注册”为本次拟变更范围；原有文档写入一致性、权限、审计与安全约束继续有效。冲突以本迭代经用户确认后的合同为准。
