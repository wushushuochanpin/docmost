---
file: docs/iterations/20261018_01_agent-document-mcp/prd/PRD.md
description: 用户主动授权第三方 Agent 使用 MCP 新建与编辑文档的完整产品需求。
created_at: 2026-10-18 16:25:53 Asia/Shanghai
updated_at: 2026-10-18 16:58:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [prd]
disclaimer: 本文可能更新，仅供参考；现状以当前代码、产品和源系统为准，拟议行为以正式评审后的需求为准，本文不代表功能已经实现。
---

# 第三方 Agent 文档 MCP 产品需求

| 项目 | 定义 |
|---|---|
| 版本 / 状态 | 1.0 / approved，用户已确认；SDD已编写供工程评审，尚未实现 |
| iteration_mode / lifecycle | existing_system_iteration / long_term |
| 档位 / 优先级 | large（授权、文档写入及跨客户端联动）；建议 P1，排期由项目迭代确定 |
| 已确认边界 | 用户主动授权第三方 Agent；首期不要求与人工同时编辑 |
| 推荐方案 | 扩展现有 MCP，共用项目文档操作能力；不新增协作引擎 |
| change_strategy | extend，兼容既有只读 MCP；不替换现有编辑器和实时协作栈 |
| stack_decision | locked：遵守根 AGENTS.md，保持 Node.js 22、Hocuspocus 4.x、Tiptap 3.20.x |
| 本次交付 | 本文件为已确认需求；完整技术设计和实施计划另见 ../sdd/SDD.md 与 ../implementation/task-breakdown.md |

## 1. 背景、目标和决策

用户希望在自己选择的第三方 Agent 中完成检索、创建和修改 Docmost 文档，减少复制粘贴与跨应用操作。项目已经具备只读 MCP，扩展写入可复用当前能力。收益尚无真实使用数据，受控试用需要验证使用频次和任务完成率，不能把预估收益当作已证实事实。

方案比较：只做 REST/OpenAPI 适合固定合作方，但每个 Agent 需单独适配；扩展 MCP 适合多个客户端自主发现工具；一次建设应用市场、计费和开放平台的成本超过当前需求。选择第二种，业务规则在项目内共用，MCP 仅承担对外工具契约。

目标：

1. 用户能清楚知道哪个应用可读取、创建或修改哪些空间，并随时撤销。
2. Agent 能完成“找目录→建文档”和“读编辑上下文→局部修改→确认保存”的闭环。
3. 任意用户的人工编辑与 Agent 写入不重叠，不覆盖未读取的新版本。
4. 重试、超时、进程异常不会重复新增或追加；写入结果可查询、可追溯。
5. 保持现有浏览器编辑、只读 MCP、目录规则和权限行为兼容。

成功口径：受控验收场景中越权读取/写入、丢失人工内容、重复写入、假成功均为 0；发布支持矩阵中的客户端全链路通过率为 100%。试用期以至少 3 个独立授权用户、2 个独立 MCP 客户端、累计 50 次非预期拒绝类写操作为最低观察样本；成功提交率 ≥99%，排除用户取消、文档忙、版本冲突和权限拒绝，但必须单列这些事件的数量，不能隐藏异常。样本不足则延长试用，不据小样本声明可用性 SLA。

## 2. 现状审计与复用结论

证据为本次源代码审阅，非生产环境验证。路径相对仓库根目录。

| ID | 当前能力及证据 | 复用决策与缺口 |
|---|---|---|
| AS-01 | `apps/server/src/core/mcp/mcp.controller.ts`：Streamable HTTP、JWT guard、工作区 MCP 开关 | extend；补 OAuth 资源服务器、协议兼容与边界校验 |
| AS-02 | `core/mcp/mcp-gateway.service.ts`：search/fetch/get_page/list_pages；空 scope 允许读取 | extend；旧能力保留，新增授权默认拒绝，空 scope 永不代表写入 |
| AS-03 | `core/mcp/knowledge-retrieval.service.ts`：读取物化 content，含截断与页面权限判断 | reuse 作为知识检索；new_build 编辑上下文，避免陈旧快照 |
| AS-04 | `core/page/page.controller.ts`：部分创建、修改权限在 Controller 校验 | extend 共用操作入口；MCP 不得绕过 Controller 后遗漏授权 |
| AS-05 | `core/page/services/page.service.ts`：初始化 Y.Doc、校验编辑会话、分发正文事件 | reuse/extend；补原子结果语义、幂等和版本前置条件 |
| AS-06 | `collaboration/collaboration.handler.ts`：replace/prepend/append | reuse 协作路径；不直接开放无前置条件的 replace |
| AS-07 | `collaboration/extensions/persistence.extension.ts`：落库、快照、历史与通知 | extend；可靠保存确认、失败传播、操作归因需验证 |
| AS-08 | `core/editor-session/editor-session.service.ts`：状态 key 包含 userId，部分校验可关闭或仅告警 | extend；Agent 互斥必须覆盖文档上所有用户，不依赖单用户租约或可关闭的告警模式 |
| AS-09 | `core/integration-token/services/integration-token.service.ts`：Token 有效期、撤销、审计，创建 scopeJson=[] | reuse 管理语义；OAuth grant 和最小授权需要新增，不复用空 scope 写权限 |
| AS-10 | `apps/client/src/App.tsx`：已有 account/workspace 设置与 API key 入口 | extend 独立 Agent 授权页面，保留 API key 页面 |

