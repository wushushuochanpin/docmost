---
file: docs/iterations/20261026_01_identity-center/test/regression-checklist.md
description: 认证中心接入的regression-checklist记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 回归边界

密码登录、密码重置、邀请开户、设备会话列表/撤销、工作区隔离、文档打开与编辑、只读协作、Agent OAuth 授权页回流、MCP token权限、备份恢复均需按本次修改的影响验证。

默认关闭时不能要求真实中心可达或初始化 discovery。运行时数据库不可获得备份/迁移凭证。测试不连接生产数据库或Redis。
