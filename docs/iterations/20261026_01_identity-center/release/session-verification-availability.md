---
file: docs/iterations/20261026_01_identity-center/release/session-verification-availability.md
description: 认证中心短暂不可用被误判为会话撤销的线上事件、修复与中心契约。
created_at: 2026-11-03 23:20:00 Asia/Shanghai
updated_at: 2026-11-03 23:20:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 2026-11-03 线上只读日志、会话表、认证中心日志、OIDC discovery 与客户端登记库
applies_to: [identity-center, production, session]
disclaimer: 本文记录实际证据与本地修复；线上镜像尚未发布，不能据此宣称线上问题已解决。
---

# 事件结论

`book.superchat.help` 的“登录状态已变化”不是多标签页或 60 分钟到期造成的，而是认证中心一次短暂变慢被当成了账号撤销。

实际链路：

1. 协作连接每 5 秒复核一次中心。复核由 introspection、userinfo、`/api/get-account` 三个请求组成。
2. 中心在 2026-11-03 21:07:18–21:07:32、22:01:30–22:01:42 出现请求空档；Docmost 的 5 秒超时先失败。
3. `IdentityProvider.verifyRemote()` 把所有异常都转换成 `UnauthorizedException`；`SessionConnectionsService` 把任何复核异常都当成撤销。
4. 同一时刻 `/api/users/me` 返回 401，客户端 `invalidateAuthSession()` 清空会话并弹出“登录状态已变化”。
5. 用户被带到登录页后，`/api/identity/bootstrap` 又一次调用中心复核；中心仍慢时，bootstrap 把“无法确认”当成“凭证失效”，调用 `cancelBrowser()` 撤销了本来仍有效的本地会话。于是必须重新完成一次 SSO，出现持续数分钟的反复弹窗。

# 线上证据

- 22:27:56 协作连接被服务端关闭；22:27:58 用户已经出现在 `/login?logout=1...`，但同一时刻 `POST /api/users/me` 仍返回 200，22:27:59 `POST /api/auth/collab-token` 也返回 200。这说明会话没有被撤销，是协作连接复核失败触发了客户端全局失效提示。
- 21:07:26、22:01:47、22:06:09、22:10:34、22:18:32 均有浏览器 `POST /api/users/me 401`。
- 对应本地会话在 21:07:27、22:01:47 被写入 `revoked_at`；21:07:36、22:18:59 才创建新会话。bootstrap 在中心复核失败后取消浏览器句柄，进一步把“无法确认”变成了真正的会话撤销。
- 认证中心访问日志的 userinfo/get-account 在 21:07:18.9 → 21:07:32.2（约 13 秒）和 22:01:30.8 → 22:01:42.6（约 12 秒）出现空档；空档结束后中心恢复 allow。
- 22:28:51（北京时间）出现 `DOCUMENT_PERMIT_EXPIRED`；同一文档持续出现 `Missing workspace in collab store context`。
- 线上运行镜像为 `ghcr.io/wushushuochanpin/docmost@sha256:7129fb51...`，本次修复未发布。

# 60 分钟边界

认证中心 `docmost-book` 客户端当前登记为：

- `grant_types = ["authorization_code"]`
- `expire_in_hours = 1`
- `refresh_expire_in_hours = 0`
- `disable_refresh_rotation = 0`

Docmost 只请求 `scope=openid profile`，没有 `offline_access`，也没有 refresh token。因此当前没有可安全调用的续期接口；本地会话被限制在中心 access token 到期时间是正确的，不应自行延长。60 分钟只能解释每小时重新登录，不能解释分钟级弹窗。

# 本地修复

- 中心复核区分“确定的撤销/账号禁用/令牌到期”和“网络、超时、5xx、限流、响应不可解析”。
- 暂时不可用时 HTTP 返回 503（不是 401）；Socket.IO 发出 `SessionVerificationUnavailable`，不触发全局登出。
- 协作连接在暂时不可用时立即置为只读并停止接收写入；10 秒有界窗口内恢复则原地恢复，超过窗口才用 1013 “Session verification unavailable”关闭并让客户端重连。数据库撤销、退出、禁用和到期仍即时生效。
- `identity/bootstrap` 只做本地会话检查；只有本地明确失效才取消浏览器句柄并重新登录，数据库/中心不可用不会撤销有效会话。
- durable 文档更新使用 `skipStoreHooks` 的本地 Yjs origin，不再触发无 workspace 的通用持久化；通用持久化在缺少 workspace 时抛错以阻止卸载未保存文档。
- durable 更新被许可/owner 拒绝时返回结构化 `document_update_rejected`，不再产生未处理的 `DOCUMENT_PERMIT_EXPIRED`；客户端保留本机草稿并要求显式恢复。
- 编辑恢复草稿 ID 与 IndexedDB 读取 scope 均包含 workspace、user、page，避免跨账号/工作区串用。

# 需要认证中心确认/提供的契约

1. 是否为 `docmost-book` 启用 `refresh_token`，设置 `refresh_expire_in_hours > 0`，并明确是否轮换 refresh token。
2. refresh token 在退出、账号禁用、中心会话撤销后的失效语义与最大生效时延。
3. `introspection` 在禁用/撤销后返回 `200 {active:false}` 还是 401/403；这是当前“确定撤销”的唯一权威信号。
4. refresh 的错误码（至少 `invalid_grant`、`invalid_client`、`temporarily_unavailable`、`server_error`）及 5xx/429 的语义。
5. `/api/get-account` 对 `isForbidden`、`isDeleted`、未知状态的返回契约。
6. 中心对 introspection/userinfo/get-account 的速率限制与建议轮询间隔。

在这些确认之前，不实现 refresh，不延长本地会话，也不让已撤销会话复活。

# 验证边界

已通过：服务端受影响 7 个测试套件 54 项；客户端全量 169 项；server/client 构建；ProseMirror、realtime、workspace-scope、bundle-integrity 守卫。

尚未完成：真实浏览器中的故障注入（中心超时/5 秒恢复/持续不可用）、真实中心 refresh 契约、线上灰度与回滚验证。全量服务端测试中 `sanitize-filename` 模块互操作、page controller、attachment utils 三组失败为本次未触及的既有环境问题。