现有数据库实体包括 pages/Y.Doc、页面权限、API token、历史/审计及 Redis 会话状态；具体实体关系和字段复用由 SDD 检查。本文不给现有表增加未经验证的字段结论。

## 3. 角色、用户故事与范围

| 角色 | 故事 | 权限边界 |
|---|---|---|
| 授权用户 | 我允许一个 Agent 在指定空间整理文档，并能随时取消授权 | 只能授予自己当前拥有且工作区允许的能力 |
| 正在编辑文档的成员 | 我正在输入时，Agent 不得改动正文或抢占编辑 | 不因其他用户授权而降低人工编辑保护 |
| 工作区管理员 | 我能关闭外部 Agent、限制可接入应用并查看操作记录 | 管理集成不自动赋予查看受限正文的权限 |
| 第三方应用开发者 | 我能按公开合同接入、识别冲突并安全重试 | 应用身份不能代替用户授权 |

### 3.1 首期正式能力（P1 受控试用和 P2 公开接入共用）

- OAuth 用户授权，绑定单工作区、明确空间集合、明确操作 scopes。
- 读取、搜索、目录浏览、新建文件夹、新建文档、标题修改、追加/前插、限定区块修改。
- 文档级写入互斥、版本检查、预览、幂等、结果查询、审计及现有网页历史恢复入口。
- 用户授权管理、管理员策略、连接详情及操作记录。

### 3.2 不在首期

- 匿名访问私有知识、匿名写入、管理员代替成员静默授权。
- 人与 Agent 同时编辑、Agent 长期持有编辑租约、自动抢占或强制覆盖。
- 全文替换、删除、归档、移动、权限修改、公开分享、附件上传、远程 URL 自动导入。
- 跨文档事务、批量写入、后台定时任务、应用市场、计费和服务账号。
- MCP 内恢复历史、评论与审批建议模式；可作为 P3 独立需求。

## 4. 授权模型与资源边界（AUTH-01）

### 4.1 身份与有效权限

一次授权 grant 绑定 user、workspace、client，保存用户主动选择的 scopes、space IDs、有效期和状态。不能由工具参数切换用户/工作区。应用名称、图标只是展示信息，不作为可信身份依据；授权页展示已注册应用身份及回调域名。

有效权限 = 用户实时权限 ∩ 应用允许请求的能力 ∩ grant scopes ∩ grant 资源范围 ∩ 工作区策略。创建检查目标空间及父目录可编辑性；修改检查目标页面可编辑性；搜索、列表、摘要、附件元数据、链接、操作结果都执行相同资源边界，不能先泄露后过滤。

首期资源粒度为明确选择的空间，不提供“全部当前及未来空间”。授权包含所选空间内当前和未来可访问的页面，授权页必须说明这一点。页面移出授权空间立即失去访问，移入所选空间后按用户当前 ACL 判断；新增空间不会自动纳入。单页/子树授权后续另议，不能仅靠 search 的筛选参数代替授权约束。

| scope | 展示名 | 工具/能力 | 依赖 |
|---|---|---|---|
| knowledge.read | 读取所选空间的文档 | search/fetch/get_page/list_pages/list_spaces | 必选基础权限 |
| pages.create | 新建文档 | create_page | knowledge.read |
| folders.create | 新建文件夹 | create_folder | knowledge.read |
| pages.edit | 编辑已有文档及标题 | get_edit_context/edit_page/update_page_metadata | knowledge.read |

“新建文档”不默认包含“之后修改文档”；仅有创建权限的 Agent 若需修改新建文档，仍需 pages.edit。创建文件夹是独立选择项。get_operation 只返回当前调用 grant 自己发起、且仍有权访问的结果，不扩大读取权限。

### 4.2 用户授权流程（UC-01）

主路径：Agent 发起连接 → Docmost 登录（复用当前登录/MFA）→ AUTH-CONSENT 授权页 → 选择工作区、空间、权限和期限 → “允许连接” → 返回已验证的 Agent 回调 → Agent 获取工具清单。

- 授权页必须列出应用、回调域名、请求能力、具体空间、到期时间及数据会传给第三方的说明。
- 读取为基础权限，写权限默认未勾选。用户可拒绝部分 scope；应用必须处理实际返回的授权集合。
- 本期默认授权 30 天，可选 1/7/30/90 天；工作区最大期限默认 90 天，可调低。以服务端实际 expires_at 为准。
- 无可选空间时禁用确认并说明“你暂无可授权的空间”；用户可返回 Agent 或切换工作区。
- 用户拒绝、关闭或授权请求过期不产生有效 grant；有效 callback 才返回标准拒绝结果，非法回调留在本站报错，绝不跳转。
- 登录后切换账号/工作区必须重新展示最终授权对象；不能沿用之前账号的已选空间。
- 扩大 scope、加入空间、延长期限必须再次主动授权。用户在管理页缩小范围立即生效；被移除范围不会因刷新令牌恢复。

