# 实时编辑保存与协作同步现代化 PRD

**成文日期**：2026-05-24 UTC+8  
**最后修订**：2026-05-24 UTC+8

本文档用于指导 Docmost/SuperChat 页面编辑器实时保存、实时协作、本地离线与持久化链路的收敛改造。当前系统已经具备 Tiptap/ProseMirror、Yjs、Hocuspocus、y-indexeddb、React Query 页面缓存、本地 fallback 保存和编辑会话互踢能力；本 PRD 不以“推倒重写”为目标，而是把多状态源收敛为更稳定、更轻量、更容易排查的同步模型。

---

## 1. PRD 元信息

| 项目 | 内容 |
|---|---|
| doc_id | `PRD-20260524-01-realtime-editor-sync-modernization` |
| 版本 | v1.0 |
| 档位 | medium，单文件开工 PRD；涉及编辑器、Yjs、Hocuspocus、React Query、服务端持久化和可选托管方案评估 |
| 落盘路径 | `docs/prd/20260524_01_realtime-editor-sync-modernization.md` |
| 需求状态 | implementation_started |
| 改造策略 | migrate，先修复实例重建和状态源冲突，再评估升级或替换局部能力 |
| 主要风险 | 内容覆盖、编辑器实例重建、协作/本地 fallback 双轨冲突、离线恢复覆盖、升级 Hocuspocus 协议或持久化兼容问题 |

## 2. 背景与问题

当前编辑器方案本身并不落后：`Tiptap/ProseMirror + Yjs CRDT + Hocuspocus WebSocket + y-indexeddb` 仍是成熟协作编辑路线。但项目落地中叠加了多套状态源：

- ProseMirror editor state
- Yjs document state
- React Query page cache
- 服务端 `pages.content` JSON
- y-indexeddb 本地文档缓存
- local fallback editor JSON 保存
- editor session lease / fencing token
- title editor 与 body editor 的共享编辑权状态

这些状态源在输入、保存、重连、模式切换时互相触发，容易出现以下问题：

1. `onUpdate` 写回 React Query 缓存，父组件重新传入 `content`，正文编辑器被重建，导致焦点丢失。
2. 协作模式和本地 fallback 模式使用不同保存路径，网络抖动时容易来回切换。
3. 正文 JSON 在编辑中被频繁写入 React Query，React 组件树承担了不该承担的实时文档状态。
4. 用户感知到“回车、退格只能操作一次”“偶发卡顿”“保存慢”，但底层原因是状态源竞争而不是单一按键逻辑。
5. 后续维护人员很难判断当前页面正文到底以 Yjs、Editor、Query Cache 还是服务端 JSON 为准。

## 3. 目标与非目标

### 3.1 本期目标

- P0-1：正文编辑器输入期间不得因页面缓存或 `content` prop 变化重建实例。
- P0-2：正文实时编辑期间，React Query 不再作为实时正文 source of truth。
- P0-3：本地离线/断线时优先复用同一个 Y.Doc 和同一个 editor，不再切换成另一套 JSON editor。
- P1：评估并准备 Hocuspocus v4 升级，明确兼容、回滚和灰度策略。
- P1：为托管协作服务和 local-first sync engine 给出选型边界，不在未评审前替换核心协作链路。

### 3.2 非目标

- 不把多人实时协作改成全员独占锁。
- 不在 P0 更换编辑器框架。
- 不在 P0 引入 Liveblocks、Tiptap Cloud、Replicache、PowerSync、Electric 等新外部依赖。
- 不在 P0 重写页面树、评论、设置等普通业务数据同步。
- 不在 P0 做复杂冲突合并 UI；先保证不重建、不丢焦点、不旧端覆盖。

## 4. As-Is 现状审计

