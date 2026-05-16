# 同页面同文件多端编辑互踢 PRD

**成文日期**：2026-05-14 18:53:37 UTC+8  
**最后修订**：2026-05-15 11:26:27 UTC+8

本文档用于指导“同页面、同文件、多端互踢”能力开工设计与验收。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 1. PRD 元信息

| 项目 | 内容 |
|---|---|
| doc_id | `PRD-20260514-01-editor-session-takeover` |
| 版本 | v1.3 |
| 档位 | small，单文件开工 PRD；内容按 medium 详细度展开 |
| 产物模式 | 单文件 PRD，避免中途切换目录包影响开工读取 |
| 落盘路径 | `docs/prd/20260514_01_editor-session-takeover.md` |
| 需求状态 | implemented_in_test_full_viewport_overlay |
| 改造策略 | migrate，增量接入编辑会话，不替换现有 Yjs 协同 |
| 主要风险 | 内容覆盖、旧端离线后重放保存、Ydoc/JSON 状态不一致、误伤多人协同 |

### 文档档位与产物策略

| tier | 判档依据 | 交付物 | 升级条件 |
|---|---|---|---|
| small | 本次不新增业务导航页，不新增长期业务表；但涉及编辑器、WebSocket、Yjs、Redis、页面保存链路，按详细开工 PRD 编写 | 单文件 PRD，含接口、状态机、验收、回滚 | 若评审要求拆出独立诊断后台、长期审计表、文件全类型编辑策略，则升级为 medium 目录包 |

### 存储路径与命名规范

| root_path | package_mode | package_name | 命名规则 | 例外说明 |
|---|---|---|---|---|
| `docs/prd` | file | `20260514_01_editor-session-takeover.md` | `YYYYMMDD_index_short-slug.md` | 单文件 small PRD；slug 使用 3 个英文业务词，长度小于 32 |

### 改造策略确认闸门

| gate_id | current_stage | strategy | 用户确认状态 | 决策理由 | 回滚目标时长 | 停机风险 |
|---|---|---|---|---|---|---|
| G-CHANGE-01 | production-ready codebase | migrate | 用户已要求“落地为 PRD，准备开工” | 现有 Yjs 协同、Socket.IO、页面保存链路均需兼容；不做 replace | 30 分钟内关闭 feature flag | low |

## 2. 背景与问题

当前页面正文存在实时协同链路，但在协同不可用、同账号多标签、多浏览器、多设备同时打开同一页面或同一内嵌文件时，仍可能发生以下问题：

1. 多个端同时编辑同一个页面，旧端离线或进入 fallback 后再次保存，覆盖新端内容。
2. 本地 fallback 使用整篇 `replace` 保存，多个端交错保存时容易产生后写覆盖。
3. Draw.io、Excalidraw 等文件型内容存在同一附件被多个端打开编辑的风险，保存结果不可预期。
4. 当前前端只展示连接状态，不具备“同一资源编辑权归属”的服务端强约束。

本次目标不是关闭多人协作，而是阻断“同一个账号在同一个资源上的多个编辑端同时拥有写权限”。

## 3. 目标与范围

### 3.1 本期目标

- 建立统一 `EditorSession` / `EditLease` 能力，覆盖同账号同资源的单活编辑权。
- 新端打开同一页面或文件时，先进入单遮罩只读阻断态；只有用户点击“继续在这里编辑”后才通过二阶段协议接管编辑权。
- 所有 P0 内容写入必须携带 `leaseId + fencingToken`，后端强校验，旧端不能继续写。
- 保留现有多人协同：不同用户可继续共同编辑同一页面。
- 支持协同不可用时的 local fallback，但 fallback 写入必须受编辑会话保护。
- 不接受只靠前端互踢、只靠 warn-only、只靠持久化阶段拒绝的短期方案；P0 完成口径必须包含连接入口阻断和写接口强校验。

### 3.2 本期不做

- 不做全员同文档独占锁，不阻止不同用户同时协作。
- 不做复杂三方冲突合并 UI；旧端被踢后如存在未提交内容，只保留恢复草稿。
- 不把活跃编辑会话持久化为长期 DB 记录；P0 使用 Redis 短 TTL 状态。
- 不在 P0 覆盖所有附件类型保存；P0 强制覆盖页面正文和标题，P1 扩展文件型编辑器。
- 不改变登录态“踢设备”能力，本需求只处理资源编辑权。

## 4. 系统角色与用户故事

| role_id | 角色 | 核心职责 | 权限边界 |
|---|---|---|---|
| R-EDITOR | 普通编辑者 | 编辑页面内容、标题或文件型内容 | 仅能编辑自己有写权限的资源 |
| R-COLLAB | 协作者 | 与其他账号共同编辑页面 | 不受同账号互踢限制，仍受页面权限限制 |
| R-SRE | 运维/SRE | 排查会话、Redis、WebSocket、保存异常 | 只读诊断，不直接篡改内容 |
| R-QA | 测试 | 验证互踢、断网、旧端重放保存 | 无生产写权限 |

| story_id | 角色 | 用户故事 | 映射能力 | 验收用例 |
|---|---|---|---|---|
| US-001 | R-EDITOR | 作为编辑者，我在另一个标签页打开同一页面时，希望系统先提示页面已在另一端打开，由我决定是否继续在这里编辑。 | page edit lease + explicit takeover | ACC-001、ACC-002 |
| US-002 | R-EDITOR | 作为编辑者，我的旧设备恢复网络后，不应把旧内容覆盖到新设备已保存的内容。 | fencing token | ACC-004 |
| US-003 | R-COLLAB | 作为协作者，我希望不同账号仍能实时协作，不被单账号互踢误伤。 | user-scoped lease | ACC-006 |
| US-004 | R-EDITOR | 作为文件编辑者，我打开同一个 Draw.io 文件时，希望旧端被踢，避免两个端保存同一附件。 | file edit lease | ACC-010 |
| US-005 | R-SRE | 作为运维，我希望能通过日志定位哪个端被踢、哪个端接管、旧端是否被拒绝写入。 | structured logs | ACC-012 |

## 5. As-Is 现状审计

| 类型 | 现状 | 证据/位置 | 风险 |
|---|---|---|---|
| 页面正文协同 | 前端为 `page.${pageId}` 创建 Yjs Doc、IndexedDB 本地持久化和 Hocuspocus provider | `apps/client/src/features/editor/page-editor.tsx` | 多端共享同一个文档名，本身支持协同，但不区分同账号多端写权 |
| 协同持久化 | 服务端从 Ydoc 转 ProseMirror JSON 并更新 `pages.content`、`pages.ydoc` | `apps/server/src/collaboration/extensions/persistence.extension.ts` | 服务端以文档状态为准，缺少同账号会话 fencing |
| fallback 保存 | 协同不可用时前端通过 `/pages/update` 使用 `operation=replace` 保存整篇 JSON | `LocalFallbackPageEditor.persistLocalContent` | 多端 fallback 会产生后写覆盖 |
| 内容替换实现 | `/pages/update` 最终触发 `updatePageContent`，再通过 Yjs 事件 replace 文档 | `PageService.updatePageContent`、`CollaborationHandler.updatePageContent` | replace 没有携带编辑端身份和版本防护 |
| Socket.IO | 已有用户、workspace、space room，用于树、通知、缓存事件 | `apps/server/src/ws/ws.gateway.ts` | 可复用做互踢事件，但当前未记录 sessionId/clientId |
| 登录会话 | 当前访问 token 已含 `sessionId`，user_sessions 表记录设备 | `TokenService.generateAccessToken`、`user_sessions` | 可用于区分设备，但 collab token 当前未带 sessionId |
| 页面锁字段 | `pages.is_locked` 存在 | `pages` migration | 持久锁不适合作为短时编辑会话锁，P0 不复用 |

## 5.1 能力复用与重复建设审查

| existing_scan_id | 现有能力清单 | build_vs_reuse | duplicate_risk | non_reuse_reason | 边界定义 | 收敛计划 |
|---|---|---|---|---|---|---|
| RS-001 | Socket.IO user/workspace/space room | extend | low | N/A | 只扩展 editor session 事件，不重建实时通道 | 新事件统一走 `WebSocketEvent` 类型 |
| RS-002 | Hocuspocus/Yjs 页面协同 | extend | medium | N/A | 仅增加 lease 校验，不替换协同协议 | 保持现有 `page.${pageId}` 文档名 |
| RS-003 | `/pages/update` 内容保存 | extend | medium | N/A | 内容写入前增加 editSession fencing | 旧客户端灰度期 warn-only，后续 strict |
| RS-004 | `user_sessions` 登录会话 | reuse | low | N/A | 用于 sessionId 诊断和 collab token 扩展，不作为编辑锁存储 | 不新增登录设备互踢 |
| RS-005 | `pages.is_locked` | not_reuse | low | 该字段是持久页面属性，不适合短 TTL 临时编辑会话 | 活跃编辑权放 Redis，不落页面行 | 后续若做管理员锁页再单独评审 |

## 6. 设计理念与决策记录