### 4.3 OAuth 产品要求

第三方公开使用必须提供标准 OAuth 授权，不要求用户复制 Docmost 登录 Cookie 或管理员 API key。使用授权码和 PKCE；精确回调校验、资源标识与 audience 校验、授权服务器/受保护资源元数据发现、refresh token 轮换及重放处理均为放行要求。访问令牌建议 10 分钟，不能超过 grant 到期时间；撤销后的令牌不能等自然过期才失效。

P1 为管理员登记/允许的两个试用客户端，仍采用用户 OAuth。P2 对登记的第三方应用开放用户自助授权；采用受控注册，自动接受任意未知应用或动态注册不是首期要求。若目标客户端必须依赖其他注册机制，需要先通过互操作验证并明确支持范围。协议实现版本及 SDK 是否满足要求由 SDD 冻结，不因已安装 SDK 就声称兼容最新协议。

### 4.4 撤销、禁用及在途操作

用户可撤销自己的 grant；管理员可禁用工作区 Agent 功能或阻止应用，不可替用户新增授权。grant 状态：active/revoked/expired；工作区或应用策略暂停表现为 suspended 的派生状态，不丢失原授权记录。

撤销确认完成后，新调用和刷新立即拒绝。撤销与写提交必须存在明确顺序：先确认撤销则尚未越过不可逆提交点的操作终止；先越过提交点则允许完成并在记录中说明提交时间，不能承诺撤回已完成修改。边界由服务端串行化保证，不能只在网关检查一次后继续写入。前端管理列表 5 秒内更新；旧页面展示延迟不影响后端拒绝。

权限降级、退出空间、用户停用、grant 到期也在提交前重检；操作结果若已无读取权限，只返回不含正文的拒绝信息。重新授权创建新 grant，不恢复旧令牌。

## 5. 工具功能与产品合同（TOOL-01）

以下为产品级合同，JSON Schema、端点定义及 SDK 代码留到 SDD。system ID 由后端生成；Agent 可使用读取工具返回的 UUID、URL 或 slug 解析定位，但写工具只接受规范化 ID，避免重名歧义。

### 5.1 工具清单

| ID / 工具 | 必填输入 | 选填 / 默认 | 输出与边界 |
|---|---|---|---|
| T01 search | query | space_id、父节点、top_k 默认8/最大20 | 授权范围内候选、摘要、page_id、URL；不作为可写快照 |
| T02 fetch | id | 保持现有 format/mode/max_tokens 等参数 | 保留现有合同，显式 truncated；检索快照不保证最新编辑状态 |
| T03 get_page | url 或 slug_id（二者至少一项） | 保持现有参数 | 定位后与 fetch 一致；URL 仅解析本站页面，不抓取远程地址 |
| T04 list_pages | space_id 或 parent_page_id | 默认50/最大100条、深度最大5 | 目录类型及元信息；新增分页字段保持旧字段兼容 |
| T05 list_spaces | 无 | cursor、limit 默认20/最大100 | 本 grant 所选且用户仍可访问的空间 |
| T06 get_edit_context | page_id | cursor、limit；按区块读取 | revision、区块引用、内容、是否可编辑、支持操作、保护区块、完整性标志；不持有锁 |
| T07 create_folder | space_id、title、idempotency_key | parent_id；preview 默认false | 根级只允许文件夹；子目录遵守既有层级；返回创建结果或预览 |
| T08 create_page | space_id、parent_id、title、markdown、idempotency_key | preview 默认false | 父节点必须是文件夹；markdown 可空；不能在根部建文件 |
| T09 update_page_metadata | page_id、expected_revision、title、idempotency_key | preview 默认false | 首期只改标题；不含位置、权限、分享、图标和主题 |
| T10 edit_page | page_id、expected_revision、operations、idempotency_key | preview 默认false | 单文档有序操作列表，最多20项，全成或全不成 |
| T11 get_operation | operation_id 或 idempotency_key（二者一项） | 无 | 状态、结果、错误、重试提示；只查询本 grant 操作 |

所有工具均返回结构化结果；正常业务失败采用 MCP 工具错误及结构化 code/retryable/recovery_action，不把可预期冲突包装成通用内部错误。认证失败使用协议适用的 HTTP/OAuth 语义；参数与协议格式错误区分处理。工具注解准确标明读取/写入及幂等条件，不能宣称未带幂等键的追加天然幂等；注解不是权限控制。

工具发现按实际 scope 展示可用能力；服务端仍逐次鉴权。已有客户端依赖的四个读取工具名、默认值和既有输出字段不删除；新增分页或 freshness 字段采用兼容扩展。

### 5.2 编辑操作

| operation | 必填字段 | 行为 |
|---|---|---|
| append | markdown | 在正文末尾插入新内容 |
| prepend | markdown | 在正文开头插入新内容 |
| replace_block | block_ref、expected_block_hash、markdown | 仅替换指定可编辑区块；不支持跨区块模糊文本匹配 |

