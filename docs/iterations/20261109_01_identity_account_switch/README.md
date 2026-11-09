---
file: docs/iterations/20261109_01_identity_account_switch/README.md
description: Book SDK 接入与账号切换README.md规划。
created_at: 2026-11-09 14:25:49 Asia/Shanghai
updated_at: 2026-11-09 14:25:49 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 2026-11-09 用户要求、两项目现有源码和历史发布记录
applies_to: [identity, sdk, account-switch]
status: review
disclaimer: 本文仅供评审参考；实际代码、运行配置与验证证据优先，计划不代表实现或发布。
---

# Book：统一 SDK 登录与账号切换

状态：PRD/SDD 草案待评审；本次为规划，不表示已实施、发布或验收。沿用 Web、NestJS、PostgreSQL 及现有工作区权限模型。

[PRD](prd/PRD.md) · [SDD](sdd/SDD.md) · [实施及验证计划](implementation/plan.md) · [验收索引](machine/acceptance.json)

对应认证中心包位于同级 `company-identity-center/docs/iterations/20261109_01_identity_account_switch/`；先完成 SDK 契约及可消费制品，再按本包集成。