| 类型 | 现状 | 代码位置 | 风险 |
|---|---|---|---|
| 正文编辑器 | `PageEditor` 依据 `runtimeMode` 在 preview/local/collab 间切换 | `apps/client/src/features/editor/page-editor.tsx` | 模式切换会导致不同 editor 路径和保存路径 |
| 协作正文 | Hocuspocus provider + Yjs + Tiptap collaboration extensions | `page-editor.tsx`、`extensions.ts` | 成熟路线，但当前依赖 React 状态切换较多 |
| 本地 fallback | `LocalFallbackPageEditor` 使用 Tiptap JSON + debounce `/pages/update` replace | `page-editor.tsx` | 与协作模式是双轨，断线时容易状态不一致 |
| 页面缓存 | `updateCachedPageContent` 在每次 `onUpdate` 中 patch React Query | `page-editor.tsx` | 输入会反向影响父组件 props，造成 editor 重建风险 |
| 页面查询 | `PageContent` 从 `usePageQuery` 获取 `page.content` 并传给 `FullEditor/PageEditor` | `apps/client/src/pages/page/page.tsx` | 查询缓存变化会重新生成 `normalizedPageContent` |
| 编辑会话 | 通过 `useEditorSessionLease` 控制同账号同资源写权 | `features/editor-session` | 必须保留，但不应触发编辑器实例频繁重建 |
| 标题编辑器 | 已做较多稳定化处理，独立 title editor 保存 | `title-editor.tsx` | 与正文共享 session 状态，需要防止互相抢焦点 |

## 5. 改造总览与优先级

| 优先级 | 工作流 | 目标 | 施工策略 | 完成标志 |
|---|---|---|---|---|
| P0-1 | 单编辑器实例稳定化 | 输入、回车、退格、缓存更新不重建正文 editor | 收敛 `useEditor` deps，避免 `content/editable` 作为重建依赖；编辑权限改用 `setEditable` | 连续 Enter/Backspace 不丢焦点；React Query content patch 不重建 editor |
| P0-2 | 正文缓存降级为派生数据 | React Query 不承担编辑期实时正文状态 | 减少/移除 `onUpdate` 对正文 content 的频繁 cache patch；仅保存成功或离开页面时同步必要快照 | 输入不导致父级正文 prop 高频变化 |
| P0-3 | 本地 fallback 与 Y.Doc 合流 | 断线继续在同一 editor/Y.Doc 内编辑 | 断线不切换 editor 组件；保存状态从 provider/persistence ack 派生 | 网络抖动不切 editor，不丢 selection |
| P1-1 | Hocuspocus v4 升级评估 | 使用更现代的服务端协作运行时能力 | 编写升级清单、兼容测试、灰度开关；先 staging 后生产 | v3/v4 wire protocol、auth、persistence、Redis 行为验证通过 |
| P1-2 | 外部方案选型边界 | 明确哪些能力适合托管或 local-first engine | 评估 Liveblocks/Tiptap Cloud/Y-Sweet/Replicache/PowerSync/Electric 的边界 | 形成 go/no-go，不影响 P0 稳定性施工 |

## 6. 详细设计一：单编辑器实例稳定化（P0-1）

### 6.1 问题

当前 `PageEditor` 和 `LocalFallbackPageEditor` 的 `useEditor` deps 包含 `normalizedContent`、`editable` 或 `effectiveEditable`。同时 `onUpdate` 会调用 `updateCachedPageContent` 写 React Query，父级 `PageContent` 再把新的 `content` 传回编辑器。结果是一次输入可能触发：

```
ProseMirror transaction
  -> onUpdate
  -> patch React Query page.content
  -> PageContent rerender
  -> normalizedPageContent 引用变化
  -> PageEditor props.content 变化
  -> useEditor deps 命中
  -> editor destroy/create
  -> DOM focus/selection 丢失
```

### 6.2 设计

- `useEditor` 只依赖真正需要重建 editor 的稳定键：
  - `pageId`
  - 当前用户 id
  - 协作扩展集合 `extensions`
- `content` 仅作为初始内容，不作为编辑期重建依赖。
- `editable/effectiveEditable` 不作为重建依赖，统一通过现有 `editor.setEditable()` effect 切换。
- `onCreate` 负责设置 `editor.storage.pageId/editSession`。
- `editSession` 更新继续通过独立 effect 写入 storage。

### 6.3 验收

| 用例 | 步骤 | 期望 |
|---|---|---|
| ACC-P0-1-001 | 在正文段落连续按 Enter 10 次 | 每次都生效，焦点不丢失 |
| ACC-P0-1-002 | 在正文段落连续按 Backspace 10 次 | 每次都生效，焦点不丢失 |
| ACC-P0-1-003 | 输入期间触发 React Query 页面缓存更新 | editor 实例不重建，selection 不跳动 |
| ACC-P0-1-004 | 编辑会话从只读变 active | 不重建 editor，仅切换 editable |
| ACC-P0-1-005 | 页面切换到另一个 pageId | editor 正常重建并加载新页面 |

## 7. 详细设计二：React Query 正文缓存降级（P0-2）

### 7.1 问题