block_ref 是服务端返回、绑定 revision 的区块引用，不承诺跨版本稳定；Agent 不得自造。首期允许段落、标题、列表、引用、代码块等经能力表验证的节点；表格、附件、嵌入、提及、评论锚点、转引等未验证为无损的节点列为 protected。get_edit_context 必须明确每个区块是否允许替换。包含受保护子节点的区块也不可替换；可在复杂文档头尾新增支持的内容。

正文保留未经修改的节点及标记。Markdown 不支持的结构返回 UNSUPPORTED_CONTENT，不能静默丢失。脚本、危险 HTML、未授权附件引用拒绝；本期不自动访问链接或下载外部图片。普通链接可以作为链接保存，经项目现有安全策略校验，不触发服务器抓取。

单请求最多 256 KiB UTF-8 内容、20 项操作；新建标题 1–200 个 Unicode 码点，去首尾空白且不得全空；若现有系统限制更严取更严者。写入后文档大小仍受当前项目限制，SDD 必须查明并写入能力说明。空操作拒绝，空 markdown 仅允许创建空文档，不能伪装删除区块。

### 5.3 编辑上下文与预览

get_edit_context 从协作权威状态形成一致视图，返回其 revision，不能把陈旧 pages.content 标成最新。分页 cursor 绑定同一 revision；翻页期间变化就返回 REVISION_CONFLICT，重新读取。完整性字段至少区分 complete、has_more、protected_blocks；不向 Agent暗示已返回全篇。

预览执行与提交相同的权限、内容和目标校验，返回变更摘要、受影响区块、基准版本和告警；不保存、不发通知、不持有长期租约。预览成功不保证稍后提交成功；提交重检全部条件。preview 不建立成功写入幂等结果，同一 key 可用于对应正式提交；正式提交后该 key 绑定实际写载荷。普通受授权修改不要求每次网页确认；不得依赖 Agent 客户端是否弹确认框来保护数据。

### 5.4 结果与幂等（WRITE-01）

持久化成功输出 operation_id、status=committed、page_id、canonical_url、revision_before（创建为空）、revision_after、committed_at、change_summary。禁止返回“已保存”但数据库未确认。索引更新可异步，结果明确 indexing=pending；文档直接读取必须能读到不旧于已提交版本的结果。

幂等键建议 UUID，必填非空，最长128 ASCII字符；按 workspace+user+client+grant+tool+key 隔离。服务端绑定规范化有效载荷摘要。同键同载荷返回原操作，同键不同载荷返回 IDEMPOTENCY_KEY_REUSED；并发相同请求只产生一次效果。对同 grant 的重复返回仍需核验授权，不得靠旧结果泄露撤销后的内容。

操作状态：pending → running → committed / failed / rejected；结果无法判明时进入 reconciling，不能报失败后允许另建请求造成重复。rejected 表示尚未执行的冲突、权限或校验拒绝；failed 表示已确认无文档效果的执行失败；committed 为文档效果已可靠保存。任何已产生效果的情况均不可标记 failed。幂等防重复记录至少保留30天，未决操作不因到期清除；审计默认保留180天（若工作区既有留存更长则沿用）。协议文档明确超出保留期不能安全自动重试。

同键重试仅用于网络失败/未知结果查回原操作；已明确 rejected/failed 后，修正或重新读取再提交需要新 key。网络断开不是回滚信号。元信息修改和正文修改是独立原子操作，本期不提供跨工具事务。create_page 的内容、目录类型、父子关系必须一起有效，不能残留半创建页面。

## 6. 人工与 Agent 冲突处理（LOCK-01）

### 6.1 文档级互斥规则

“不同时编辑”是服务端保证，不是提示 Agent 自觉遵守。任意用户、任意浏览器、其他 API 写入与 Agent 之间，都遵守同一文档级冲突规则。现有同用户租约不能直接满足这一要求。

- 只读查看不阻止 Agent；处于可编辑模式且租约有效的浏览器，即使暂时没有按键，也算人工占用。
- 人工编辑已激活：Agent 返回 DOCUMENT_BUSY，不抢占、不后台排队；输出 retry_after_ms 与“稍后重新读取并重试”。不得泄露其他编辑者身份。
- Agent 提交先取得短期独占资格：浏览器可读，进入编辑显示“文档正在由已授权应用更新，请稍后再试”，不开放可编辑表面；不能先允许输入再丢弃。
- 两个 Agent 同时修改：最多一个执行，其余 DOCUMENT_BUSY；即使同一用户也不允许绕过。
- 旧浏览器重连、离线待发更新、延迟保存必须校验旧资格；不得在 Agent 提交后把旧全文覆盖回来。需要重新同步并保留本地未提交内容的恢复入口。
- 人工之间既有协作行为保持；这里只增加人工组与 Agent 的互斥，不把整个平台改成单人编辑器。
- 创建文档检查父目录、空间、权限和层级在提交时仍有效；父目录移动、删除并发时重新校验。新文档提交前不可进入可编辑状态。

### 6.2 原子检查顺序与版本冲突

