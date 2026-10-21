---
file: docs/iterations/20261018_01_agent-document-mcp/public/developer-guide.md
description: 预登记 OAuth 客户端、文档工具调用及错误恢复说明。
created_at: 2026-10-19 14:18:03 Asia/Shanghai
updated_at: 2026-10-21 09:43:30 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认 PRD/SDD、当前 OAuth/MCP 代码和本地验收结果
applies_to: [server, implementation]
disclaimer: 文档可能更新，仅供参考；当前代码、产品与原始验收证据优先。服务状态以实例设置页和实际 OAuth 发现响应为准。
---

# 开发者指南

## 1. 申请接入

本实例使用自研服务 `https://book.superchat.help/mcp`。下文 HOST 替换为 `book.superchat.help`。
「设置 → AI 设置 → MCP」分别展示总开关与服务状态；总开关开启不代表 OAuth 或写入服务已启用。
API 密钥仅保留读取能力。读写接入还需实例启用 OAuth/文档命令服务、工作区允许 Agent 写入，以及用户实际授权。


向实例维护者提交应用名称、public/confidential 类型、精确回调 URI、请求 scope、浏览器 Origin（无浏览器跨域请求填空数组）及维护联系渠道。当前不提供动态客户端注册或 Client ID Metadata Document 自动登记。维护者通过已有登录会话且用户 ID 在 `AGENT_OAUTH_ADMIN_USER_IDS` 白名单内的账号登记；普通工作区管理员身份本身不足以登记。

在同源已登录页面执行登记请求，不向 Agent 提供网页 Cookie：

```javascript
const response = await fetch('/api/agent-oauth/clients', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Agent', type: 'public',
    redirect_uris: ['http://127.0.0.1:1/callback'],
    scopes: ['knowledge.read', 'pages.create', 'folders.create', 'pages.edit'],
    origins: []
  })
});
const registration = (await response.json()).data;
// registration.client_id 交给客户端；不要把会话 Cookie 交给客户端。
```

public 客户端不使用 secret；confidential 客户端的 secret 仅在登记时返回，应存入服务端秘密存储，token/revoke 使用 client_secret_basic，不放入浏览器或 URL。生产回调必须 HTTPS；public 桌面客户端允许 `http://127.0.0.1` 或 `[::1]` 回环地址，端口可动态变化，其余部分须匹配。`localhost`、通配符、片段、userinfo 不支持。回调变更/客户端秘密轮换的自助 API 尚未提供，维护者需按新登记及用户撤销旧连接流程处理，不直接修改数据库凭据。

## 2. 地址与 OAuth

| 功能 | 地址 |
|---|---|
| MCP | `https://HOST/mcp` |
| 资源元数据 | `https://HOST/.well-known/oauth-protected-resource/mcp` |
| 授权服务器元数据 | `https://HOST/.well-known/oauth-authorization-server` |
| 授权 | `https://HOST/oauth/authorize` |
| 换取/刷新令牌 | `https://HOST/oauth/token` |
| 撤销令牌族 | `https://HOST/oauth/revoke` |

使用元数据发现，不硬编码不同的 issuer/resource。授权流程为 Authorization Code + PKCE S256；每次生成独立 state/verifier，回调检查 state，严格绑定 `resource=https://HOST/mcp`，授权请求和换取/刷新请求都携带 resource，且不得重复参数。scope 必须包含 knowledge.read，只申请实际需要的权限。

