---
file: docs/iterations/20261026_01_identity-center/test/acceptance-checklist.md
description: 认证中心接入的acceptance-checklist记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:52:06 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 验收跟踪

AC01–AC08 定义见 [PRD](../prd/PRD.md)，证据见 [verification-evidence](verification-evidence.md)。下列勾选只表示本地实现与定向验证通过，真实中心上线验收单独保留。

- [x] AC01 默认关闭、工作区灰度入口；组件及关闭状态浏览器检查通过。真实跳转/扫码待登记 client 后验收。
- [x] AC02 验证本地密码后绑定；身份唯一约束、跨工作区拒绝，无邮箱自动合并。
- [x] AC03 未绑定身份拒绝，保留现有邀请准入；未引入自动开户。
- [x] AC04 原子激活本地随机会话，保留本地权限；真实文档打开并可编辑。
- [x] AC05 协议负例、重放、三个独立事务、同一凭据仅一个活动会话、迟到回调和登出竞态通过。
- [x] AC06 HTTP/Socket.IO/协作会话撤销与前端代次隔离定向测试通过；真实浏览器退出拒绝旧会话。中心和多实例的真实撤销时延仍待验收。
- [x] AC07 MCP 独立授权：5 项 guard 适配回归通过；独立 grant 优先、撤销不回退、真实 Passport 策略拒绝中心签名 JWT、当前 opaque 会话回退和撤销拒绝。真实 Agent OAuth→MCP 流程仍需上线前回归。
- [ ] AC08 迁移顺序、构建、真实备份恢复通过；独立 client、真实扫码/SSO、移动端与共享 ARC 候选证据尚未完成。

本期不宣称整体生产验收完成，不启用生产开关。