对写入执行：身份/范围校验 → 获取文档级资格 → 读取权威状态 → 核验 expected_revision 与区块 → 应用整批操作并可靠保存 → 记录结果 → 释放资格。

权限、版本校验与生效必须在同一受保护边界；不能“先检查、解锁、再写”。revision 覆盖正文及本期可修改的标题；任何人工/Agent相关修改都令旧上下文失效。具体 revision 算法留 SDD，不能单用更新时间或无法覆盖删除的状态向量作为保证。

发现版本变化返回 REVISION_CONFLICT，零写入；Agent 重新读取最新内容、重新规划修改并以新 key 提交。不能服务端自动合并、自动忽略差异或用旧区块引用重试。即使仅 append 也必须带 expected_revision，保证 Agent 追加时理解的上下文没有过期。

### 6.3 超时、断线与失效保护

默认单文档提交独占时段目标 ≤15秒；15秒未完成返回 pending/operation_id，不再占用请求等待。独占资格采用短期有效性和失效保护，异常最长60秒内进入可解释的恢复状态，不允许旧执行者在资格丢失后继续提交。60秒不是强行解锁承诺：若保存结果不明，文档进入恢复中并阻止新写，后台核对后才恢复，避免双写。

获取资格失败不排长队；Agent 依据 retry_after_ms 退避，最多自动重试3次，每次重新读取。get_operation 查询允许退避轮询。基础设施不可用或不能证明互斥有效时，Agent 写入关闭并返回暂不可用，不降级成普通数据库更新。人工正常编辑在确定没有 Agent 未决提交后继续；存在未决提交的单文档维持保护。

### 6.4 用户恢复路径（UC-03）

Agent 修改完成 → 浏览器查看更新后的内容和“由某应用代表某用户修改”记录 → 如需撤销，进入现有文档历史 → 比较并按当前历史恢复权限操作。首期不增加 Agent 自动回滚工具。历史必须能区分该次 Agent 改动并具有可用的恢复基线；若现有历史合并策略无法做到，须在发布前补足，不能仅依赖异步采样历史。

历史恢复也是写入，遵守文档互斥与当前版本检查；若有后续人工内容，恢复页必须提示将替换当前内容并展示差异，由用户重新确认。新增文档误建沿用既有网页管理入口，Agent 无删除权。不可读历史不能通过操作日志获得正文。

## 7. 信息架构、页面与交互（UI-01）

新路由为拟议路径，需与现有 App.tsx 路由整合；每页只有一个主任务。页面采用现有设置布局和组件，不新增营销式仪表盘。

| route_id / screen_id | 建议路径 | 主任务 / 入口 | 主操作 |
|---|---|---|---|
| R01 / AUTH-CONSENT | /oauth/authorize | 评估并完成一次授权；从 Agent 进入 | 允许连接、拒绝、选空间和权限 |
| R02 / AGENT-LIST | /settings/account/agents | 管理自己的连接；账号设置菜单 | 查看详情、撤销 |
| R03 / AGENT-DETAIL | /settings/account/agents/:grantId | 理解和缩小一个授权 | 移除空间/写权限、撤销、跳转记录 |
| R04 / AGENT-ACTIVITY | /settings/account/agents/:grantId/activity | 检查该连接操作记录 | 筛选、查看结果、打开文档/历史 |
| R05 / AGENT-POLICY | /settings/workspace/agents | 配置工作区接入策略 | 启停、允许应用、期限及配额 |
| R06 / AGENT-AUDIT | /settings/workspace/agents/activity | 管理员审计外部操作 | 用户/应用/状态/日期筛选 |
| R07 / EDITOR-BUSY | 现有 /s/:spaceSlug/p/:pageSlug | 读取文档并理解暂不可编辑原因 | 刷新状态、稍后编辑 |

### 7.1 主流程及分支

UC-01 授权：按4.2。AUTH-CONSENT 过期可返回 Agent 重新发起；网络失败保留选择但重新校验请求有效期；重复点击只产生一个授权结果；缺少必需参数禁止确认。

UC-02 新建：Agent 搜索/列目录 → 选择已授权空间与父目录 → 可选 preview → create_page → committed 返回文档地址。父目录不存在、已移动或不可编辑时无残留文档，重新选择；超时后查询原 operation，不重新创建。

UC-03 编辑：Agent 读取上下文 → 可选预览 → edit_page → 成功结果 → 用户查看文档及历史。人工占用时退避并告知；版本冲突重新读取；不支持内容则说明该区块不能修改并允许改用追加；无权限提示重新授权或在网页核对权限，不能循环重试。

UC-04 管理：AGENT-LIST → AGENT-DETAIL → 移除范围或撤销确认 → 详情刷新为已缩小/已撤销 → 返回列表。取消确认不改变授权；弱网显示结果待确认并主动重新读取服务器状态，不能先标记撤销成功；状态已经撤销时重复操作返回相同终态。

UC-05 管理员：AGENT-POLICY → 关闭写入或阻止应用 → 展示影响连接数和在途处理说明 → 确认 → 策略生效。无管理权限隐藏入口且直达路由拒绝。开启功能不代替任何用户授权；恢复策略后只恢复未到期、未撤销的 grant。