React Query 适合服务端实体缓存，不适合作为富文本实时编辑状态。正文 JSON 体积大、变化频繁，频繁 patch 会让页面父组件和头部组件承担无意义更新。

### 7.2 设计

- 编辑期不再每个 transaction 写 `page.content`。
- 本地需要“页面内容已变化”的 UI 状态时，使用 editor 内部 state 或轻量 dirty atom。
- 保存成功后再更新 `pages.content` 快照，保证页面离开/只读切换时有最新缓存。
- 协作模式下，正文最终以 Y.Doc/服务端 persistence 为准；React Query 只缓存打开时的 bootstrap content。
- 对只读页面、历史页面、分享页继续使用 React Query/静态渲染内容，不受影响。

### 7.3 迁移步骤

1. 为 `updateCachedPageContent` 增加调用场景审计。
2. 在编辑中停止 patch 正文 content，仅保留必要的 metadata 更新。
3. 保存成功或协作 persistence ack 后再 patch 快照。
4. 增加埋点，观察编辑期间 `PageContent` rerender 次数。

## 8. 详细设计三：本地 fallback 与 Y.Doc 合流（P0-3）

### 8.1 问题

当前 collab 不可用时会进入 `runtimeMode=local`，渲染 `LocalFallbackPageEditor`。这意味着用户可能在同一页面中经历 editor 组件切换、保存路径切换和状态源切换。

### 8.2 设计

- 目标模型：同一页面生命周期内尽量只有一个正文 editor 和一个 Y.Doc。
- 网络断开时：
  - editor 保持可编辑；
  - Yjs updates 继续写入本地 y-indexeddb；
  - UI 显示“本地保存/等待同步”；
  - 重连后由 provider 同步 updates。
- 只有在协作被实例/workspace 明确关闭时，才进入纯本地保存模式。
- local fallback 不再是另一个 editor，而是同 editor 的 persistence mode。

### 8.3 服务端影响

- Hocuspocus persistence 继续负责最终 `pages.content` materialization。
- `/pages/update replace` 保留为兼容和非协作关闭场景，不作为协作断线时的默认正文保存路径。
- editor session fencing 继续保护 handoff 和旧端写入。

## 9. 详细设计四：Hocuspocus v4 升级评估（P1-1）

### 9.1 目标

评估从 Hocuspocus v3.4.4 升级到 v4 的收益、兼容性和风险。v4 官方定位包含更现代的运行时支持、类型和 transaction origin 改进，但升级会触碰协作服务核心链路，不能直接生产施工。

### 9.2 升级清单

| 项 | 检查内容 |
|---|---|
| runtime | Node 版本、Dockerfile、生产镜像、独立 collab 服务启动脚本 |
| auth | `/api/auth/collab-token`、editSession URL 参数、workspace collaboration enabled 判断 |
| persistence | `pages.ydoc`、Y.Doc 转 ProseMirror JSON、debounce 持久化策略 |
| Redis | 多实例扩展、pub/sub、连接断开恢复 |
| client | `@hocuspocus/provider` 版本、token refresh、status/synced 事件语义 |
| rollback | v3/v4 wire protocol 兼容、蓝绿部署、回滚数据格式 |

### 9.3 验收

- staging 支持 v3 client 连接 v4 server 或明确需要同步升级。
- 多人同时编辑、断网重连、旧端互踢、workspace 关闭协作均通过。
- `pages.content` materialization 与 v3 结果一致。

## 10. 详细设计五：外部方案选型边界（P1-2）

### 10.1 协作编辑托管服务

| 方案 | 适用场景 | 优点 | 风险 |
|---|---|---|---|
| Liveblocks | 希望托管 presence、storage、comments、Yjs provider | 减少自研协作后端故障面 | 成本、供应商绑定、私有化限制 |
| Tiptap Collaboration Cloud | 继续 Tiptap 生态，减少 Hocuspocus 运维 | 与当前编辑器匹配 | 商业授权、部署和数据合规 |
| Y-Sweet/PartyKit/Durable Objects | 希望轻量化 Yjs room hosting | 架构简洁，边缘部署友好 | 需要重新评估持久化、鉴权、国内网络和私有化 |

### 10.2 Local-first 数据同步引擎

| 方案 | 更适合 | 不适合 |
|---|---|---|
| Replicache | 页面树、评论、任务、设置等业务数据的低延迟同步 | 直接替代富文本内部 CRDT |
| PowerSync | Postgres/SQLite local-first 数据同步 | 富文本 selection、mark、node 级并发编辑 |
| Electric | Postgres shape sync、本地读写体验 | 直接承接 ProseMirror/Yjs 文档冲突 |

