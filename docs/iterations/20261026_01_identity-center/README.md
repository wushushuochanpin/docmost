---
file: docs/iterations/20261026_01_identity-center/README.md
description: 认证中心接入的README记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 认证中心接入

状态：用户已于 2026-10-26 接受盘点建议并授权并行实施；本地实现与定向回归完成；默认关闭，未发布。
迭代模式：existing_system_iteration。目标平台：现有 Web；移动浏览器定向验收，原生 App/小程序不在本次范围。

- [需求和接受边界](prd/PRD.md)
- [变更影响](prd/change-impact-assessment.md)
- [交互合同](design/design-to-code-contract.md)
- [技术合同](sdd/SDD.md)
- [构建顺序](implementation/task-breakdown.md)
- [验证计划](test/test-plan.md)
- [实际验证证据及未完成项](test/verification-evidence.md)
- [上线与回退](release/rollout-plan.md)

用户批准的是渐进接入、验证后绑定、仅邀请准入；不等于生产 client 已登记或已完成真实扫码。当前代码与验收证据优先于设计预期。

依据：[统一认证中心接入指南（2026-10-26）](https://book.superchat.help/s/general/p/sdk-sso-f8dQ5HTIdR)。实际中心client登记与真实提供方验收不由本地测试替代。