### 7.2 字段和显示规范

以下字段标签由本表定义中文文案源，实现时纳入 i18n；值来自服务端，不从 Agent 自报名称推导身份。无动态自定义字段，暂不需要独立字段字典接口；未来动态审计属性必须新增字段元数据。

| field_key | 中文名 | 类型/单位/枚举中文名 | 来源/必填/默认 | 筛选/排序 | 敏感级别 |
|---|---|---|---|---|---|
| client_name | 应用名称 | 字符串 | 已注册应用/必填 | 筛选/否 | 普通 |
| redirect_host | 返回地址 | 域名 | 注册信息/授权页必填 | 否/否 | 普通 |
| workspace_name | 工作区 | 字符串 | 当前账号可选集合/必填 | 否/否 | 内部 |
| space_ids | 可访问空间 | ID集合映射空间名 | 用户选择/至少1项/空 | 筛选/否 | 内部 |
| scopes | 允许的操作 | 读取/新建文档/新建文件夹/编辑 | 用户选择/读取基础 | 筛选/否 | 内部 |
| expires_at | 授权到期时间 | 日期时间，按用户时区展示 | 服务端计算/默认30天 | 筛选/是 | 内部 |
| status | 连接状态 | 有效/已暂停/已撤销/已到期 | 服务端 | 筛选/否 | 内部 |
| last_used_at | 最近使用 | 日期时间/未使用 | 服务端事件/可空 | 否/是 | 内部 |
| actor_name | 授权用户 | 用户显示名 | 服务端/审计必填 | 筛选/否 | 个人信息 |
| operation_status | 操作状态 | 处理中/核对中/已保存/已拒绝/失败 | 服务端结果/必填 | 筛选/否 | 内部 |
| change_summary | 修改摘要 | 字符串 | 服务端限定摘要/可空 | 否/否 | 受页面ACL保护 |
| occurred_at | 操作时间 | 日期时间 | 服务端/必填 | 筛选/是 | 内部 |
| operation_id | 操作编号 | 系统生成不透明ID | 服务端/详情可复制 | 精确查询/否 | 内部 |

system_id：page_id、grant_id、operation_id、space_id 由后端生成；client_id 是应用注册标识；idempotency_key 是调用方生成的 external_reference；本期无业务编号或手填数据库ID表单。OAuth code/access token/refresh token 永不展示在操作列表或日志。

### 7.3 可见文案与防误操作

- 授权：“此应用将能够访问你选择空间内当前及未来你有权访问的文档。”
- 写权限说明：“允许此应用代表你修改文档。你可以随时撤销。”
- 忙碌：“文档正在编辑中，请稍后再试。”
- Agent 占用：“文档正在由已授权应用更新，暂时无法编辑。”
- 版本变化：“文档已更新，请重新读取后再修改。”
- 结果不明：“正在确认保存结果，请勿重复提交。”
- 撤销：“撤销后，此应用将无法继续访问。已经保存的修改不会自动撤回。”

内部的 Y.Doc、fencing、scopeJson、数据库表名、测试账号不得出现在普通用户错误提示。开发者工具结果允许准确错误码和契约字段；内部堆栈不返回。

## 8. 错误与恢复合同（ERROR-01）

| code | 状态/效果 | 调用方恢复 |
|---|---|---|
| UNAUTHENTICATED / GRANT_REVOKED / GRANT_EXPIRED | 无新写入 | 重新发起用户授权；禁止无界重试 |
| MCP_DISABLED / APP_BLOCKED | 无新写入 | 告知策略限制，联系管理员 |
| SCOPE_DENIED / RESOURCE_NOT_FOUND_OR_FORBIDDEN | 无新写入；未知和不可读目标保持同类响应 | 重新授权或选择可访问资源，不泄露存在性 |
| DOCUMENT_BUSY | rejected、零写入 | retry_after_ms，重新读取后有限重试 |
| REVISION_CONFLICT | rejected、零写入 | 获取新上下文、重新规划、新key |
| BLOCK_NOT_EDITABLE / BLOCK_REFERENCE_INVALID | rejected、零写入 | 检查能力或重新获取区块引用 |
| UNSUPPORTED_CONTENT / CONTENT_TOO_LARGE / INVALID_ARGUMENT | rejected、零写入 | 修正内容或分小操作后重新读取 |
| IDEMPOTENCY_KEY_REUSED | rejected、原操作不受影响 | 查询原操作；新意图使用新key |
| RATE_LIMITED | 未开始执行 | 按 retry_after_ms 退避 |
| PERSISTENCE_UNAVAILABLE | 仅在确认无效果时 failed | 服务恢复后新操作 |
| OPERATION_PENDING / OPERATION_RECONCILING | 不确定/执行中，不宣称失败 | 只查 get_operation，不能换key盲重试 |
| OPERATION_RESULT_EXPIRED | 已超查询保留期 | 在网页和历史人工核查，禁止自动重放 |

## 9. 安全、审计、配额和服务质量（OPS-01）

