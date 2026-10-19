---
file: docs/iterations/20261018_01_agent-document-mcp/test/p0-business-integration.md
description: OAuth、公开MCP、浏览器恢复和多节点本地验收证据及剩余门槛。
created_at: 2026-10-18 18:13:24 Asia/Shanghai
updated_at: 2026-10-19 11:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD与SDD、本轮正式代码与隔离测试结果
applies_to: [server, test, implementation]
disclaimer: 本文记录本地实现与测试事实，不代表生产部署或完整产品放行。
---

# P0 业务接入与多节点验证

P0 的 AC-01～AC-08、AC-18 已完成本地产品验收：8 组 99 项测试通过，包含完整编译应用、真实密码登录、完整编辑与历史恢复、18 类读取权限矩阵，以及此前的双节点与故障恢复验证。P1/P2 仍未放行；本结论不构成生产部署或公开发布许可。

没有部署，没有连接业务数据库或生产 Redis，没有提交或推送。候选代码为当前未提交工作树，基线以本仓库 HEAD 为准。

## 已接通的业务

### OAuth 与公开入口

- 使用 @node-oauth/oauth2-server 5.3.1 执行真实授权码及 refresh 流程；强制 PKCE S256，精确绑定 resource、client、redirect_uri。public/native 与 confidential/basic 客户端分开；不开放匿名动态注册。
- 已有 JWT 签名校验之后，再查真实数据库会话、用户状态；许可请求绑定 user/workspace/session，Origin 与 CSRF 同时校验。允许用户选择空间、scope、期限；拒绝、非法回调、过期请求、错误 verifier/resource 和重放不获得授权。
- 授权码与令牌存摘要；重复许可响应短期加密缓存；refresh 轮转，旧 refresh 重放撤销整个 family。令牌撤销与写入最终事务共享权限屏障。
- /.well-known/oauth-authorization-server、/.well-known/oauth-protected-resource/mcp、/oauth/authorize、/oauth/token、/oauth/revoke 和 /mcp 均走正式控制器。许可 UI 为 /oauth/consent，读写许可请求使用 /api/agent-oauth/requests/:id。
- 人工审核登记 API 为 POST /api/agent-oauth/clients，需要真实会话且用户在独立实例管理员白名单。该白名单不是工作区管理员角色提升。
- 旧 API key 保留既有四个只读工具。OAuth 新增 get_edit_context、edit_page、update_page_metadata、create_page、create_folder、get_operation；每次调用及最终提交再次鉴权。get_operation 支持 operation_id 或 tool+idempotency_key，丢失响应后可跨节点核对。

### 真实 ACL、互斥与持久化

- 文档写入以 PostgreSQL document_gates、human permits、owner/edit epoch、fence 为权威。最终提交重新读取真实 ACL、用户、授权空间/scope、token/family/client 状态，不信任权限缓存。
- 人工写许可存在时 Agent 被拒；Agent 占用时浏览器不能获得写许可。两个浏览器仍通过现有 Hocuspocus 4 / Redis 协作，不引入第二同步引擎。
- Agent 候选生成与提交分离；提交原子保存 Y.Doc、物化正文、前后历史、恢复快照、操作结果及 outbox。页面创建与目录元数据、幂等记录在同一事务；新建同时记录带应用归因的初始历史。
- 正文、标题、直接 SQL 变更均推进或检查版本。相同幂等键/载荷返回原结果，不同载荷拒绝。未决操作可查询；过期执行者被 fence 拒绝，恢复确认后才重新开放人工编辑。
- 人工 journal 和 checkpoint 提交后才发送 durable_ack。普通 Hocuspocus 网络确认不被当作持久化成功。
- Redis 路由兼容 Hocuspocus 4 文档名尾缀；续租/释放均比较 owner 后原子执行。丢失 owner 或 Redis 异常关闭旧连接，避免旧节点删除新节点的锁。

### 浏览器与恢复