| 方案 | 内容 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 仅前端 `BroadcastChannel/localStorage` | 同浏览器标签互斥 | 实现快 | 不能覆盖多设备、服务端仍可被旧端写入 | 放弃 |
| B. 全员页面独占锁 | 任意用户打开同页都互踢 | 简单强约束 | 破坏 Docmost 多人协同核心能力 | 放弃 |
| C. 同账号同资源编辑会话 + 写入 fencing | 同一用户同一资源只有一个活跃写端，不同用户仍协作 | 精准解决覆盖问题，兼容协同 | 需改前后端保存链路 | 采用 |
| D. 只校验 `/pages/update` | fallback 写入受控 | 改动较小 | Yjs 活跃连接仍可能继续写 | 仅作为 C 的子集 |

关键决策：

1. 锁粒度为 `workspaceId + resourceType + resourceId + userId`。
2. P0 `resourceType` 覆盖 `page`，保护页面正文、标题和 fallback 保存。
3. P1 增加 `file`，保护 Draw.io、Excalidraw 等附件编辑。
4. 新端打开已有 active lease 的资源时不得自动踢旧端；`acquire` 仅返回 `blocked_by_other`。用户点击“继续在这里编辑”后才调用 `takeover` 创建 pending lease，并进入二阶段接管。
5. 协同连接的 stale update 必须在连接/消息入口被阻断；持久化阶段不能作为主要隔离手段。
6. 互踢状态由 Redis 短 TTL 承载，写接口用 fencingToken 做最终判定。

## 7. 功能概述与优先级

| 优先级 | 功能 | 说明 |
|---|---|---|
| P0 | 页面编辑会话申请 | 打开可编辑页面前申请 `page` lease |
| P0 | 同账号显式接管 | 后打开端先进入单遮罩只读阻断；用户点击继续后进入 pending takeover，旧端冻结并完成一次受控交接或超时失效 |
| P0 | 写入 fencing | `/pages/update` 所有写字段、标题保存、Yjs 连接入口均校验 lease |
| P0 | 被踢恢复草稿 | 旧端未保存内容保留在本地恢复草稿，不再自动写入服务端 |
| P0 | 日志与错误码 | 记录 acquire、takeover、revoked、stale-write |
| P1 | 文件型编辑会话 | Draw.io、Excalidraw、附件原位编辑接入 `file` resource |
| P1 | 会话诊断接口 | 运维只读查询活跃 editor session |
| P2 | 可视化冲突恢复 | 被踢旧端可对比恢复草稿与当前服务端内容 |

## 8. 信息架构与路由拆分

本需求不新增独立导航路由，属于编辑器运行时能力。

### navigation_tree

- 现有页面详情/编辑页
  - 编辑器运行时 lease gate
  - 被踢只读态
  - 本地恢复草稿提示
- 现有文件编辑弹窗（P1）
  - file lease gate
- 账号会话设置页
  - 不承接本需求

### route_inventory

| route_id | route_path | primary_user_job | page_goal | primary_entity | independent_goal_count | split_decision | single_workbench_exception | nav_upgrade_plan | 本次变化 | out_of_scope |
|---|---|---|---|---|---:|---|---|---|---|---|
| IA-001 | 页面详情/编辑页现有路由 | 编辑当前页面 | 查看与编辑页面 | page | 1 | no_split | forbidden | no_nav_change | 编辑态初始化前申请 page lease；被踢后切只读 | 不改变页面树、分享页、公开访问页 |
| IA-002 | 文件编辑弹窗/内嵌编辑器 | 编辑当前文件 | 编辑附件或内嵌文件 | file/attachment | 1 | no_split | forbidden | no_nav_change | P1 申请 file lease | 不改变文件上传入口 |
| IA-003 | 账号会话设置页 | 管理登录设备 | 查看和撤销登录 session | user_session | 1 | no_split | forbidden | no_nav_change | 不承接资源互踢 | 不把本需求做成登出设备 |

### page_boundary_decisions

| decision_id | candidate_scope | chosen_design | alternatives | decision_reason | why_not_modal | tradeoff | mitigation |
|---|---|---|---|---|---|---|---|
| IA-BD-001 | 资源编辑权状态 | 在现有编辑页内做运行时状态，不新增管理页 | 新增编辑会话后台页、账号设置页合并 | P0 是编辑器基础能力，主目标不是管理列表 | 互踢状态需要阻断当前编辑，不适合只放弹窗里承载 | 编辑页逻辑增加 | 用 hook 封装 lease 状态 |
| IA-BD-002 | 文件互踢 | P1 在文件编辑弹窗内接入 file lease | 新建文件锁页面 | 文件编辑是当前弹窗主流程的一部分 | 用户需要在保存前被阻断，独立页面没有收益 | P1 覆盖面增加 | 按文件类型逐步接入 |

## 9. 编辑会话状态机

```
idle
  -> acquiring
  -> active

acquiring
  -> blocked_by_other

blocked_by_other
  -> user_continue_here
  -> takeover_pending

blocked_by_other
  -> user_readonly
  -> readonly_view

active
  -> heartbeat_lost
  -> expired

active_old
  -> takeover_requested
  -> handoff_flush_or_draft
  -> revoked

takeover_pending
  -> old_handoff_flush
  -> promoted

takeover_pending
  -> grace_timeout
  -> promoted

promoted
  -> active
```

状态说明：

| 状态 | 含义 | 前端表现 | 写入规则 |
|---|---|---|---|
| `acquiring` | 正在申请编辑权 | 编辑器只读或骨架态 | 禁止内容写入 |
| `active` | 当前端拥有编辑权 | 正常编辑 | 允许带当前 token 写入 |
| `blocked_by_other` | 同账号同资源已有另一端 active，当前端未显式接管 | 显示单一阻断遮罩，正文只读；可点击“继续在这里编辑”或“只读查看” | 当前端无 lease，不允许写入，不通知旧端 |
| `takeover_pending` | 新端已申请接管但未 promotion | 旧端冻结输入；新端只读等待 | 旧 active lease 仅允许一次 `handoff_flush`；pending lease 不允许写 |
| `promoted` | 新 pending lease 已升为 active | 新端启用编辑；旧端只读 | 只允许新 active lease 写 |
| `revoked` | 当前端已失去编辑权 | 切只读，提示已在另一端打开 | 所有写入拒绝 |
| `expired` | 心跳过期 | 客户端重试 acquire | 原 lease 不可写 |

### 9.1 二阶段接管协议

本协议是 P0 的正式设计，不允许实现为“先覆盖旧 lease，再尝试让旧端保存”的短期方案。

1. 新端调用 `acquire`，若发现同账号同资源已有 active lease，服务端只返回 `blocked_by_other`，不得创建 `pendingLease`，不得向旧端发送 takeover 事件。
2. 新端在单遮罩中展示“页面已在另一端打开”，正文和标题均只读；点击“只读查看”只关闭遮罩，不申请写权。
3. 新端点击“继续在这里编辑”后调用 `takeover`；服务端创建 `pendingLease` 与 `takeoverId`，但不替换 active lease。
4. 服务端将会话状态置为 `takeover_pending`，向旧端发送 `editorSession.takeoverRequested`。
5. 旧端收到事件后必须立即冻结标题、正文、菜单、上传、debounced save，断开或暂停 Hocuspocus 写连接，并只允许触发一次 `handoff_flush`。
6. `handoff_flush` 只能由当前 active old lease 在 `graceUntil` 前提交，必须携带 `takeoverId`，成功或失败都不得继续普通编辑。
7. 旧端完成 flush 后调用 `release(reason=takeover_ack, takeoverId)`；服务端原子 promotion：pending lease 变为 active lease，旧 lease 标记 revoked。
8. 若旧端离线、不响应或 flush 超时，新端 heartbeat/takeover retry 在 `graceUntil` 后触发原子 promotion；旧端后续任何写入返回 stale/revoked。
9. promotion 前新端保持只读，不得创建可写 editor，不得连接可写 Hocuspocus provider。
10. promotion 后服务端向新端发送 `editorSession.granted`，向旧端发送 `editorSession.revoked`；旧端即使未收到事件，下一次 heartbeat 或写入也必须被拒绝。

## 10. 后端领域设计

### 10.1 领域边界

| domain_id | domain_goal | primary_entities | frontend_routes | backend_router | backend_service | allowed_commands | read_models | out_of_scope | split_trigger |
|---|---|---|---|---|---|---|---|---|---|
| DOMAIN-EDITOR-SESSION | 管理短时编辑权与互踢 | editor_session、takeover_request | 页面详情/文件弹窗运行时 | `EditorSessionController` | `EditorSessionService` | acquire、heartbeat、release、revoke、validateWrite | active_session_summary | 内容合并、页面权限判断本身 | 新增管理员诊断后台时拆只读 query facade |
| DOMAIN-PAGE-CONTENT | 页面内容写入 | page、ydoc | 页面详情/编辑页 | `PageController`、`CollaborationGateway` | `PageService`、`PersistenceExtension` | update content/title with valid lease | page_info、collab_document | 会话归属判定 | 新增模板/文件全量覆盖时不得继续塞入 PageService |
| DOMAIN-FILE-EDIT | 文件型内容写入 | attachment/file | 文件编辑弹窗 P1 | `AttachmentController` | `AttachmentService` | update file with valid lease | attachment_info | 文件格式解析 | 接入超过 3 类文件编辑器时拆 file editor service |