授权内容为第三方数据共享边界。用户必须看到数据将交给何应用；文档中的提示词、外部链接或 Agent 传入的“已获批准”字段都不能扩大权限。服务端禁止代传用户凭证到任意第三方地址，校验 Origin、Host/可信代理边界及回调目标，限制内容大小并清理日志。

审计记录授权/缩权/撤销/策略变更，以及写入的应用、授权用户、工作区、grant、工具、操作ID、目标、前后版本、结果和时间。审计不可由 Agent 修改；原始令牌不记录，正文/diff 不进入通用日志。授权用户查看自己的连接；管理员查看租户内元数据；目标标题/摘要/差异继续受页面 ACL 约束，管理权限不自动解锁私密正文。

默认配额（产品初始值，可由管理员调低，调高需容量验证）：每grant读取60次/分钟、写入10次/分钟、查询结果30次/分钟、新建100篇/天、修改500次/天；同grant同时执行最多2个不同文档写入，同文档最多1个；每workspace新建500篇/天、修改2000次/天、并发写入最多10个。日界按工作区时区（未配置则 Asia/Shanghai），返回 reset_at；预览计读取配额，另受每分钟10次预览限额；有效相同幂等请求不重复消耗创建/修改日配额。频繁被拒调用仍受请求限流，防止冲突重试压垮服务。

性能验收基准：同环境、10个并发客户端、文档≤100KiB、每次≤5项变更，健康依赖下读取/预览 P95≤2秒，写入可靠提交 P95≤5秒；超过15秒转pending。基准不满足则缩小试用范围或优化，不用提前返回假成功换指标。复杂大文档仍受边界保护，不能阻塞其他文档。

告警关注：持久化失败、超过60秒未决、幂等冲突异常增长、越权拒绝激增、撤销未及时生效。指标使用 operation_id 关联且不带正文。工作区级写入开关能停止新写并保留读取与审计；关闭不删除授权和历史。

## 10. 权限菜单、联动与影响面

### 10.1 RBAC/菜单合同

以下 permission 是拟议业务能力，不承诺仓库已有同名枚举。实现优先映射既有用户/管理员能力，不额外造一套 RBAC。

| menu_id / parent_menu_id | route_path | permission / app_scope | visible / role_bindings | migration_version / smoke_check |
|---|---|---|---|---|
| account.agents / account | R02对应路径 | agent.grant.manage_own / workspace | 成员可见；只操作自己 | 新增迁移版本在SDD确定；成员菜单可达且越权grant拒绝 |
| account.agent_detail / account.agents | R03/R04对应路径 | agent.grant.manage_own / workspace | 隐藏子菜单、可深链 | 同上；刷新可恢复、跨用户拒绝 |
| workspace.agents / workspace | R05对应路径 | agent.policy.manage / workspace | owner/admin | 同上；普通成员菜单不可见、直达拒绝 |
| workspace.agent_activity / workspace | R06对应路径 | agent.audit.read / workspace | owner/admin | 同上；无正文权限不显示摘要 |
| oauth.consent / 无 | R01对应路径 | 本人登录并可授权 / workspace | 无菜单、有效授权请求进入 | 同上；非法回调拒绝、不跳转 |

路由存在不等于菜单可见。若需持久化菜单/权限 seed，采用新前进迁移，不修改已合并迁移；迁移ID由SDD在最新基线之后分配。

### 10.2 关键联动规则

| rule | source_of_truth | frontend_surface | backend_guard | data_constraint | error_code | recovery_action |
|---|---|---|---|---|---|---|
| L01授权有效 | grant+实时ACL+策略 | 授权详情 | 每次访问、提交前检查 | 单工作区、明确空间集合 | SCOPE_DENIED | 缩小目标或重新授权 |
| L02互斥 | 文档级写资格 | 编辑器忙碌态 | 所有人工/Agent写入口 | 旧执行者失效不能提交 | DOCUMENT_BUSY | 重新同步后重试 |
| L03内容一致 | 权威Y.Doc和revision | Agent编辑上下文 | 同边界比较后写入 | 非目标节点原样保留 | REVISION_CONFLICT | 重新读取规划 |
| L04可靠结果 | 持久化操作记录及文档 | 操作记录 | 保存确认后才成功 | 一key一个效果、未决不重放 | OPERATION_RECONCILING | 查询和后台核对 |
| L05目录规则 | 现有页面树规则 | 创建结果与侧栏 | 父节点ACL/层级校验 | 根文件夹、文件置于文件夹 | INVALID_ARGUMENT | 选合法父节点 |
| L06可恢复 | 文档历史+操作归因 | 网页历史 | 恢复时权限和互斥 | 前版本可追溯 | REVISION_CONFLICT | 重新比较后确认 |

跨端矩阵：Web用户侧负责授权、管理、文档查看/恢复；Web管理员侧负责策略和审计；第三方MCP客户端负责工具发现、执行与结果展示；后端共用权限及文档事实。无iOS/小程序新增界面。旧Web客户端若不能遵守互斥，不能在其仍可写时开放Agent写入，必须通过服务端保护或兼容升级达到安全条件。