- PageEditor 先读取真实 runtime，再创建 provider；受管页面不加载旧的无账户命名空间 IndexedDB 文档，也不启用本地直接写回 fallback。
- DurableProvider 阻止原始 SyncStep2/Update 上传；只有带 epoch/updateId 的 document_update 能提交。先保存本机恢复草稿，再发送；只有匹配 durable_ack 才清除对应草稿。
- 草稿按 workspace/user/page 和 provider 实例隔离。断线可保留，重连代次改变时隔离旧内容，界面提供查看、手动复制和重试入口，不自动合并回流。当前 UI 显示最新一份恢复草稿；多份草稿管理未实现。
- 历史列表显示应用归因及修改前/后。恢复按钮先取得当前版本并确认，再通过已有 provider 的 document_restore 提交；服务器检查人工许可、真实 ACL 和确认版本，原子保存后才返回成功。确认后发生人工修改则拒绝，要求重新确认。
- 失去连接或恢复确认超时显示结果不确定，不能直接宣称失败后可盲目重试。

## 运行证据

- [Jest 原始结果](p0-jest-results.json)：8 suites / 99 tests，含原有技术探针和正式业务测试；[环境记录](p0-runtime.json)。
- PostgreSQL 16.14：临时 loopback 新集群，fsync=true、synchronous_commit=on；Redis 7.4.4：本次专用临时实例；Node 22.23.3、pnpm 10.4.0、Hocuspocus 4.0.0；浏览器为本机 Chrome。
- 发现元数据、未认证 challenge、MCP initialize 与 tools/list（10 个 object schema）通过；HTTP A 授权和许可 → HTTP B 换 token → B 编辑 → A 重试；A/B 同键并发新建只产生一页、一条目录元数据和一个操作；撤销后另一节点拒绝。
- 许可组件协议回归保留；新增完整应用以真实密码登录、管理员登记 API、真实许可页点击选择空间/scope，换取 token 后经公开 MCP 编辑。375px 许可布局回归与 [许可截图](p0-consent.png) 保留。
- 双 Chrome 页面连接不同 Redis 网关：真实 Tiptap .ProseMirror 输入持久化、另一浏览器收到；人工期间 Agent 被拒；断线草稿与 Agent 后续提交隔离。该双节点用例使用正式 provider + Tiptap 测试入口；完整 PageEditor 另由下面的编译应用用例覆盖。
- 正式 DocumentCommandService 在独立进程提交后、响应前 SIGKILL；另一实例相同请求取回原结果，数据库重建只有一次修改。
- 历史恢复回归检查归因、确认后标题变化被拒、重新确认恢复成功、独立从二进制重建内容、历史数量及 live 文档一致。
- 全部 64 份迁移在独立数据库按序运行；三份新迁移执行前插入旧文档，升级后验证二进制不变，再以正式服务编辑并检查正文和前后历史。OAuth/并发组仍采用最小业务表 fixture；这不替代真实业务数据备份的升级演练。
- 前后端构建通过；页面树 57 项、PageService 1 项回归通过；ProseMirror singleton、realtime deployment、migration order、受影响代码 ESLint、锁文件 frozen 校验通过。客户端构建有大 chunk 提示；本轮服务端构建成功，但 Nx 输出 editor-ext 任务历史 flaky 提示，未把它算作失败或稳定性证明。

## SDD 差异及尚未关闭的门槛

1. 为覆盖旧直接 SQL 权限路径，采用实例级 authority advisory barrier，而非工作区 safety row；候选生成不持锁。正式容量验证和收敛到工作区粒度尚未完成。
2. 每次人工写入都完整 checkpoint，并保留原始 journal；增量 checkpoint、保留清理和压力测试仍待完成。owner 租约目前 30 秒、恢复轮询 5 秒。
3. P0 公开编辑器只接受单段纯文本 Markdown 子集，拒绝换行/富文本/未知语法；保护复杂区块不静默降级。完整 Markdown、11 工具（尚缺 list_spaces）、编辑分页、配额和连接管理属于后续未完成项。
4. 断线可用幂等键查询或重复请求获得 pending/最终结果；尚未实现所有慢请求在 15 秒主动返回 pending 的预算机制（AC-20 性能门槛）。
5. 完整应用与读取矩阵的原剩余 P0 门槛已关闭。外部 Agent 产品兼容、连接管理、公开发布及容量/清理等仍按 P1/P2 执行，不纳入本次通过结论。