1. 客户端读取资源/授权服务器元数据，使用预登记 client_id。
2. 在浏览器打开授权地址，参数包括 response_type=code、client_id、redirect_uri、state、scope、code_challenge、code_challenge_method=S256、resource。
3. 用户登录，主动选择空间、scope 和有效期。拒绝/过期则终止，不能绕过许可页。
4. 回调验证 state，使用 form-urlencoded 向 token endpoint 提交 grant_type=authorization_code、code、redirect_uri、code_verifier、client_id、resource。public 不附 Basic secret。
5. MCP 请求使用 `Authorization: Bearer ACCESS_TOKEN`。禁止 URL 查询参数传令牌。
6. 根据 expires_in 刷新；保存旋转后的 refresh_token。旧 refresh 重放会使整个令牌族撤销，不能并行刷新同一授权。grant 最长有效期不会因刷新延长。
7. 用户可在“设置 → 我的 Agent 连接”缩权或撤销整个连接；/oauth/revoke 只撤销指定 token 所属令牌族。撤销后丢弃本地令牌，重新授权必须再次获得用户同意。

服务端未认证挑战中的 scope=knowledge.read 是最低读取要求。需要写入时应明确发起包含写 scope 的授权，不应直接把挑战 scope 当成完整业务请求。Codex 测试中不额外配置 oauth_resource，由元数据自动发现，以免产生重复 resource 参数。

传输为无服务端 session 的 Streamable HTTP POST，JSON 响应；客户端发送 `Accept: application/json, text/event-stream`。GET SSE 和 DELETE session 不支持，返回 405，不把它们当成服务故障。使用经过验证版本的 MCP SDK 协商协议版本，不自行拼接不支持的协议版本。

## 3. 权限和工具

| scope | 可发现工具 |
|---|---|
| knowledge.read | search、fetch、get_page、list_pages、list_spaces、get_edit_context、get_operation |
| pages.create | create_page |
| folders.create | create_folder |
| pages.edit | edit_page、update_page_metadata |

写 scope 与 knowledge.read 组合使用。每次请求重新检查 ACL；工具发现后撤权也会拒绝。已有 API key 继续使用原四个读取工具，不能以 API key 绕过 OAuth 使用新增写工具。

`tools/list` 是机器可读参数的权威入口，Schema 快照位于 `apps/server/test/agent-mcp-p0/__snapshots__/oauth-business.spec.ts.snap`。先 list_spaces/list_pages 找位置，再 get_edit_context 取得版本与 block_ref。检索 snapshot_revision 不是编辑资格。

示例工具参数（替换 UUID、版本和幂等键）：

```json
{"name":"create_folder","arguments":{"space_id":"SPACE_UUID","title":"Agent 草稿","idempotency_key":"UNIQUE_KEY_1"}}
```

```json
{"name":"create_page","arguments":{"space_id":"SPACE_UUID","parent_id":"FOLDER_UUID","title":"会议记录","markdown":"# 记录\n\n第一段。","idempotency_key":"UNIQUE_KEY_2"}}
```

```json
{"name":"edit_page","arguments":{"page_id":"PAGE_UUID","version_token":"CONTEXT_VERSION","idempotency_key":"UNIQUE_KEY_3","ops":[{"type":"append","markdown":"新增段落。"}],"preview":true}}
```

预览后使用同一业务载荷和幂等键、去掉 preview 或设为 false 正式提交。期间版本变化必须重新读取并规划，不强制覆盖。修改同一请求的正文/标题不能继续复用已提交的幂等键。响应丢失时用原请求原键重试；已知 operation_id 则查 get_operation，不能换键盲写。

根节点只能建文件夹，文档必须置于文件夹。标题最多 200 个 Unicode 码点；Markdown 总量最多 256KiB。支持普通段落、标题、列表、引用、代码、链接及基础文字标记，表格、附件、数学、原始 HTML 等复杂内容不支持修改，明确拒绝而不静默丢弃。具体 ops 类型/限制以 tools/list 为准。

编辑上下文每页最多 100 块，默认 50；大块可能截断并标记保护。游标绑定授权、过滤条件和编辑版本，不能跨文档/授权使用；收到下一游标继续读取，短页不等于结束。不能修改不可编辑/截断区块。

committed 表示数据库已持久化，通知/检索索引可能稍后同步。超过 15 秒可能返回 pending；按 retry_after_ms 查询同一操作，核对期间不提交替代操作。

## 4. 可运行示例

仓库已安装依赖并使用 Node 22+ 后：

