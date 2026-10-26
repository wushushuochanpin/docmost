---
file: docs/iterations/20261026_01_identity-center/test/test-plan.md
description: 认证中心接入的test-plan记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 验证计划

基线：5de24fbc，工作分支 codex/identity-center-integration。证据层级分别记录单元/合同、真实数据库、构建、真实提供方与生产。

- 协议：错误 issuer/aud/nonce/state/verifier、签名/时效、重复回调、并发消费、独立三事务。
- 准入：未绑定、跨工作区、绑定冲突、密码错误、禁用用户、中心拒绝，无自动合并。
- 会话：opaque哈希、无/旧sessionId、撤销/过期、中心不可达、Socket握手、已有连接、只读协作连接。
- 前端：关闭开关无新入口；绑定提交；稳定错误反馈和重新开始；旧401不会清理新会话；退出不自动跳回。
- 集成：server/client build、migration-order、realtime-deployment、ProseMirror singleton（协作变更后文档页烟测）。
- 数据：真实一次性 PostgreSQL 16 + Redis 的 test:backup，恢复双工作区和 Y.Doc；迁移并发语义用真实PG验证。
- 生产：真实扫码与跨产品SSO不能用模拟提供方代替。CI仅共享ARC，收集同提交job→Pod与排空归零。

## 真实浏览器补充回归

Socket.IO异步认证与客户端首次registerClient消息存在竞态，必须用延迟认证测试验证消息等到认证就绪；认证失败和已断开连接不得登记或广播。Hocuspocus通用4401不等价全局会话过期，仅明确的Session ended可直接隔离，否则重新取协作令牌，由HTTP401确认。