## 本次补齐的产品证据

`full-app.spec.ts` 从全部 64 份迁移创建完整数据库，以 NOSUPERUSER / NOBYPASSRLS 运行角色启动正式 `dist/main.js`，提供真实客户端生产构建。只预置测试账户、空间和初始文档；登录、授权、编辑许可、持久化、历史列表、恢复和现有业务接口均走正式实现。NODE_ENV=test 仅用于隔离配置、禁止自动迁移及允许 loopback OAuth，不使用业务 .env。

- 完整登录 → 打开已有文档 → 键盘输入 → 可靠保存 → 刷新仍存在；页面没有“页面加载失败”。
- 两个独立用户真实登录并获得人工许可，Agent 写入返回 DOCUMENT_BUSY；远端人工编辑正常同步，编辑器实例保持稳定。
- 实际历史菜单显示应用及修改前/后；选择修改前，桌面/移动布局来回切换后仍保持选择。取消确认不写入；另一用户在确认后修改正文，旧确认被拒且内容/版本不变；重新确认后恢复，数据库与双方编辑器一致，刷新仍正确。
- 移动历史版本选择器显示应用归因；面板与确认框覆盖导航层，不被工具栏挡住。[历史面板](p0-full-app-history.png)、[冲突提示](p0-full-app-conflict.png)、[恢复结果](p0-full-app-restored.png)、[移动历史](p0-full-app-mobile-history.png)。
- 实际“查看恢复草稿”显示空态；仅注入 runtime HTTP 网络故障时页面只读并显示重试；解除故障后点击“重试编辑”重新取得许可。离线未确认草稿及跨账户隔离沿用双节点真实 provider 回归，不伪称此步骤生成了离线草稿。
- 正式 HTTP 复制、Markdown 导入后，文档可获得 MCP 编辑上下文并提交，独立从 Y.Doc 重建可见新内容；正式批量移动成功，非法非文件夹目标拒绝，原文档二进制不变。覆盖这些接入路径的 P0 兼容边界，不宣称所有导入格式都已逐项验收。
- [完整读取矩阵](p0-read-permission-matrix.md)：18 个权限/生命周期场景 × 11 种读取请求，另核验操作结果、实际图片读流与 create/edit/folder scope 边界。包含跨用户、租户、空间、页面/祖先 ACL、组权限撤销、停用和过期。

## 回归发现并修复的问题

1. OAuth CommonJS 默认导入在正式编译产物中不是构造函数，导致真实许可换码失败。兼容 CommonJS 和测试编译的导入形态；用完整应用授权链验证，未改全局编译选项。
2. 协作 token 接口错误继承忘记密码的 3 次/5 分钟额度，重复刷新与第二浏览器可能 429。明确使用协作接口 60 次/分钟额度，并跳过忘记密码桶；OAuth 限流改为实际注册的命名桶。5 次协作续签成功，忘记密码仍为前三次校验拒绝、第四次 429。
3. 历史选择在响应式子面板重新挂载时重置到最新版本，造成恢复目标偏移。重置上移至共同面板的打开/页面切换边界，并在绘制前完成；新增选中语义与桌面/移动切换回归。
4. 移动历史版本未展示 Agent 来源，且默认弹窗层级低于应用导航。补齐来源与层级，确认框位于历史面板之上；浏览器检查关闭按钮中心点实际命中该按钮。

## P0 条款与证据对应