```sh
node scripts/mcp/client-example.mjs --server https://HOST/mcp --client-id CLIENT_ID
```

终端输出 authorize 事件和浏览器 URL，打开后完成真实许可。默认仅发现工具和列空间，令牌只保存在内存，退出即丢弃；它不是生产令牌存储实现。输出授权 URL 只供当前用户交互，不上传共享日志。回调监听仅绑定回环地址并校验 state。

在**隔离沙箱空间**显式运行完整写入试验：

```sh
node scripts/mcp/client-example.mjs --server https://HOST/mcp --client-id CLIENT_ID --exercise-writes --space SPACE_UUID
```

该模式会创建一个文件夹和文档、预览及追加段落、重试并检查幂等、读回持久化结果，最后撤销本次令牌族并检查旧 access/refresh 失效。创建的文档保留供网页核查，不自动删除。实例必须已允许该工作区写入，且用户在许可页选择全部所需 scope。

## 5. 错误处理与限额

| 返回 | 客户端动作 |
|---|---|
| HTTP 401 | 检查有效期；最多进行一次受控刷新，撤销/刷新失败则重新授权，不循环重试 |
| HTTP 429 / RATE_LIMITED | 遵守 Retry-After 或 retry_after_ms；不要换 grant 或幂等键绕过额度 |
| DOCUMENT_BUSY | 让用户结束人工编辑或等待当前操作，随后重新取得上下文 |
| REVISION_CONFLICT / BLOCK_REFERENCE_INVALID | 重新读取、重新规划；不要复用旧块引用 |
| RESOURCE_NOT_FOUND_OR_FORBIDDEN / SCOPE_DENIED | 检查用户授权和当前 ACL；不探测资源是否存在 |
| UNSUPPORTED_CONTENT / BLOCK_NOT_EDITABLE | 改为受支持的局部操作或交给人工 |
| IDEMPOTENCY_KEY_REUSED | 同键不同请求；查清已有结果后再决定是否发起新的业务操作 |
| OPERATION_RESULT_EXPIRED | 原请求已处理但结果载荷已过期；从网页/历史/审计核查，不换键重放 |
| OPERATION_RECONCILING / pending | 查询原 operation_id，保留原键，等待恢复 |
| MCP_DISABLED | 联系工作区管理员，不通过旧 API key 绕过写入策略 |
| INTERNAL_ERROR | 保留 request_id/operation_id 交给维护者，不记录正文或令牌；结果不明先查询 |

默认每 grant：读取 60/分钟、写入 10/分钟、操作查询 30/分钟、预览 10/分钟；预览同时消耗读取及预览额度。创建 100/日、修改 500/日、并发 2。每工作区：创建 500/日、修改 2000/日、并发 10。管理员可降低额度；另有每 grant 60 请求/秒入口保护。日界按工作区时区，修改时区不能重置当前用量。幂等重放不重复扣写/日额度，仍受查询速率约束；无变化提交释放日额度。

## 6. 保留与隐私边界

产品合同：可查询操作结果至少 30 天，幂等墓碑与审计至少 180 天，未决操作不得到期删除。候选版本已实现有界定时清理，默认关闭；管理员启用后，已解决的过期结果可以清空载荷。原键仍占用，同键重试或查询返回 OPERATION_RESULT_EXPIRED，不会再次执行。不能承诺恰好在第 30/180 天删除，最小操作墓碑和历史关联记录当前没有独立自动销毁。

journal 只在确认持久化、session 重放窗口及备份窗口均结束后清理；有效 refresh family 的已消费令牌证据保留以识别重放；审计采用工作区已有更长留存要求。保留名单可暂停整个工作区清理。具体对象、配置和回退见 [留存合同](../test/p2-retention-observability.md)。用户注销与删除例外政策需由实例运营方确认，不得直接删除 grant、操作或快照来实现清理。第三方 Agent 的自身存储和日志策略由应用方说明，撤销权限不能收回已读取的数据。