结论：正文富文本继续使用 Yjs/编辑器专用协作层；业务数据可在后续单独评估 local-first sync engine。

## 11. 分阶段施工计划

### Phase 0：立即止血

- 固定正文 editor 实例重建依赖。
- 跑 `git diff --check`、client build 或记录阻塞项。
- 手工验证 Enter/Backspace 连续操作。

### Phase 1：缓存降噪

- 审计 `updateCachedPageContent`。
- 把编辑期正文缓存 patch 改成 dirty 状态和保存成功快照。
- 加 rerender 计数或调试日志，验证父级不再高频更新正文 prop。

### Phase 2：fallback 合流设计落地

- 梳理 provider disconnected、workspace disabled、instance disabled 三类状态。
- 断线时不切换 editor；只切状态展示和同步队列。
- 移除或降级 `LocalFallbackPageEditor`。

### Phase 3：升级评估

- 建立 Hocuspocus v4 staging 分支。
- 完成多人编辑、断网、互踢、persistence 回归。
- 决定是否升级。

### Phase 4：外部方案 PoC

- 只做隔离 PoC，不接生产主链路。
- 输出成本、合规、迁移、故障模型和回滚报告。

## 12. 验收总表

| id | 场景 | 期望 |
|---|---|---|
| ACC-001 | 正文连续 Enter/Backspace | 不丢焦点，不只能操作一次 |
| ACC-002 | 正文输入期间页面缓存变化 | editor 不重建 |
| ACC-003 | 协作连接断开 30 秒后恢复 | selection 尽量保持，不切换 editor |
| ACC-004 | workspace 关闭协作 | 不创建 provider，进入明确本地保存模式 |
| ACC-005 | 同账号另一端接管 | 旧端只读，新端 active，旧端不能写 |
| ACC-006 | 不同用户同时编辑 | 仍可协作，不被同账号互踢误伤 |
| ACC-007 | 保存失败 | 有本地草稿或 Yjs 本地 update，不静默丢失 |
| ACC-008 | 页面切换 | 新页面正常初始化，不复用旧页面 Y.Doc/editor |

## 13. 回滚策略

- P0-1 如出现初始化内容不加载：回滚 `useEditor` deps 收敛改动。
- P0-2 如出现只读页面内容陈旧：恢复保存成功时的 cache patch，并保持编辑期不 patch。
- P0-3 如出现断线同步异常：保留 feature flag，回到现有 `runtimeMode=local`。
- P1 升级失败：保持 Hocuspocus v3 服务和依赖不变。

## 14. 当前开工项

当前已施工 Phase 0 / P0-1、Phase 1 / P0-2 和 Phase 2 / P0-3 的第一步：

- `LocalFallbackPageEditor` 的 `useEditor` deps 已收敛为 `[pageId, currentUserId]`。
- 协作 `PageEditor` 的 `useEditor` deps 已收敛为 `[pageId, extensions, currentUserId]`。
- 协作扩展依赖已从整个 `currentUser.user` 对象收敛到 `currentUserId/currentUserName`，避免用户缓存刷新导致 extensions 变更并重建 editor。
- 已移除编辑期 `updateCachedPageContent` 高频 patch，正文输入不再每个 transaction 写入 React Query 的 `page.content`。
- 本地 fallback 保存成功后仍通过 `updatePageData(page)` 同步服务端保存快照，避免只读切换或页面重新进入时读到旧内容。
- 已收窄 local fallback 触发条件：只有实例/workspace 明确关闭协作时进入本地 JSON 保存；协作连接慢或短暂断开时不再自动切换到另一套 editor。
- 已增加同一 Y.Doc 协作 editor 渲染条件：本地 IndexedDB 已有页面 Yjs fragment 或远端已同步时，即可进入同一个 collaboration editor；远端断开后保持该 editor，不回退到 preview/local 双轨。
- 本地没有 Yjs 缓存且远端未同步时仍保持 preview，避免用户在空 Y.Doc 上编辑后与远端正文错误合并。
- Hocuspocus 协作栈已在独立分支切到 `@hocuspocus/provider/server/transformer@4.0.0`，并适配了 v4 的 `Request` / `ClientConnection` / `lastContext` 入口。
- 后续继续推进托管/Local-first 方案 PoC，暂不把外部协作平台直接接入生产主链路。
