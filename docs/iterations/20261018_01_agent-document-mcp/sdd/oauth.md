---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/oauth.md
description: 独立OAuth授权服务的协议端点、数据绑定、刷新与撤销设计。
created_at: 2026-10-18 16:51:24 Asia/Shanghai
updated_at: 2026-10-18 16:51:24 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# OAuth接入

## 1. 协议、依赖与路由

首次支持MCP 2025-11-25及已验证兼容的2025-06-18/2025-03-26 Streamable HTTP，保持现有SDK 1.29.0；不冒称支持2026-07-28的新发现/消息语义。/mcp使用无协议session模式，POST JSON响应，GET/DELETE=405；initialize及版本头交给SDK并做白名单验证。2026协议升级独立评估，不是本轮先决条件。

授权服务选择标准OAuth授权码+PKCE，不创建OIDC登录产品；登录和MFA复用当前用户会话。协议库选型为MIT的@node-oauth/oauth2-server 5.x，通过单独adapter隔离。已核对官方PKCE及合规文档；上游主分支manifest标5.3.1，实际落库前必须核对已发布版本、integrity、依赖安全和Node22测试，再精确锁版本；本次未安装任何依赖。库不替代本项目resource、grant范围、原子令牌消费和CSRF设计。openid-client是客户端库，不能当授权服务器。

维护性：采用现有NestJS/Fastify和PG，不增加身份服务部署；库仅负责协议验证。回退：关闭自建OAuth及写工具，撤销新token，保留旧只读；不把OAuth令牌回退为网页登录token。不得复制官方ee/oauth代码。

设O为经配置验证的外部HTTPS origin，R=O+'/mcp'、issuer=O；二者不得从未经验证的Host/X-Forwarded头拼接。多个租户域名逐个登记origin，request host→workspace映射由已有租户解析器校验；共享域名通过用户选择workspace，grant仍只绑定一个workspace。授权请求的resource必须精确等于R，无fragment、多resource或任意URL拒绝。

| API ID | 方法/路径 | 身份与合同 |
|---|---|---|
| O01 | GET /.well-known/oauth-protected-resource/mcp | 公共元数据：resource=R，authorization_servers=[O]，4 scopes，bearer_methods_supported=[header] |
| O02 | GET /.well-known/oauth-authorization-server | issuer、authorization_endpoint=O+'/oauth/authorize'、token_endpoint、revocation_endpoint、S256、code、authorization_code/refresh_token；不声明未实现的注册机制 |
| O03 | GET /oauth/authorize | 校验客户端/redirect/resource/state/challenge/scope；创建10分钟授权请求，再跳自建Web同源/oauth/consent?request_id=... |
| O04 | POST /oauth/token | x-www-form-urlencoded；只支持authorization_code、refresh_token；返回Bearer、expires_in≤600、scope、refresh_token；no-store |
| O05 | POST /oauth/revoke | 客户端认证规则与token一致，未知token也200；只撤销其对应grant或family，不泄露存在性 |
| O06 | GET /api/agent-oauth/requests/:id | 交互登录session，返回已验证应用/回调域名/可选范围；不返回code/verifier |
| O07 | POST /api/agent-oauth/requests/:id/decision | session+CSRF；{decision,space_ids,scopes,duration_days}；响应{redirect_url}只取已登记回调 |

O01～O05需排除全局/api前缀，现有/mcp同理。Web consent路由与server authorize端点分开，避免SPA吞掉OAuth请求。

401挑战为 `WWW-Authenticate: Bearer resource_metadata="O/.well-known/oauth-protected-resource/mcp", scope="knowledge.read"`；API权限不足为403 insufficient_scope，MCP具体工具不足以结构化工具错误返回。元数据不含用户/空间信息。Origin存在时按客户端登记和可信Web来源校验，合法无Origin的CLI不因此拒绝；Cookie用于本站管理，不允许跨站credentialed CORS。

## 2. 客户端登记

首期预登记，不开放匿名DCR/CIMD自动取远程metadata。管理员在策略页登记应用名、client_type(public/confidential)、精确redirect_uris、允许scope、允许Web origin；client_id为随机UUID。confidential仅client_secret_basic，secret随机32字节只展示一次并hash存储；public不发secret，PKCE仍必需。机器不能自己声明为已批准应用。