### 10.2 Redis 数据结构

P0 不新增 DB 表，使用 Redis 作为活跃会话 source of truth。

| Key | Value | TTL | 说明 |
|---|---|---|---|
| `editor_session:{workspaceId}:{resourceType}:{resourceId}:{userId}` | JSON `EditorLeaseState` | 45s，heartbeat 续期 | 当前用户在资源上的 active/pending 编辑权状态 |
| `editor_session_seq:{workspaceId}:{resourceType}:{resourceId}:{userId}` | integer | 7d | 单调递增 fencing token |
| `editor_takeover:{takeoverId}` | JSON `TakeoverRequest` | 90s | 接管交接窗口和一次性 handoff 状态 |
| `editor_socket:{workspaceId}:{userId}:{clientId}` | string socketId | 60s，socket 心跳续期 | clientId 到 Socket.IO 连接映射 |

`EditorLeaseState` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `workspaceId` | uuid | 工作区 |
| `userId` | uuid | 用户 |
| `resourceType` | `page`/`file` | 资源类型 |
| `resourceId` | string | canonical 资源 ID |
| `state` | `active`/`takeover_pending`/`revoked` | 当前会话状态 |
| `activeLease` | `LeaseRef` | 当前可写 lease |
| `pendingLease` | `LeaseRef/null` | 等待 promotion 的新端 lease |
| `takeoverId` | uuid/null | 当前接管 ID |
| `graceUntil` | ISO string/null | 旧端交接截止时间 |
| `handoffFlushUsed` | boolean | 旧端是否已使用一次交接保存 |
| `expiresAt` | ISO string | 过期时间 |

`LeaseRef` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `leaseId` | uuid | 租约 ID |
| `fencingToken` | number | 单调递增写入 fence |
| `sessionId` | uuid/null | 登录会话 ID，来自 access token |
| `clientId` | string | 浏览器端生成的 tab/client 标识 |
| `socketId` | string/null | Socket.IO 连接 ID |
| `runtimeMode` | `collab`/`local`/`file-editor` | 客户端运行模式，仅用于诊断 |
| `acquiredAt` | ISO string | 获取时间 |
| `lastHeartbeatAt` | ISO string | 最近心跳 |

### 10.3 标识与编码策略

| identifier_id | 标识名称 | identifier_type | generated_by | create_time_policy | user_visible_scope | editable | uniqueness_scope | source_of_truth | conflict_strategy |
|---|---|---|---|---|---|---|---|---|---|
| IDENT-001 | `leaseId` | system_id / 系统唯一标识 | backend_service 后端生成 | not_input，不得手填 | internal_only | no，只读 | workspace + user + resource | `/api/editor-sessions/acquire` | 旧 lease 被新 lease 替换 |
| IDENT-002 | `fencingToken` | system_id / monotonic fence | backend_service 后端生成，Redis INCR | not_input，不得手填 | internal_only | no，只读 | workspace + user + resource | Redis `editor_session_seq:*` | token 小于当前值则拒绝写入 |
| IDENT-003 | `clientId` | external_reference / 客户端引用号 | client_supplied | 页面初始化生成 | internal_diagnostics | no，单 tab 生命周期内只读 | browser tab | frontend sessionStorage | 重复时刷新生成 |
| IDENT-004 | `sessionId` | system_id / 登录会话标识 | backend_service 后端生成 | login_only | diagnostics_readonly | no，只读 | user + workspace | `user_sessions` | 过期或撤销则无法 acquire |
| IDENT-005 | `resourceId` | system_id / 资源系统 ID | backend_service 后端生成 | existing_resource_only | internal/link context | no，只读 | workspace + resourceType | pages/attachments 表 | 不存在返回 404 |
| IDENT-006 | `takeoverId` | system_id / 接管事务 ID | backend_service 后端生成 | takeover_only | internal_only | no，只读 | workspace + user + resource + takeover | `/api/editor-sessions/acquire` | 过期或已使用则拒绝 handoff |

补充约束：本需求不新增业务编码 `business_code`；普通创建页不出现任何 editor session 标识输入项；`leaseId`、`fencingToken`、`sessionId` 均为 server_return_only，不进入用户可见表单。

### 10.4 写入 fencing 规则

所有 P0 内容写接口必须满足以下规则；任何实现不得只在持久化尾部做补救校验。

1. 请求携带 `editSession.leaseId`、`editSession.fencingToken`、`editSession.clientId`。
2. 普通写入 `writeIntent=normal` 只接受 `EditorLeaseState.activeLease`，且 `state=active`。
3. 接管中 `state=takeover_pending` 时，pending lease 不允许写；active old lease 只允许一次 `writeIntent=handoff_flush`。
4. `handoff_flush` 必须携带 `takeoverId`，必须在 `graceUntil` 前提交，且 `handoffFlushUsed=false`。
5. `release(reason=takeover_ack)` 或 `graceUntil` 超时 promotion 必须原子执行：`pendingLease -> activeLease`、旧 lease revoked、`handoffFlushUsed=true`。
6. `/pages/update` 只要包含 `title`、`icon`、`themeColor`、`themePattern`、`content` 任一写字段，必须在任何 `pageRepo.updatePage` 或 Yjs direct connection 之前统一校验 editSession；校验失败整个请求失败，不允许部分写入。
7. 命中任一失败时返回稳定 409/403 错误码，不产生内容副作用。

### 10.5 Yjs 写入隔离规则

Yjs 防护必须在连接和消息入口完成，`PersistenceExtension.onStoreDocument` 不作为主隔离点：

1. Hocuspocus 连接建立时绑定 `workspaceId + userId + sessionId + clientId + leaseId + fencingToken + resourceId` 到连接上下文。
2. 连接认证只允许当前 active lease；pending lease 在 promotion 前不得创建可写协同连接。
3. 服务端进入 `takeover_pending` 时，旧端协同连接立即标记为 `draining` 并主动关闭或停止接收后续 update；旧端只剩 HTTP `handoff_flush` 路径。
4. promotion 后，任何旧 lease 的协同消息必须在 WebSocket/RedisSync wrapper 层被拒绝并关闭连接。
5. `PersistenceExtension.onStoreDocument` 仅负责持久化已被连接层接受的合法 Yjs 状态，并记录 stale connection 告警；不得因为当前 store context 的 lease 已过期而拒绝整份文档持久化，避免误丢 promotion 前已合法进入内存文档的更新或误伤其他协作者。

## 11. API 契约

### 11.1 `POST /api/editor-sessions/acquire`

业务目的：打开可编辑资源前申请编辑权；同账号已有旧端时只返回阻断态，不自动触发接管。

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `resourceType` | string | 是 | `page` P0，`file` P1 |
| `resourceId` | uuid | 是 | 资源 ID |
| `clientId` | string | 是 | 前端 tab/client ID |
| `runtimeMode` | string | 否 | `collab`/`local`/`file-editor` |

响应：

```json
{
  "status": "active | blocked_by_other",
  "leaseId": "uuid",
  "fencingToken": 12,
  "writable": true,
  "heartbeatIntervalMs": 10000,
  "expiresAt": "2026-05-14T10:54:22.000Z",
  "activeClientId": "client-old"
}
```

规则：

- 若无旧端或旧端已过期，直接返回 active。
- 若旧端存在且同 `clientId`，视为刷新，返回原 lease。
- 若旧端存在且不同 `clientId`，返回 `blocked_by_other`、`writable=false`，不得创建 pending lease，旧 active lease 不受影响。
- `blocked_by_other` 不向旧端发送任何事件，不展示通知，只由新端显示单遮罩。
- acquire 不得在同一事务中把新端设置为 pending 或 active，除非旧 active lease 已过期或不存在。

### 11.2 `POST /api/editor-sessions/takeover`

业务目的：用户在单遮罩点击“继续在这里编辑”后，显式接管同账号同资源的另一端编辑权。

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `resourceType` | string | 是 | 资源类型 |
| `resourceId` | uuid | 是 | 资源 ID |
| `clientId` | string | 是 | 当前 tab/client ID |

响应：

```json
{
  "status": "pending_takeover | active",
  "writable": false,
  "editSession": {
    "sessionId": "session-new",
    "clientId": "client-new",
    "leaseId": "uuid",
    "token": 13,
    "takeoverId": "uuid"
  },
  "takeoverId": "uuid",
  "graceUntil": 1778813647000,
  "activeClientId": "client-old",
  "pendingClientId": "client-new"
}
```

规则：