影响范围：MCP入口、认证/授权、权限与Token、页面创建更新、协作持久化、编辑会话、历史审计、设置菜单及文档编辑态。禁止直接修改 pages.content 作为权威写入；不得新增另一套协作后端。搜索索引延迟不阻碍文档直接读取。

## 11. 分阶段交付与验收

“首期”指P1受控试用到P2公开接入的同一功能范围；P0是技术放行验证。P3另立需求，不自动成为本期承诺。详细验收见 [acceptance-criteria.md](acceptance-criteria.md)。

| 阶段 | 交付范围 | 放行标准 | 未通过时 |
|---|---|---|---|
| P0技术可行性 | 验证文档级互斥、可靠提交、幂等、历史基线、OAuth互操作 | AC-01～AC-08、AC-18均有可回放证据；故障注入无假成功/重复写 | 只保留现有读取，禁止发布写工具 |
| P1受控试用 | 登记客户端OAuth、完整首期工具、用户连接管理、管理员开关、限额审计 | AC-01～AC-20全部通过；至少2客户端、3用户、50次写入达到成功指标 | 修复或维持受控范围，不自动扩量 |
| P2公开接入 | 公开接入文档、自助用户授权、受控应用登记、支持矩阵、运维告警 | P1全回归；AC-21～AC-24通过；完成14天试用观察且无P0/P1级未解决数据/授权缺陷 | 不公开发布，继续试用 |
| P3后续候选 | 评论、审批建议、附件、移动、恢复工具、细粒度子树授权 | 独立PRD和风险验收 | 不影响本期完成 |

阶段交付不等于部署步骤。用户当前只要求PRD；此处规定产品放行条件，不执行实现或上线。

## 12. 兼容、灰度和撤回要求

新增功能默认关闭，先指定工作区/客户端试用；现有只读调用不自动获得写能力，历史空scope token继续原只读兼容路径，新OAuth授权按明确scope执行。旧 Token 是否访问其他HTTP接口另行审计；本需求不得给现有广权限Token新增隐式MCP写授权。

写入紧急关闭后，新写拒绝，已到不可逆点的操作完成并记录，其他终止或核对；读取、管理和审计保留。撤回程序版本不能删除新增授权/审计数据，不回滚已保存的业务文档。若旧版本无法理解新互斥/未决状态，应先关闭写入并处理未决操作，再进行兼容回退。详细发布操作等待SDD及发布方案。

不回归范围：现有四个只读工具、页面ACL、根目录规则、浏览器人工协作、编辑器实例稳定、ProseMirror单例、隔离测试Redis、页面历史与搜索更新。代码变更阶段按AGENTS.md触发相关guard/build；本次纯文档不运行应用构建。

## 13. 成本、风险和待技术设计事项

用户成本：一次授权、选择空间及必要时等待人工结束编辑；第三方应用会获取授权内容，需要用户明知。管理员成本：登记应用、处理授权咨询、检查异常操作。研发成本集中在OAuth、跨所有用户的文档互斥、持久化结果和故障恢复，而非工具注册。没有工作量估算数据，本文不承诺工期。

| risk_id | 风险 | 产品约束 / 验收 |
|---|---|---|
| RISK-01 | 单用户租约被误认为全页互斥 | AC-03，多用户/多节点/旧客户端验证 |
| RISK-02 | 保存失败却返回成功或超时重放 | AC-05/06/07，持久化确认及未决核对 |
| RISK-03 | OAuth或资源权限扩大 | AC-01/02/15，授权交集和撤销顺序 |
| RISK-04 | Markdown往返破坏复杂内容 | AC-08，只改可编辑区块，保护其他节点 |
| RISK-05 | 版本/历史不足以恢复 | AC-04/18，真实版本和操作历史基线 |
| RISK-06 | 协议客户端兼容不足 | AC-21，公布实测支持矩阵 |

SDD输入：拆分授权域、文档操作域、MCP适配域、审计查询域；明确共用服务的授权责任。需要技术验证：现有协作文档所有权与多节点事件回执；文档级互斥与人工会话接入；持久化与幂等效果原子关联/崩溃恢复；revision与区块定位；历史前后基线；OAuth服务器组件复用及协议支持。不能仅靠“最终一致”推迟处理重复写或权限窗口。

新增概念实体：Client（登记应用）、Grant（用户授权）、Operation（单次写入与幂等事实）、DocumentWriteEligibility（短期文档写资格）。它们是产品对象，不是最终数据库设计；SQL字段、索引、锁实现、接口合同与测试计划已在独立SDD包展开。

仍待确定的非阻断项：两个首批客户端名称、管理员负责人、真实部署容量及支持的协议版本，分别在P0/P1放行前确定。本文已给出权限、期限、配额等默认值，评审可调整，不将其留成未定义行为。

## 14. 来源与变更记录

- 用户本次明确选择“主动授权第三方Agent、首期不与人工同时编辑”。
- 仓库根AGENTS.md及第2节代码证据。
- [MCP Streamable HTTP规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)：远程传输、安全及版本兼容参考。
- [MCP授权安全规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)：PKCE、资源校验、回调与令牌安全参考。
- 2026-10-18 v1.0：新增需求评审稿；尚无实现、运行或兼容性验证结论。