redirect仅HTTPS；原生public客户端可登记loopback http://127.0.0.1或[::1]，端口可按RFC8252变化，但host、path、query必须匹配登记项，授权请求中的完整redirect绑定code并在换token时逐字相等。禁止泛域名、fragment、userinfo、开放重定向。原生动态端口例外不适用于普通Web应用。

P1挑选支持预登记client_id的两个独立客户端。只支持自动注册的客户端标为不支持，不能为了演示偷偷开放DCR；若目标客户端都不支持预登记，先修订接入设计并重做安全验证。

## 3. 授权码流程

1. O03验证注册信息和S256 challenge（43字符base64url SHA256）；state非空且≤1024字节，scope集合为登记允许子集，不接受重复参数歧义。state由客户端校验回传，不替代本站CSRF。
2. request行记录client、issuer、resource、redirect、原请求scopes、challenge、state、expiry。登录成功后绑定当前session；切换账号清除选择并重读。
3. O06只返回当前账号有权授权的空间，默认仅read；O07复核选定空间、当前工作区策略、选中scopes和最大期限。
4. 在同一PG事务锁request，写grant及grant_spaces，生成随机32字节code，DB只存SHA256，code TTL=60秒。request标consumed。码绑定user/client/workspace/grant/redirect/resource/PKCE。重复同一decision不能多发grant；为浏览器弱网回读，60秒内存加密redirect响应，过期后要求重新发起，不长期存明文code。
5. O04校验client身份、verifier长度43–128和S256、redirect、resource、code未过期；同事务消费code并发token。任何校验失败不发token，成功码再次兑换拒绝。
6. 成功回调带code、原state、issuer标识；拒绝只向已验证redirect回传access_denied/state/issuer。非法client/redirect在本站结束，不重定向。

## 4. Token与刷新

access token格式为`dma_`+32随机字节base64url；refresh token为`dmr_`+32随机字节。存SHA256（高熵随机秘密，非用户口令）以及issuer/resource/grant/client/family/expiry，所有比较通过hash索引。opaque使有效性依赖服务器授权事实，不与当前JWT ACCESS/API_KEY混淆。

每次/mcp验证access未过期、未撤销、family未撤销、grant有效、client有效、user未停用、workspace匹配，再算实际scopes=token发行范围∩grant当前范围∩策略。read scope是本期写scope的必要依赖。旧API_KEY/JWT只允许原只读工具；OAuth token不能访问任意/api或/collab，避免绕开工具范围。

刷新在事务内锁family和token，旋转一次后旧refresh标consumed；新access≤10分钟，新refresh不超过grant绝对到期。重用已消费refresh视为重放，撤销整个family及其access。合法客户端应串行刷新；刷新响应丢失无法重取明文新token，重新授权，不设置会放过窃取的无限宽限。

grant默认30天、1/7/30/90天可选，不因使用自动延长。缩权即时生效，扩大或延期新建授权；session密码重置/用户停用联动撤销，退出单浏览器不自动撤销应用（管理页明确）。token摘要与code过期数据按清理窗口删除，审计保留不带秘密。

## 5. 撤销与提交串行化

提交事务依次锁client(共享)、workspace-security(共享)、grant(共享)并重算ACL；撤销/缩权在相同顺序下锁grant(排他)。谁先取得可提交的锁并提交决定先后：提交先完成则已生效；撤销先提交则命令必须拒绝。撤销响应只在自身事务commit后返回。不得“查grant→释放锁→写文档”。

用户停用、空间成员/组/页面限制变化通过workspace-security排他锁串行化；跨工作区按ID排序。该粗粒度锁只在短事务持有，不在Markdown转换或网络调用期间持有，后续可细分但首期不牺牲正确性。撤销不等待15秒的候选构建，候选最终事务必须重新检查。

## 6. 来源

- [MCP 2025-11-25授权](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)：发现及资源服务器合同。
- [RFC9728](https://www.rfc-editor.org/rfc/rfc9728.html)、[RFC8707](https://www.rfc-editor.org/rfc/rfc8707.html)：资源元数据和resource绑定。
- [OAuth库PKCE说明](https://node-oauth.github.io/node-oauth2-server/guide/pkce.html)、[集成责任](https://node-oauth.github.io/node-oauth2-server/guide/compliance.html)：库默认值不能替代强制PKCE和存储事务。
