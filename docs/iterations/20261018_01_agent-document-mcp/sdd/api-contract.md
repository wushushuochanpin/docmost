---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/api-contract.md
description: 十一项MCP工具及管理接口的参数、结果与错误合同。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-19 11:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 接口合同

传输沿用POST /mcp、Streamable HTTP与现有SDK支持的协议协商；GET/DELETE仍405。OAuth发现与端点见[oauth.md](oauth.md)。工具错误使用MCP工具结果isError=true并返回structuredContent；传输层401/403用于认证/协议拒绝，429附Retry-After。无权限资源统一RESOURCE_NOT_FOUND_OR_FORBIDDEN，避免泄漏其存在。

## 1. 参数通则

新增工具对象拒绝未知字段；ID为UUID，page_size默认50最大100，cursor不透明并签名。title按Unicode码点1–200，不允许全空白。Markdown总UTF-8字节≤256KiB，ops长度1–20。版本及block_ref不可由客户端自行拼接。写入必填idempotency_key（1–128 ASCII）；preview=true不登记写操作、不消耗写配额，也不占长期门闩，但使用独立预览限额。公开JSON Schema应与DTO由同一源生成，并做golden测试。

| 工具 | 参数（*必填） | 返回与作用域 |
|---|---|---|
| search | 保持现有query及分页契约 | knowledge.read；过滤当前ACL与已授权空间后分页计数 |
| fetch | 保持现有资源标识契约 | knowledge.read；返回现有格式，不能借资源URL跨租户 |
| get_page | 保持现有page_id等契约 | knowledge.read；补充snapshot_revision标识检索快照时效 |
| list_pages | 保持现有空间/父节点/分页契约 | knowledge.read；游标绑定grant及筛选条件 |
| list_spaces | cursor?,page_size? | knowledge.read；只列grant允许且当前可访问空间，id/name |
| get_edit_context | page_id*,cursor?,page_size? | pages.edit+knowledge.read；generation、version_token、blocks、next_cursor、editable、busy、supported_operations |
| create_folder | space_id*,parent_id?,title*,idempotency_key*,preview? | folders.create+knowledge.read；parent为空仅创建根文件夹；否则父必须folder |
| create_page | space_id*,parent_id*,title*,markdown*,idempotency_key*,preview? | pages.create+knowledge.read；父必须folder，禁止根文件 |
| update_page_metadata | page_id*,title*,version_token*,idempotency_key*,preview? | pages.edit+knowledge.read；只改标题，禁止夹带parent/ACL字段 |
| edit_page | page_id*,version_token*,ops*,idempotency_key*,preview? | pages.edit+knowledge.read；append/prepend含markdown，replace_block含block_ref和markdown |
| get_operation | operation_id，或idempotency_key+tool（两种互斥） | knowledge.read；只能查询相同用户/client/grant的操作；当前权限仍校验 |

现有四项读取工具的参数名、默认分页和输出应在施工前从本地注册函数固化为契约fixture；本方案不重命名现有入参。授权过滤必须发生在数据库查询/搜索结果二次过滤阶段，不可先泄漏摘要再过滤。

get_operation的tool是按工具隔离幂等键所需的消歧字段；这不是新增业务能力。用户失去页面读权时只能获得自身操作的非内容状态，不返回标题、正文、版本或链接；grant已撤销则整个token不可再调用。管理员从独立管理接口查审计。

## 2. 写入返回

```json
{"operation_id":"uuid","status":"committed","page_id":"uuid","changed":true,"version_token":"opaque","persisted_at":"RFC3339","url":"same-origin page url"}
```

15秒内未终结：status=pending、operation_id、retry_after_ms=2000；此结果不是错误，也不是保存成功。客户端用get_operation查询；原参数原键重试返回同一操作。preview返回status=preview、base_version、summary、warnings；不给committed或persisted_at，不保证之后仍可提交。无内容变化时changed=false，版本不推进、不生成重复前后快照、不计一次有效修改，但请求速率计费仍生效。

edit_page示例：
```json
{"page_id":"uuid","version_token":"opaque","idempotency_key":"client-generated-uuid","ops":[{"type":"append","markdown":"新增段落"}]}
```

ops按顺序作用于同一候选；replace_block仅可替换schema允许的安全文本块，不能修改受保护复杂节点或其祖先，不支持删空保护节点。一次批次任一项失败即全部失败。同批重复替换同一block_ref拒绝。prepend/append定位文档内容边界，不借机改变已有复杂节点。