- 若无旧端或旧端已过期，直接返回 active。
- 若当前 client 已经是 active，返回 active 幂等结果。
- 若当前 client 已经是 pending，刷新 pending lease；到达 `graceUntil` 后可原子 promotion。
- 若存在其他 pending，最后一次显式点击的 client 成为新的 pending；旧 pending 返回 revoked 或在下一次 heartbeat 发现失效。
- takeover 创建 pending lease 后才向旧 active 端发送 `editorSession.takeoverRequested`。
- takeover 不允许无页面编辑权限的用户调用，权限规则与 acquire 一致。

### 11.3 `POST /api/editor-sessions/heartbeat`

业务目的：续期编辑权并发现自己是否已被踢。

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `resourceType` | string | 是 | 资源类型 |
| `resourceId` | uuid | 是 | 资源 ID |
| `leaseId` | uuid | 是 | 租约 ID |
| `fencingToken` | number | 是 | fencing token |
| `clientId` | string | 是 | client ID |

响应：

```json
{
  "status": "active | pending_takeover | takeover_requested | revoked | blocked_by_other",
  "writable": true,
  "expiresAt": "2026-05-14T10:54:22.000Z"
}
```

规则：

- active old lease 在 `takeover_pending` 时返回 `takeover_requested` 和 `writable=false`。
- pending new lease 在 `graceUntil` 前返回 `pending_takeover` 和 `writable=false`。
- pending new lease 在 `graceUntil` 后触发原子 promotion，成功后返回 `active` 和 `writable=true`。
- heartbeat 不能延长 `graceUntil`；只能延长当前 active 或 pending lease 的 Redis TTL。

错误：

| error_code | HTTP | 场景 |
|---|---|---|
| `EDIT_SESSION_REVOKED` | 409 | 当前端已被接管 |
| `EDIT_SESSION_EXPIRED` | 409 | 当前 lease 已过期 |
| `EDITOR_SESSION_FORBIDDEN` | 403 | 用户无资源编辑权限 |

### 11.4 `POST /api/editor-sessions/release`

业务目的：页面关闭、切只读、被踢交接完成时释放编辑权。

请求字段同 heartbeat，额外：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `reason` | string | 否 | `unload`/`switch_to_readonly`/`takeover_ack` |
| `hasRecoveryDraft` | boolean | 否 | 本地是否留有恢复草稿 |
| `takeoverId` | uuid | 否 | `reason=takeover_ack` 时必填 |

规则：

- release 幂等；重复 release 返回 200。
- release 只允许释放当前 lease；旧 lease release 不影响新 lease。
- `reason=takeover_ack` 时，若 `takeoverId` 匹配且 pending lease 存在，服务端立即原子 promotion。
- `reason=unload` 只释放当前 active lease，不会自动授予其他端写权；其他端仍需 acquire。

### 11.5 页面内容写接口改造

现有 `POST /api/pages/update` 增加可选字段；功能开关开启后，涉及 `title`、`icon`、`themeColor`、`themePattern`、`content` 任一写字段时必须传。

```json
{
  "pageId": "uuid",
  "title": "string",
  "content": {},
  "operation": "replace",
  "format": "json",
  "editSession": {
    "resourceType": "page",
    "resourceId": "uuid",
    "leaseId": "uuid",
    "fencingToken": 12,
    "clientId": "client-new",
    "writeIntent": "normal",
    "takeoverId": null
  }
}
```

兼容策略：

- 功能开关关闭：保持旧行为。
- 功能开关开启但客户端未传 `editSession`：可配置为 warn-only 或 strict。灰度期先 warn-only，P0 验收后 strict。
- `writeIntent=normal` 只接受当前 active lease。
- `writeIntent=handoff_flush` 只接受 takeover pending 状态下的旧 active lease，且必须携带 `takeoverId`；该意图只允许旧端在冻结后提交最后一次 HTTP 保存，不允许继续编辑或连接 Yjs。
- 标题、图标、主题、正文任一写入命中 stale lease 时，整个请求失败，不允许部分更新。
- 后端实现顺序必须是：解析 DTO -> 权限校验 -> editSession validateWrite -> 再执行任何 `pageRepo.updatePage` 或 `collaborationGateway.handleYjsEvent`。

### 11.6 Hocuspocus/Yjs 连接改造

前端创建 `HocuspocusProvider` 时携带：

- `leaseId`
- `fencingToken`
- `clientId`
- `resourceId`
- collab token 中的 `sessionId`

服务端在协同认证和消息处理阶段校验：

1. `AuthenticationExtension` 校验用户有页面编辑权限，并校验当前 lease 必须是 active lease。
2. `POST /api/auth/collab-token` 从当前 access token 的 `sessionId` 生成 collab token；`JwtCollabPayload` 增加 `sessionId`。旧 collab token 在 `EDITOR_SESSION_COLLAB_VALIDATE=false` 时兼容，在 strict collab validate 时拒绝写连接并要求客户端刷新 token。
3. 协同连接上下文必须包含 `workspaceId/userId/sessionId/clientId/resourceId/leaseId/fencingToken`。
4. 协同消息处理阶段发现 lease 已失效、pending 未 promoted、或连接处于 draining 时关闭连接，禁止旧端继续提交 Yjs update。
5. promotion 前 pending new 不得建立可写 Hocuspocus provider；前端只渲染只读 preview。
6. `PersistenceExtension.onStoreDocument` 只持久化已通过连接/消息入口校验的合法 Yjs 状态，不基于过期 lease 拒绝整份文档。

> 开工门槛：若当前 Hocuspocus 版本无法在消息前拦截 stale update，必须先在 `CollaborationGateway` 或 RedisSync wrapper 层完成连接级阻断与主动关闭；不得以下游 `onStoreDocument` 拒绝作为 P0 完成方案。

## 12. WebSocket 事件

复用现有 Socket.IO `message` 事件，增加事件类型。

| event | 发送方 | 接收方 | 说明 |
|---|---|---|---|
| `editorSession.registerClient` | client | server | 建立 `clientId -> socketId` 映射，支持定向互踢事件 |
| `editorSession.takeoverRequested` | server | old client | 新端正在接管，旧端冻结并交接 |
| `editorSession.revoked` | server | old client | 旧端已失去编辑权 |
| `editorSession.granted` | server | new client | 新端可启用编辑 |
| `editorSession.released` | server | new client/diagnostics | 旧端已释放 |

### 12.1 Client 与 Socket 绑定协议

1. `UserProvider` 建立 Socket.IO 连接后，客户端立即发送：

```json
{
  "operation": "editorSession.registerClient",
  "clientId": "client-current"
}
```

2. 服务端使用已认证的 `workspaceId/userId/sessionId/socket.id` 写入 `editor_socket:{workspaceId}:{userId}:{clientId}`，TTL 60 秒，并在 socket 心跳或 register 重试时续期。
3. takeover 时服务端按旧 active lease 的 `clientId` 查询 socketId；命中则定向发送 takeover/revoked，未命中则不广播给整个 user room，避免误踢同账号其他资源页面。
4. 如果旧端 socket 未注册、已断开或 TTL 过期，显式 takeover 后新端仍进入 `pending_takeover`；旧端通过 heartbeat/write 被动发现 revoked。
5. Socket 断开时清理该 socket 对应的 client 映射，但不立即释放 active lease；active lease 仍依赖 heartbeat TTL，避免短暂网络抖动导致错误让权。
6. 同一 `clientId` 多 socket 注册时，保留最新 socketId，并记录 `editor_session.client_duplicate_detected` 日志。

事件 payload：

```json
{
  "operation": "editorSession.revoked",
  "resourceType": "page",
  "resourceId": "uuid",
  "leaseId": "uuid",
  "takeoverId": "uuid",
  "reason": "takeover",
  "takeoverBy": {
    "clientId": "client-new",
    "sessionId": "uuid"
  }
}
```

## 13. 前端设计

### 13.1 Client ID

- 每个浏览器标签生成 `clientId = crypto.randomUUID()`。
- 存储在 `sessionStorage`，页面刷新保留，同标签刷新不触发互踢。
- 新标签、新浏览器、新设备生成不同 `clientId`。
- 仅用于编辑会话，不作为安全凭证；安全凭证仍以后端认证和 lease 校验为准。
- 为处理浏览器复制标签页时 `sessionStorage` 被克隆的问题，页面初始化必须通过 `BroadcastChannel('docmost-editor-client')` 广播当前 `clientId`；若 300ms 内收到相同 `clientId` 的存活响应，新标签必须重新生成 `clientId` 并覆盖 sessionStorage，再执行 acquire。
- `clientId` 不得存入 localStorage，不得跨标签共享；否则同账号同资源互踢无法可靠触发。

### 13.2 新增 Hook

新增 `useEditorSessionLease(resourceType, resourceId, options)`：

| 返回字段 | 含义 |
|---|---|
| `status` | `idle/acquiring/blocked_by_other/pending_takeover/active/takeover_requested/revoked/error` |
| `editSession` | 写接口需要携带的 lease 信息 |
| `isEditableByLease` | 是否允许启用编辑器写态 |
| `writable` | 当前 lease 是否可写 |
| `takeover` | takeoverId、graceUntil、previousClientId |
| `continueHere()` | 用户点击“继续在这里编辑”后显式调用 takeover |
| `viewReadonly()` | 用户点击“只读查看”后关闭阻断遮罩，保持只读 |
| `release()` | 主动释放 |
| `heartbeat()` | 内部定时续期 |
| `recoveryDraft` | 被踢时保存的本地草稿信息 |

