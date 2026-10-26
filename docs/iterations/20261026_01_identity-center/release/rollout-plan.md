---
file: docs/iterations/20261026_01_identity-center/release/rollout-plan.md
description: 认证中心接入的rollout-plan记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 灰度与回退

默认关闭 identity 功能。部署前登记独立 client、精确HTTPS callback、托管事务资格、可用 issuer、重新登录入口与所需检查权限。秘密仅进服务器 secret 存储。

先追加迁移，再部署兼容会话代码，在独立测试环境验证真实扫码、已有中心SSO、取消/重放、无权限、禁用/撤销和长连接。生产开关仅在验收后启用，不复用 Prism client 或密钥。

CI 使用现有共享ARC，选择实际已核实队列；同一候选提交取得job→Pod及排空自动归零证据。数据库改动必须过备份恢复门槛。生产部署后的真实备份与本地/COS校验仍为独立门槛。

回退先关闭新登录入口并撤销中心会话，保留原用户和身份映射，不删除已迁移数据。不要将opaque Cookie交给只认识JWT的旧版本；如需回退旧二进制须清理新会话并要求重新密码登录。普通用户密码入口暂保留，不启用 enforceSso。

## 本轮明确边界

- 首期不后台刷新中心令牌，到期重新SSO；中心账号/令牌拒绝时中心登录会话fail closed。
- 普通退出只撤销本产品会话。MCP已授权grant保持独立，中心退出不会隐式撤销Agent授权；本地用户禁用仍阻断MCP。中心禁用不自动改写本地账号状态或成员权限。
- 灰度仍保留本地密码，不能宣称已强制全员中心准入；确认迁移完成前不启用enforceSso。
- 存在本地MFA要求的账号/工作区，中心认证等级尚未完成映射时明确拒绝中心绑定/登录，继续原登录方式。
- 认证入口要求HTTPS和Web Locks；缺少跨标签锁的浏览器显示不支持并保留本地登录，不降级绕过绑定。
- 本机撤销立即关闭已登记连接；其他实例每5秒巡检。中心检查单请求5秒超时、同令牌并发合并、最多8个会话并行巡检。实际断连上界还含排队/网络时间，负载与多实例SLA待真实环境验收。
- 若独立部署协作进程，必须同步其IDENTITY_ISSUER/CLIENT_ID/CLIENT_SECRET/ENCRYPTION_KEY等服务器配置，否则身份校验安全拒绝。
- 公网真实微信扫码、跨产品SSO、仅认证client的introspection/userinfo/account资格、共享ARC同提交job→Pod及归零未在本次本地验收中取得，不能以单元测试替代。
