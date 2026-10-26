---
file: docs/iterations/20261026_01_identity-center/sdd/SDD.md
description: 认证中心接入的SDD记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 接口与安全合同

沿用 React 18 / NestJS / Node 22 / PostgreSQL / Redis；不新增认证服务，不变更编辑框架。

## 模块

IdentityModule 负责中心 OIDC、短事务、绑定、本地准入及中心状态验证。SessionModule 负责随机浏览器凭证解析、会话时效与长连接撤销。外部身份无法替代本地工作区/页面授权。

## 接口

- GET /api/identity/status：公开返回当前工作区是否启用。
- POST /api/identity/bootstrap：同源服务端预登记随机pending handle，跨标签Web Locks串行；未登记/自选cookie不可激活。
- GET /api/identity/start?returnTo=...：服务端绑定白名单落点，创建短事务后跳转中心。
- GET /api/identity/account：会话鉴权后返回本人绑定状态，不泄漏令牌。
- POST /api/identity/link/start：已登录、同源和密码再验证，返回中心托管 URL。
- GET /api/identity/callback：原子消费绑定，调用中心 complete，以 code + PKCE 交换身份并验证 issuer/audience/nonce/签名/时效；映射本地成员后在数据库事务内激活预登记handle；回调不写Cookie。绑定流程保持原本地会话。

中心 complete 的 id 是该事务 state，Basic 客户端认证，空 JSON。最终实现必须以核实的中心源码合同为准。

## 会话

authToken Cookie 采用 HttpOnly、Secure（HTTPS）、SameSite=Lax。新中心会话使用随机 opaque 标识、数据库只存哈希；中心 access token 仅服务端加密。会话上限不得超过中心令牌寿命，首期不后台刷新，到期重新发起 SSO。

本地退出、中心禁用/撤销与网络故障关闭受保护访问。HTTP 在线验证必须有超时、并发合并；长连接采用有界周期校验加本地写入前检查。不能宣称实时零延迟，实际时限写入验证证据。

保留中心身份到已有 user ID 的一对一（工作区内）映射。新增迁移，不改既有迁移。不将中心角色/grants 引入本地授权。

当前无 sessionId 的旧JWT需重新登录；已有有效sessionId的本地JWT兼容。独立协作进程需导入会话运行模块及身份验证模块，具有相同issuer/client/加密键和隔离环境配置。