### 13.3 页面级会话门控与单遮罩

编辑会话必须从正文编辑器提升到页面级门控，避免只提示不真正只读。

| gate 输出 | 作用范围 |
|---|---|
| `effectiveEditable` | `TitleEditor`、`PageEditor`、Header 写操作、附件上传、搜索替换、评论写入口 |
| `editSession` | 页面标题、正文、图标、主题、fallback 保存、附件 P1 写入 |
| `overlayState` | 单一遮罩的展示状态，替代 notifications + modal 叠加 |
| `continueHere()` | 显式 takeover，允许最后点击的一端接管 |
| `viewReadonly()` | 当前端放弃写权或保持无写权，只读查看 |

遮罩组件：

- 组件名：`EditorSessionOverlay`。
- 同一页面同时最多渲染一个遮罩，不再调用 `notifications.show` 和 `modals.open`。
- 遮罩必须通过 portal 渲染到 `document.body`，使用 fixed viewport overlay 覆盖整个网页应用区域，包括顶部导航、搜索框、用户菜单、左侧空间树、页面工具栏和正文区域。
- 浏览器地址栏、书签栏、标签栏不属于网页 DOM，不在遮罩覆盖范围内。
- 遮罩背景必须阻止点击穿透，不允许用户在未选择“继续在这里编辑”或“只读查看”前误触应用内写入口。
- 弹窗卡片居中于整个 viewport，而不是居中于正文编辑容器。
- `blocked_by_other`、`takeover_requested`、`revoked`：展示“继续在这里编辑”和“只读查看”。
- `pending_takeover`：展示等待态，按钮禁用或仅允许取消为只读。
- 点击“继续在这里编辑”后，当前端调用 `takeover`；若自己已是旧 active 且被另一端接管，则形成反向接管，最后点击者获胜。
- 点击“只读查看”后，遮罩关闭，标题和正文仍只读；不得隐式 acquire 或 takeover。

### 13.4 PageEditor 接入

接入点：

1. `PageEditor` 在创建 Yjs provider 前申请 `page` lease。
2. `runtimeMode=preview` 时不申请写 lease；用户进入可编辑态或默认编辑模式时申请。
3. `blocked_by_other` 时渲染只读 preview 或不可写 editor，并显示单遮罩；不创建可写 Hocuspocus provider。
4. `pending_takeover` 时仅渲染只读 preview 或不可写 editor，不创建可写 Hocuspocus provider。
5. 只有 `lease.status=active && writable=true` 才创建可写 editor 和 remote provider。
6. local fallback 的 `updatePage` 必须携带 `editSession`。
7. 旧端收到 `takeoverRequested` 后：
   - 立即 `editor.setEditable(false)`。
   - 标题、正文、菜单、上传、搜索替换等写入口统一禁用。
   - 停止 debounced save。
   - 销毁或 detach Hocuspocus provider，停止发送 Yjs update。
   - 若有 queued save，使用 `writeIntent=handoff_flush` 和 `takeoverId` 提交一次。
   - 若存在未保存内容，写入本地 recovery draft。
   - 调用 `release(reason=takeover_ack, takeoverId)`，让 pending lease promotion。
8. 旧端收到 `revoked` 或 heartbeat 返回 revoked 后，只读展示，不再重试普通保存。

### 13.5 TitleEditor 接入

标题编辑属于同一个 `page` lease：

- 没有 active lease 时标题编辑器只读。
- 标题保存请求携带同一个 `editSession`。
- stale 写入返回 409 时，标题回滚到服务端最新值，并显示被踢提示。

### 13.6 文件编辑器接入（P1）

文件型资源使用 `resourceType=file`：

| 场景 | resourceId | 说明 |
|---|---|---|
| Draw.io | attachmentId | 保存 SVG/XML 前申请 |
| Excalidraw | attachmentId | 打开编辑弹窗前申请 |
| 附件原位编辑 | attachmentId | 写文件内容前申请 |

P1 canonical resource id 规则：

1. `resourceType=file` 的 `resourceId` 必须是服务端可校验的 canonical attachmentId，不允许 node id、临时 DOM id、文件名或 URL 混用。
2. 如果某个编辑器当前只有 node id，没有 attachmentId，必须先通过服务端 materialize 成 attachment，再申请 file lease；不得直接用 node id 作为锁 ID。
3. 服务端 acquire file lease 时必须反查 attachment 所属 page，并沿用页面编辑权限校验。
4. 同一个物理文件无论从页面正文、文件预览、附件列表哪个入口打开，都必须解析到同一个 canonical attachmentId。

### 13.7 恢复草稿策略

恢复草稿是正式能力，不是替代服务端写入的临时兜底。

| 字段 | 规则 |
|---|---|
| 存储位置 | IndexedDB，库名 `docmost_editor_recovery`，不得使用 localStorage 存大正文 |
| key | `workspaceId:userId:resourceType:resourceId:clientId:revokedLeaseId` |
| 内容 | ProseMirror JSON、标题草稿、base server updatedAt、revokedAt、takeoverId、contentHash |
| TTL | 默认 7 天；同一用户最多保留 20 条，超过按 revokedAt 最旧清理 |
| 清理 | 用户手动丢弃、成功恢复、退出登录、TTL 到期时清理 |
| 恢复动作 | 仅允许用户主动打开恢复入口后复制或重新应用；不得在后台自动覆盖服务端 |
| 安全边界 | 草稿只保存在本机浏览器，不上传服务端；共享设备风险在用户侧提示中说明 |

被踢时若存在未保存内容，旧端必须先写 recovery draft，再进入只读态；draft 写入失败时展示错误并允许用户手动复制当前内容。

## 14. 用户可见文案边界

用户侧只展示结果与下一步，不暴露 `leaseId`、`fencingToken`、Redis、Yjs 等内部术语。

| 场景 | user_visible_copy | internal_note |
|---|---|---|
| 新端发现已有编辑端 | `此页面已在另一端打开。继续在这里编辑会停止另一端编辑。` | acquire returned blocked_by_other |
| 遮罩主按钮 | `继续在这里编辑` | explicit takeover |
| 遮罩次按钮 | `只读查看` | dismiss overlay, keep readonly |
| 新端接管中 | `正在接管编辑权...` | takeover returned takeover grace |
| 新端等待旧端交接 | `正在等待另一端完成交接...` | pending_takeover before promotion |
| 新端获得编辑权 | `已在本端继续编辑。` | editorSession.granted |
| 旧端被踢 | `此页面已在另一端打开编辑，本端已切换为只读。` | editorSession.revoked |
| 旧端有未保存内容 | `未保存内容已保留为恢复草稿。` | recovery draft saved |
| 草稿写入失败 | `未保存内容无法自动保留，请先手动复制当前内容。` | recovery draft write failed |
| 旧端保存被拒绝 | `当前端已失去编辑权，无法继续保存。` | EDIT_SESSION_STALE_WRITE |
| lease 申请失败 | `暂时无法进入编辑，请稍后重试。` | Redis/API error |

## 15. 权限矩阵

| 操作 | Workspace Admin | Space Writer | Page Writer | Page Reader |
|---|---:|---:|---:|---:|
| 查看页面 | 是 | 是 | 是 | 是 |
| 申请 page lease | 有页面编辑权限时是 | 有页面编辑权限时是 | 是 | 否 |
| 接管同账号旧端 | 是，仅限自己账号 | 是，仅限自己账号 | 是，仅限自己账号 | 否 |
| 踢其他账号编辑端 | 否 | 否 | 否 | 否 |
| 写内容 | 需 active lease | 需 active lease | 需 active lease | 否 |
| 只读诊断 P1 | 可选 | 否 | 否 | 否 |

后端必须继续调用既有页面权限校验；`EditorSession` 不替代 ACL。

## 16. 跨模块联动与阻断规则

| rule_id | source_of_truth | trigger_action | block_condition | backend_guard | data_constraint | error_code | recovery_action |
|---|---|---|---|---|---|---|---|
| LINK-001 | EditorSession Redis key | `/pages/update` 写任一页面字段 | editSession 缺失或非当前 active lease | PageService 在 DB/Yjs 写入前校验 | 同一 user/resource 同时仅一个 normal writer | `EDIT_SESSION_REQUIRED` / `EDIT_SESSION_REVOKED` | 前端重新 acquire 或切只读 |
| LINK-002 | EditorSession Redis key | `/pages/update` handoff flush | 不在 takeover_pending、超时、已使用或 takeoverId 不匹配 | validateHandoffFlush | 每个 takeoverId 仅一次 handoff flush | `EDIT_SESSION_HANDOFF_EXPIRED` / `EDIT_SESSION_HANDOFF_ALREADY_USED` | 旧端保留恢复草稿，新端继续 promotion |
| LINK-003 | EditorSession Redis key | Yjs 连接/消息 | lease 已被新端接管或 pending 未 promoted | Collab auth/message wrapper 校验，主动关闭旧连接 | stale update 不得进入 Yjs 内存文档 | `EDIT_SESSION_STALE_WRITE` | 关闭旧连接，旧端保存恢复草稿 |
| LINK-004 | PageAccessService | acquire page lease | 用户无页面编辑权限 | acquire 前校验页面权限 | 不越权创建编辑权 | `EDITOR_SESSION_FORBIDDEN` | 只读打开 |
| LINK-005 | Attachment permission | acquire file lease P1 | 用户无文件所属页面编辑权限 | file resource 反查页面权限 | file resource 必须解析到 canonical attachmentId | `EDITOR_SESSION_FORBIDDEN` | 只读预览文件 |

