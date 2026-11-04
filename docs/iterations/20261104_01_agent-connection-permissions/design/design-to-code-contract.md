---
file: docs/iterations/20261104_01_agent-connection-permissions/design/design-to-code-contract.md
description: 界面到代码的交接合同
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 14:39:39 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# Design-to-code 合同

复用现有设置页、表格、表单、对话框和国际化；原型状态 S1–S8 由 [交互合同](screen-state-inventory.md) 定义，视觉和组件细节以审阅后的原型为准。列表字段取连接管理响应，权限选择取服务端许可集合与工作区策略；令牌明文仅在创建响应内存态存在，不进入 URL、日志、持久化缓存或分析。按钮映射见交互矩阵；异步动作需禁重复、返回可见结果、失败保留输入。移动窄屏表单可滚动，保留焦点指示和键盘操作；无自绘图标或新视觉资源需求。