## 3. 错误合同

| code | retryable | 客户端动作 |
|---|---|---|
| INVALID_ARGUMENT / UNSUPPORTED_CONTENT / CONTENT_TOO_LARGE / BLOCK_NOT_EDITABLE | false | 修改输入，使用新键 |
| RESOURCE_NOT_FOUND_OR_FORBIDDEN / SCOPE_DENIED / GRANT_EXPIRED | false | 重新选择资源或授权，不能原样重试 |
| DOCUMENT_BUSY | true | 用户停止编辑后重新取上下文，使用新键发起新操作 |
| REVISION_CONFLICT / BLOCK_REFERENCE_INVALID | false | 重新取上下文并重做决策，使用新键 |
| IDEMPOTENCY_KEY_REUSED | false | 同键不同payload，纠正客户端，禁止覆盖原操作 |
| RATE_LIMITED | true | 等待retry_after或下一个配额周期；未登记操作可复用键 |
| OPERATION_RESULT_EXPIRED | false | 保留墓碑，绝不重新执行；从页面或审计确认 |
| OPERATION_RECONCILING | true | 查询原operation，不新建替代写入 |
| INTERNAL_ERROR | 视是否登记 | 有operation_id先查询；无ID且请求可能到达时原键重试 |

业务终态rejected保持不变；同键不会因繁忙消失而自动再次执行。提示不返回其他编辑者身份。所有错误带request_id、code、message和允许的retry_after_ms，禁止堆栈外泄。

## 4. 管理及浏览器接口

均为现有用户会话认证，变更有CSRF与Origin校验；OAuth token不能调用。

| 路由 | 参数与结果 | 权限 |
|---|---|---|
| GET /api/agent-connections | cursor,page_size → 自己的grant列表 | 登录用户 |
| GET /api/agent-connections/:id | scopes/spaces/expiry/status/last_used | 所有者 |
| PATCH /api/agent-connections/:id | expected_version,scopes,space_ids → version | 所有者；只允许缩小，不可延长有效期 |
| POST /api/agent-connections/:id/revoke | expected_version → revoked | 所有者；重复撤销成功 |
| GET /api/agent-connections/:id/operations | cursor,page_size → 脱敏活动 | 所有者 |
| GET/PUT /api/agent-policy | PUT expected_version,enabled,max_grant_days,quota_limits | workspace管理权限；不能突破系统硬上限 |
| GET /api/agent-audit | cursor,client_id?,user_id?,status?,time_range → 审计 | workspace审计权限 |
| POST /api/agent-clients | name,type,redirect_uris → client_id及一次性secret | 实例管理员；初期预注册 |
| PATCH /api/agent-clients/:id | expected_version,status/name/redirect_uris | 实例管理员；安全参数变化使未完成授权请求失效 |
| POST /api/editor-permits/acquire | page_id,client_id → permit,epoch,expires_at | 当前可编辑用户；busy则409 |
| POST /api/editor-permits/heartbeat | permit → expires_at | 同用户/session；失效409不能自动续活 |
| POST /api/editor-permits/release | permit,last_ack_seq → released | 同用户/session；需确认待提交内容已保存 |

permit为随机opaque引用，只存hash并绑定会话；协作握手绑定permit，重连必须重新校验。UI PUT/PATCH版本不一致返回409，重新加载而非静默覆盖。审计列表默认20最大100条，按(created_at,id)倒序游标，不提供无界导出。

其余授权与运行错误沿用PRD：UNAUTHENTICATED、GRANT_REVOKED、MCP_DISABLED、APP_BLOCKED、PERSISTENCE_UNAVAILABLE、OPERATION_PENDING。额度不足使用RATE_LIMITED及reason=minute/day/concurrency，不另建同义错误。终态failed仅用于已确定未提交的基础设施故障；同键查询保持该结果，新意图用新键。

## P1 实现落点

实际受控客户端登记沿用 `/api/agent-oauth/clients`；未另建 `/api/agent-clients`。公开开发者接入属于 P2。检索 `snapshot_revision` 为快照哈希，不能替代编辑上下文令牌。游标绑定 grant、空间及查询条件，编辑游标额外绑定文档版本；活动日期过滤参数为 `from`/`to`。细化与验收见 [P1 报告](../test/p1-business-integration.md)。