## 17. 错误码

| error_code | HTTP | retryable | 前端动作 |
|---|---:|---|---|
| `EDIT_SESSION_REQUIRED` | 409 | 是 | 重新 acquire；失败则只读 |
| `EDIT_SESSION_TAKEOVER_PENDING` | 409 | 是 | 新端继续只读等待或 heartbeat 重试 |
| `EDIT_SESSION_REVOKED` | 409 | 否 | 冻结编辑，保留恢复草稿 |
| `EDIT_SESSION_EXPIRED` | 409 | 是 | 重新 acquire |
| `EDIT_SESSION_STALE_WRITE` | 409 | 否 | 阻断保存，刷新服务端最新内容 |
| `EDIT_SESSION_HANDOFF_EXPIRED` | 409 | 否 | 停止交接保存，保留恢复草稿 |
| `EDIT_SESSION_HANDOFF_ALREADY_USED` | 409 | 否 | 停止重复保存，保留恢复草稿 |
| `EDITOR_SESSION_FORBIDDEN` | 403 | 否 | 切只读，展示无权限 |
| `EDITOR_SESSION_RESOURCE_NOT_FOUND` | 404 | 否 | 展示资源不存在 |
| `EDITOR_SESSION_CLIENT_NOT_REGISTERED` | 202/200 with warning | 是 | 继续 pending takeover，依赖 heartbeat 兜底 |
| `EDITOR_SESSION_BACKEND_UNAVAILABLE` | 503 | 是 | 保持只读或本地草稿，不自动写服务端 |

## 18. 功能操作说明

| operation_id | operation_name | user_role | entry_path | preconditions | operation_steps | expected_result | exception_cases | recovery_action | acceptance_case_id |
|---|---|---|---|---|---|---|---|---|---|
| OP-001 | 打开页面并获得编辑权 | R-EDITOR | 页面详情页 | 用户有编辑权限 | 进入页面 -> 申请 page lease -> lease active 后初始化可写编辑器 | 当前端可编辑并开始 heartbeat | acquire 失败、无权限、Redis 异常 | 只读打开或重试 acquire | ACC-001 |
| OP-002 | 新端显式接管旧端 | R-EDITOR | 新标签/新设备打开同一页面 | 旧端存在 active lease | 新端 acquire 得到 blocked_by_other -> 单遮罩提示 -> 用户点击继续在这里编辑 -> takeover 创建 pending lease -> 服务端通知旧端 -> 旧端冻结并断开协同写连接 -> 旧端一次 handoff_flush 或超时 -> pending promotion -> 新端启用编辑 | 点击前旧端不受影响；点击后 promotion 前新端只读；promotion 后旧端只读、新端可写 | 旧端离线、不响应、handoff 失败 | 超时后新端 promotion；旧端后续写入 409 并保留草稿 | ACC-002、ACC-016 |
| OP-003 | 旧端被踢后尝试保存 | R-EDITOR | 旧标签页 | 旧端已 revoked 或 handoff 过期 | 用户继续输入或旧 debounced save 触发 | 保存被阻断，无服务端副作用 | 本地存在未保存内容、草稿写入失败 | 保存为恢复草稿；草稿失败则提示手动复制 | ACC-004 |
| OP-004 | 多账号协作 | R-COLLAB | 两个账号打开同一页面 | 两个账号都有编辑权限 | 用户 A、B 分别 acquire 自己账号的 lease -> 进入协同 | 双方可协作 | 其中一个账号多端打开 | 只踢同账号旧端 | ACC-006 |
| OP-005 | 文件编辑互踢 P1 | R-EDITOR | Draw.io/Excalidraw 编辑弹窗 | 用户有页面编辑权限 | 打开文件编辑 -> acquire file lease -> 保存文件 | 同账号仅一个端可保存 | 旧端弹窗离线后保存 | 409 阻断并保留草稿 | ACC-010 |

## 19. 改造影响矩阵

| impact_id | 变更类型 | As-Is | To-Be | 影响页面/交互 | 影响接口 | 影响数据 | 灰度 | 回滚 |
|---|---|---|---|---|---|---|---|---|
| IM-001 | 编辑初始化 | 直接创建 editor/provider | 先 acquire lease | 页面编辑页 | `/editor-sessions/acquire` | Redis | feature flag | 关闭 flag 回到旧初始化 |
| IM-002 | 页面所有写字段 | `/pages/update` 先更新元数据，再按需更新内容 | 任一写字段都先统一校验 active lease | 标题、图标、主题、正文 | `/pages/update` | 无 DB 变更 | warn-only -> strict | strict 回 warn-only |
| IM-003 | fallback 保存 | `/pages/update` replace | normal 或 handoff_flush 均受 lease/fence 保护 | 本地 fallback | `/pages/update` | 无 DB 变更 | strict only for acceptance | strict 回 warn-only |
| IM-004 | Yjs 连接 | 只校验协同 token 和权限 | 连接/消息入口增加 active lease 校验，旧连接 takeover 时关闭 | 页面协同 | `/collab` websocket | 无 DB 变更 | 按 workspace | 关闭 collab lease 校验 |
| IM-005 | Socket 定向事件 | 无 clientId/socketId 映射 | registerClient 建立映射并定向通知旧端 | 全局登录态 | Socket.IO message | Redis socket key | feature flag | 关闭互踢事件 |
| IM-006 | 被踢体验 | 多端都可继续编辑 | 旧端只读并留 IndexedDB 草稿 | 页面编辑页 | Socket.IO event | local draft | 按用户比例 | 关闭互踢事件 |
| IM-007 | 文件编辑 P1 | 多端可保存同一附件 | 同账号同 canonical attachmentId 单活 | 文件弹窗 | attachment update APIs | Redis | 独立 flag | P1 flag 关闭 |

## 20. 灰度与兼容策略

功能开关：

| flag | 默认 | 说明 |
|---|---|---|
| `EDITOR_SESSION_ENABLED` | false | 总开关 |
| `EDITOR_SESSION_STRICT_WRITE` | false | 写接口是否强制校验 editSession |
| `EDITOR_SESSION_COLLAB_VALIDATE` | false | Yjs 连接/消息是否强校验 lease |
| `EDITOR_SESSION_FILE_ENABLED` | false | P1 文件互踢 |

灰度顺序：

1. Stage/dev 全量开启，`EDITOR_SESSION_STRICT_WRITE=true`、`EDITOR_SESSION_COLLAB_VALIDATE=true`，作为 P0 验收唯一口径。
2. Production 先开启 `EDITOR_SESSION_ENABLED`，写接口 warn-only 仅用于观测缺失 editSession 的旧入口，不宣称已解决覆盖问题。
3. 修复所有 warn-only 日志中的旧入口后，10% workspace 开启 strict write。
4. 30% workspace 开启 collab validate；若 stale update 仍能进入 Yjs 内存文档，禁止继续扩大灰度。
5. 100% 开启 P0 strict write + collab validate。
6. P1 文件编辑单独灰度，且必须先完成 canonical attachmentId 解析。

验收口径：

- P0 只有在 `EDITOR_SESSION_STRICT_WRITE=true` 且 `EDITOR_SESSION_COLLAB_VALIDATE=true` 的环境下通过 ACC-001 到 ACC-014、ACC-016 到 ACC-018，才算完成。
- warn-only 阶段只能用于兼容性观察，不作为风险关闭依据。
- 关闭 collab validate 后只能回退到兼容模式，不能声称防止 Yjs stale update。

回滚：

- 优先关闭 `EDITOR_SESSION_STRICT_WRITE`，保留事件和日志。
- 若编辑初始化异常，关闭 `EDITOR_SESSION_ENABLED`。
- 若协同连接异常，关闭 `EDITOR_SESSION_COLLAB_VALIDATE`。
- Redis key 均为短 TTL，无需数据迁移回滚。

## 21. 日志、审计与可观测性

结构化日志字段：