| 条款 | 主要通过证据 |
|---|---|
| AC-01 | oauth-business 的合法/拒绝/过期/PKCE/resource/重放；full-app 的密码登录与许可换码 |
| AC-02 | 18 类完整读取矩阵、scope 边界、真实 ACL 与写入最终鉴权 |
| AC-03 | transactions/business 的多节点多执行者竞争；双 Redis 网关浏览器；full-app 双用户人工互斥 |
| AC-04 | 标题/正文/delete-only 版本、旧 block_ref、提交前撤权/变更；完整历史旧确认拒绝 |
| AC-05 | 20 并发同键、创建/标题重复、异载荷拒绝、正式进程提交后响应前被终止再查询 |
| AC-06 | 事务故障回滚、目录原子性、PG 重启重建、直接读取最新内容、真实输入 durable_ack |
| AC-07 | 未决操作查询、过期 fence、提交核对不误判、恢复后重新取得人工许可 |
| AC-08 | 复杂兄弟节点/评论标记保持、受保护节点拒绝、未知 Markdown 拒绝、批次失败零写入 |
| AC-18 | 前后历史与快照原子保存；真实历史归因、取消/冲突/重新确认/双方同步及刷新 |


## 开关与回退

默认关闭 AGENT_OAUTH_ENABLED 和 DOCUMENT_COMMAND_ENABLED。启用前必须配置固定 HTTPS AGENT_OAUTH_ORIGIN、独立 32 字节 base64 AGENT_OAUTH_RESPONSE_KEY、DOCUMENT_COMMAND_SIGNING_KEY、实例管理员 ID 白名单 AGENT_OAUTH_ADMIN_USER_IDS，并使用非 superuser / 非 BYPASSRLS 运行角色。测试仅 NODE_ENV=test 允许 loopback HTTP。

新增三份前向迁移，尚未应用业务库。关闭 OAuth 停止新授权；关闭文档命令停止新 Agent 写入，但不会删除受管 gate 或绕过写保护。已经登记的文档需先排空、确认 checkpoint，再执行验证过的前向回退；不能直接降级到旧写入协议。未提供生产启用或部署承诺。

新增依赖决策：OAuth 库固定 5.3.1，MIT、支持 Node >=16、具备所需 PKCE/refresh 模型，协议行为有实测覆盖；不依赖官方付费实现。lib0 0.2.117 是现有 Hocuspocus/Yjs 已使用的编码包，客户端显式声明同版本，不引入新同步层。回退优先关闭入口并保留持久化边界，禁止删除未决数据。

## 复现方式

使用 Node 22 和 pnpm 10.4.0 安装锁定依赖。先执行 `pnpm run server:build` 与 `pnpm --filter client build`；完整应用测试运行本地构建产物，不能跳过构建。提供 PostgreSQL 16 完整工具（含 unaccent/pg_trgm）、Redis 7.4.4、Chrome/Chromium，以及 OAuth 5.3.1 模块绝对路径。程序不读取 .env，不接受外部数据库 URL，始终创建专用临时集群；结束自动停止并删除。不要指向任何业务 Redis。

```sh
P0_PG_BIN=/absolute/postgres16/bin \
P0_REDIS_BIN=/absolute/redis-server \
P0_OAUTH_MODULE=/absolute/node_modules/@node-oauth/oauth2-server \
P0_CHROME_BIN=/absolute/Google-Chrome \
pnpm --filter server test:agent-mcp-p0
```

当前源码摘要见 [候选清单](p0-integration-artifacts.json)。上面的路径是工具位置占位符，不是业务服务地址。运行需允许本机 loopback、启动进程及创建临时文件；不需要部署。

## P1 全量回归更新

当前 P0+P1 证据以 [P1 完整报告](p1-business-integration.md) 和 p1-jest-results.json 为准：9 组 118 项通过。旧 P0 JSON 含中间执行结果，不作为本轮最终证据。未部署。