| event | 必填字段 |
|---|---|
| `editor_session.acquire` | workspaceId、userId、sessionId、clientId、resourceType、resourceId、leaseId、fencingToken、result |
| `editor_session.register_client` | workspaceId、userId、sessionId、clientId、socketId、result |
| `editor_session.takeover` | oldLeaseId、pendingLeaseId、takeoverId、graceUntil、handoffTimeoutMs |
| `editor_session.handoff_flush` | takeoverId、oldLeaseId、result、error_code |
| `editor_session.promoted` | takeoverId、oldLeaseId、newLeaseId、promotionReason |
| `editor_session.heartbeat_failed` | leaseId、reason |
| `editor_session.revoked` | oldLeaseId、newLeaseId、reason |
| `editor_session.collab_connection_closed` | leaseId、clientId、reason、resourceId |
| `editor_session.stale_write_rejected` | pageId/resourceId、leaseId、currentLeaseId、error_code |
| `editor_session.recovery_draft_created` | workspaceId、userId、resourceType、resourceId、clientId、revokedLeaseId |

指标：

- acquire 成功率。
- acquire P95 延迟。
- stale write reject 次数。
- takeover 后旧端 ack 率。
- takeover promotion 延迟 P95。
- handoff_flush 成功率和超时率。
- 被踢恢复草稿生成次数。
- 页面保存 409 比例。
- collab stale connection closed 次数。

告警建议：

- `EDITOR_SESSION_BACKEND_UNAVAILABLE` 5 分钟内超过阈值。
- strict 开启后 `/pages/update` 409 比例异常升高。
- collab validate 开启后 `/collab` 认证失败率异常升高。

## 22. 测试要点

### 22.1 功能测试

| case_id | 场景 | 前置条件 | 步骤 | 预期 |
|---|---|---|---|---|
| ACC-001 | 单端打开页面 | 用户有编辑权限 | 打开页面 | acquire 成功，编辑器可写，heartbeat 正常 |
| ACC-002 | 同账号双标签打开不自动互踢 | 标签 A 已编辑，同账号打开标签 B | B 打开同页面但不点击继续 | B 只出现一个遮罩且只读；A 不收到 takeover/revoked，仍可编辑 |
| ACC-003 | 同标签刷新不互踢 | 标签 A 刷新 | 刷新页面 | clientId 保留，刷新后继续拥有或重新获得同一资源编辑权 |
| ACC-004 | 旧端离线后恢复 | A 断网，B 接管并保存，A 恢复网络 | A 自动保存触发 | A 保存被 409 阻断，不覆盖 B |
| ACC-005 | 旧端有未保存内容 | A 修改后未保存，B 接管 | A 被踢 | A 保留恢复草稿，不自动写服务端 |
| ACC-006 | 不同账号协作 | 用户 A、B 均有编辑权限 | 两账号打开同页编辑 | 双方均可编辑，不互踢 |
| ACC-007 | 无权限用户 acquire | 用户只有读权限 | 直接调用 acquire | 返回 403，页面只读 |
| ACC-008 | Redis 短暂异常 | 模拟 Redis unavailable | 打开编辑页 | 不进入可写态，不静默丢内容 |
| ACC-009 | 标题保存 stale | A 标题编辑，B 接管 | A 保存标题 | 返回 409，标题不覆盖 |
| ACC-010 | 二阶段 handoff flush | A 有 queued save，B 接管 | A 收到 takeoverRequested 后 handoff_flush | A 的一次交接保存成功；B promotion 后可写；A 普通保存被拒绝 |
| ACC-011 | pending 新端不可写 | B 点击继续后处于 pending | B 尝试 `/pages/update` normal | 返回 `EDIT_SESSION_TAKEOVER_PENDING` 或 stale，不产生写入 |
| ACC-012 | stale Yjs update 不入内存 | A 协同连接被 takeover 后继续发 update | 服务端连接层收到 stale update | 连接关闭，更新不进入 Yjs doc，B 内容不被污染 |
| ACC-013 | Socket 未注册降级 | A socket 断开但 lease 未过期，B 接管 | B 点击继续在这里编辑 | B pending 到 graceUntil 后 promotion；A 恢复后 heartbeat 返回 revoked |
| ACC-014 | 恢复草稿生命周期 | A 被踢且存在未保存内容 | 生成、查看、删除或恢复草稿 | 草稿 key/TTL/清理符合 13.7；不自动覆盖服务端 |
| ACC-015 | P1 文件互踢 | 同账号两个端打开同一 Draw.io attachmentId | B 接管 | A 文件保存被阻断，B 可保存；node id 入口解析为同一 attachmentId |
| ACC-016 | 点击继续后显式接管 | A 已编辑，B 处于 blocked_by_other | B 点击“继续在这里编辑” | B 进入 pending_takeover 并等待 promotion；A 标题和正文立即只读并显示同一个遮罩；promotion 后 B 可写 |
| ACC-017 | 反向接管 | B 已接管，A 处于 revoked/takeover_requested | A 点击“继续在这里编辑” | A 可重新发起 takeover，B 被切换为只读，最后点击的一端拥有编辑权 |
| ACC-018 | 单遮罩约束 | 双标签任意接管状态 | 触发 blocked、pending、revoked | 页面只出现一个遮罩，不出现额外 notification 或重复 modal |
| ACC-019 | 全应用遮罩覆盖 | B 触发 blocked_by_other 或 A 触发 revoked | 观察页面顶部导航、搜索框、用户菜单、左侧树、正文 | 网页应用内部全部被遮罩覆盖且不可点击穿透；弹窗居中于 viewport；浏览器书签栏不受影响 |

### 22.2 接口测试

| case_id | 接口 | 验证点 |
|---|---|---|
| API-001 | `/editor-sessions/acquire` | 首次 acquire 返回 active；重复同 client 幂等 |
| API-002 | `/editor-sessions/acquire` | 不同 client acquire 只返回 blocked_by_other，不创建 pending，不通知旧端 |
| API-003 | `/editor-sessions/takeover` | 不同 client 显式 takeover 后创建 pending 并通知旧端 |
| API-004 | `/editor-sessions/heartbeat` | 当前 lease 续期成功；旧 lease 返回 409 |
| API-005 | `/editor-sessions/heartbeat` | pending new 在 graceUntil 后原子 promotion |
| API-006 | `/editor-sessions/release` | release 幂等且不释放新 lease；takeover_ack 可 promotion |
| API-007 | `/pages/update` | 无 editSession 在 strict 下返回 `EDIT_SESSION_REQUIRED` |
| API-008 | `/pages/update` | stale fencingToken 返回 `EDIT_SESSION_STALE_WRITE` |
| API-009 | `/pages/update` | title/icon/theme/content 任一写字段均在 DB 写前校验 |
| API-010 | `/pages/update` | handoff_flush 超时或重复返回稳定错误码 |
| API-011 | `/collab` | stale lease 连接被拒绝或主动关闭 |
| API-012 | Socket.IO `editorSession.registerClient` | 注册 clientId 后 takeover 可定向通知旧端 |

### 22.3 回归范围

| impact_id | 必测类型 | 回归用例 |
|---|---|---|
| IM-001 | 功能 + 权限 | ACC-001、ACC-007 |
| IM-002 | 接口 + 异常 | API-007、API-009、ACC-009 |
| IM-003 | 接口 + 异常 | API-008、API-010、ACC-004、ACC-010 |
| IM-004 | 协同 + 权限 | API-011、ACC-006、ACC-012 |
| IM-005 | WebSocket + 降级 | API-012、ACC-002、ACC-013 |
| IM-006 | UI + 本地恢复 | ACC-002、ACC-005、ACC-014、ACC-016、ACC-018 |
| IM-007 | 文件保存 | ACC-015 |

## 23. 实施拆分

### Backend P0

1. 新增 `EditorSessionModule`、`EditorSessionService`、`EditorSessionController`。
2. 新增 Redis repository，封装 acquire blocked check、显式 takeover、heartbeat promotion、release takeover_ack、validateWrite、validateHandoffFlush。
3. 扩展 Socket.IO 连接上下文：通过 `editorSession.registerClient` 写入 `sessionId`、`socketId`、`clientId` 映射。
4. 新增 WebSocket event 类型和服务端定向 emit 方法，旧端 socket 缺失时走 heartbeat 降级。
5. 扩展 `JwtCollabPayload`，collab token 携带当前 access token 的 `sessionId`，并定义旧 token 在 strict collab validate 下拒绝。
6. `AuthenticationExtension` 增加 page active lease 校验，pending lease 不允许建立可写协同连接。
7. 在 `CollaborationGateway` 或 RedisSync wrapper 层增加 stale lease 消息阻断和主动关闭，确保 stale update 不进入 Yjs 内存文档。
8. `PersistenceExtension.onStoreDocument` 仅记录 stale 诊断，不基于过期 lease 拒绝整份合法文档状态。
9. `PageService.update` / `updatePageContent` 增加 `editSession` DTO 校验，且必须在任何 DB update 和 Yjs direct connection 前执行。
10. P1 前实现 file canonical attachmentId resolver；P0 先保留接口边界。
11. 补充错误码、结构化日志和单元测试。

### Frontend P0

1. 新增 `editor-session` feature：types、service、query/hook、clientId util。
2. `UserProvider` socket 连接后发送 `editorSession.registerClient`，并处理未注册降级。
3. 页面级容器接入 `useEditorSessionLease`，输出统一 `effectiveEditable`，覆盖 `TitleEditor`、`PageEditor` 和页面写操作入口。
4. Hocuspocus provider 携带 lease 参数，且只在 active+writable 时创建可写 provider。
5. local fallback `updatePage` 携带 `editSession`；接管时 queued save 使用 `writeIntent=handoff_flush`。
6. `TitleEditor` 使用同一个 page lease，stale 时回滚服务端最新标题。
7. 新增 revoke/takeover 事件订阅，旧端冻结、断开协同写连接并写 recovery draft。
8. 实现 IndexedDB recovery draft 仓储、TTL 清理和手动恢复/丢弃入口。
9. 新增 `EditorSessionOverlay` 单遮罩，替换通知和重复 modal；遮罩通过 portal 覆盖全应用 viewport；顶部连接状态只保留网络/同步类状态，不承载接管阻断。
10. i18n 增加用户可见文案。
11. 补充 Playwright 双标签、断网恢复、pending 不可写、草稿生命周期测试。

### P1

1. Draw.io、Excalidraw、附件原位编辑接入 `resourceType=file`。
2. Attachment 写接口增加 `editSession`。
3. 增加只读诊断接口：查询当前用户自己的 active editor sessions。

## 24. 开工清单

| task_id | 任务 | 负责人类型 | 依赖 | 完成标准 |
|---|---|---|---|---|
| DEV-001 | Backend EditorSessionModule | backend | 无 | acquire/heartbeat/release 单测通过 |
| DEV-002 | 二阶段 takeover/promotion | backend | DEV-001 | pending 不可写，grace 后 promotion 原子完成 |
| DEV-003 | PageService 写入 fencing | backend | DEV-001 | 所有页面写字段 stale 均返回 409 且无 DB 副作用 |
| DEV-004 | Collab 入口 lease 校验 | backend | DEV-001 | stale Yjs update 不进入内存文档 |
| DEV-005 | Socket.IO client 注册和定向事件 | backend | DEV-001 | 旧端能收到 takeover/revoked，未注册可降级 |
| DEV-006 | Collab token sessionId | backend | DEV-001 | strict collab validate 下旧 token 被拒绝并刷新 |
| DEV-007 | Frontend useEditorSessionLease | frontend | DEV-001 | blocked/pending/revoked 不可写，active 才可写 |
| DEV-008 | PageEditor/TitleEditor 接入 | frontend | DEV-007 | 双标签互踢与标题 stale 阻断通过 |
| DEV-009 | Recovery draft | frontend | DEV-008 | 被踢未保存内容按 TTL 和 key 保留 |
| DEV-010 | e2e 双标签测试 | QA/fullstack | DEV-008 | ACC-001~ACC-014 自动化 |
| DEV-011 | 灰度开关与日志 | backend | DEV-001 | 可按 flag 回滚，日志字段齐全 |

## 25. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Hocuspocus 当前版本无法在消息前校验 lease | 旧连接可能短时传播 update | 必须在 `CollaborationGateway` 或 RedisSync wrapper 层完成连接级阻断；不得用 store 阶段拒绝替代 |
| Redis 异常导致无法判断 active lease | 编辑不可用或误放行 | strict 模式 fail-closed；warn-only 灰度观察 |
| 被踢旧端有未保存内容 | 用户认为内容丢失 | 本地 recovery draft + 明确提示，不自动覆盖服务端 |
| 误伤不同用户协作 | 产品核心能力受损 | 锁维度必须包含 userId；验收 ACC-006 必过 |
| 旧客户端未传 editSession | 保存失败 | 灰度期 warn-only；发布后前后端同步 strict |
| 多标签 sessionStorage clone 导致 clientId 重复 | 互踢不触发或误判 | 初始化时使用 BroadcastChannel 检测重复，必要时刷新 clientId |
| pending 接管期间新旧端同时写 | 内容乱序或覆盖 | pending new 不可写；old 只允许一次 handoff_flush；promotion 原子执行 |
| 文件资源 ID 不统一 | 同一文件被多个锁保护，互踢失效 | P1 强制 canonical attachmentId，无法解析则不得进入 file edit lease |
| collab token 缺少 sessionId | 无法区分设备和连接归属 | `/auth/collab-token` 必须从当前 access token sessionId 生成；strict validate 下旧 token 刷新 |

## 26. 审计问题闭环

| audit_id | 原问题 | 修订结论 | 对应章节 |
|---|---|---|---|
| AUD-001 | 接管流程与写入 fencing 冲突 | 改为二阶段协议：active old + pending new；old 仅一次 handoff_flush；promotion 后 new 才可写 | 9.1、10.4、11.1、11.4 |
| AUD-002 | Yjs stale 写入防护不闭环 | 明确 stale update 必须在连接/消息入口阻断；store 阶段不作为主要隔离点，不拒绝合法已入内存状态 | 10.5、11.5、23 |
| AUD-003 | 标题/元数据写入可能绕过校验 | `/pages/update` 任一写字段统一在 DB/Yjs 写前校验 editSession | 10.4、11.4、19 |
| AUD-004 | clientId/socketId 绑定缺失 | 增加 `editorSession.registerClient`、Redis socket key、未注册降级路径 | 12.1、23 |
| AUD-005 | file resourceId 不唯一 | P1 强制 canonical attachmentId；无 attachmentId 先 materialize | 13.5、25 |
| AUD-006 | 机器摘要档位不一致 | `tier=small`，`detail_level=medium` | 27 |
| AUD-007 | 恢复草稿策略缺失 | 增加 IndexedDB 存储、key、TTL、清理、安全边界和手动恢复规则 | 13.7、22 |
| AUD-008 | warn-only 验收口径不清 | 明确 warn-only 只观测，不算完成；P0 完成必须 strict write + collab validate | 20、27 |
| AUD-009 | collab token sessionId 兼容不清 | `/auth/collab-token` 从 access token sessionId 生成；strict 下旧 token 拒绝并刷新 | 11.5、23 |

## 27. 机器可读摘要

```yaml
prd_struct:
  doc_id: PRD-20260514-01-editor-session-takeover
  status: ready_for_implementation
  tier: small
  detail_level: medium
  takeover_protocol: explicit_continue_then_two_phase_active_old_pending_new
  feature_flags:
    - EDITOR_SESSION_ENABLED
    - EDITOR_SESSION_STRICT_WRITE
    - EDITOR_SESSION_COLLAB_VALIDATE
    - EDITOR_SESSION_FILE_ENABLED
  primary_domains:
    - DOMAIN_EDITOR_SESSION
    - DOMAIN_PAGE_CONTENT
    - DOMAIN_FILE_EDIT
  p0_resources:
    - resourceType: page
      guarded_writes:
        - page_content
        - page_title
        - page_icon_theme
        - local_fallback_replace
        - yjs_collab_connection
      required_enforcement:
        - acquire_returns_blocked_before_user_continue
        - single_editor_session_overlay
        - strict_write
        - collab_connection_validate
        - socket_client_registration
        - indexeddb_recovery_draft
  p1_resources:
    - resourceType: file
      canonical_resource_id: attachmentId
      guarded_writes:
        - drawio_attachment
        - excalidraw_attachment
        - attachment_inline_editor
  critical_acceptance:
    - ACC-002
    - ACC-004
    - ACC-006
    - ACC-010
    - ACC-012
    - ACC-014
    - ACC-016
    - ACC-018
  completion_gate:
    strict_write: true
    collab_validate: true
    warn_only_counts_as_done: false
  rollback:
    primary: disable EDITOR_SESSION_STRICT_WRITE
    full: disable EDITOR_SESSION_ENABLED
```

## 28. 修改日志

| 日期时间 | 说明 |
|---|---|
| 2026-05-15 11:26:27 UTC+8 | 落地记录：全应用遮罩实现为挂载到 `document.body` 的 viewport fixed portal，测试环境重建部署后验证健康接口、端口暴露和启动日志正常。 |
| 2026-05-15 11:19:46 UTC+8 | 遮罩修订：明确 `EditorSessionOverlay` 必须覆盖整个网页应用 viewport，包括顶部导航、搜索、用户菜单、左侧空间树、页面工具栏和正文区域；浏览器书签栏/地址栏不属于覆盖范围。 |
| 2026-05-15 10:13:45 UTC+8 | 交互修订：打开同页不再自动互踢，`acquire` 返回 `blocked_by_other`；新增显式 `takeover` 接口；前端改为页面级单遮罩，点击“继续在这里编辑”后才接管，点击“只读查看”保持只读。 |
| 2026-05-14 19:02:22 UTC+8 | 审计修订：补齐二阶段接管协议、Yjs 入口阻断、页面所有写字段前置校验、Socket client 注册、collab token sessionId、file canonical id、IndexedDB 恢复草稿、strict 验收口径与机器摘要一致性。 |
| 2026-05-14 18:53:37 UTC+8 | 初稿：完成同账号同资源互踢、写入 fencing、API、前端接入、灰度与验收设计。 |
