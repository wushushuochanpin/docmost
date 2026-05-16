# 实时协同开关与状态指示 PRD

**成文日期**：2026-05-15 18:43:51 UTC+8  
**最后修订**：2026-05-15 18:43:51 UTC+8

本文档用于指导 Docmost/SuperChat 实时协同开关与前端状态指示能力的设计、实现和验收。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 1. PRD 元信息

| 项目     | 内容                                                                     |
| -------- | ------------------------------------------------------------------------ |
| doc_id   | `PRD-20260515-01-collaboration-toggle-status`                            |
| 版本     | v1.0                                                                     |
| 档位     | small，单文件开工 PRD；实现涉及前端、后端、WebSocket，按 medium 细节展开 |
| 落盘路径 | `docs/prd/20260515_01_collaboration-toggle-status.md`                    |
| 改造策略 | migrate，增量增加开关与状态，不替换现有 Hocuspocus/Yjs 协同              |
| 本期状态 | ready_for_implementation                                                 |

### 文档档位与产物策略

| tier  | 判档依据                                                                          | 交付物                | 升级条件                                                                     |
| ----- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| small | 不新增独立业务路由、不新增数据表；但涉及协同连接、token、workspace 设置与前端状态 | 单文件 PRD + 代码实现 | 若后续新增协同诊断后台、连接审计列表或租户级灰度控制台，升级为 medium 目录包 |

### 存储路径与命名规范

| root_path  | package_mode | package_name                                 | 命名规则                       | 例外说明                         |
| ---------- | ------------ | -------------------------------------------- | ------------------------------ | -------------------------------- |
| `docs/prd` | file         | `20260515_01_collaboration-toggle-status.md` | `YYYYMMDD_index_short-slug.md` | slug 3 个英文业务词，长度小于 32 |

## 2. 背景与目标

当前项目存在两条实时链路：

1. Socket.IO `/socket.io`：页面树、评论、通知、编辑会话等普通实时事件。
2. Hocuspocus/Yjs `/collab`：页面正文多人实时协同编辑。

协同编辑目前默认可用，前端只在连接异常或 fallback 时展示警告图标，缺少“是否启用”和“当前连接状态”的常驻可见反馈。管理员也没有 workspace 级入口控制协同能力，运维只能通过服务部署和环境变量间接处理。

本次目标：

- 提供实例级和 workspace 级协同开关。
- 前端编辑器在协同关闭时不创建 Hocuspocus provider，直接进入本地保存模式。
- 页面头部常驻展示协同状态 icon，用户能看到已连接、连接中、断线、本地模式、已关闭。
- 后端对旧 token 和旧连接做最终兜底，避免只关前端导致 `/collab` 仍可接入。
- 不影响 `/socket.io` 普通实时事件。

## 3. 系统角色与用户故事

| role_id  | 角色                  | 核心职责                                     | 权限边界                              |
| -------- | --------------------- | -------------------------------------------- | ------------------------------------- |
| R-ADMIN  | Workspace Owner/Admin | 开启或关闭当前 workspace 的实时协同          | 仅能修改自己 workspace 的设置         |
| R-EDITOR | 普通编辑者            | 编辑页面并理解当前保存/协同状态              | 只读协同状态，不可修改 workspace 设置 |
| R-SRE    | 运维/SRE              | 通过环境变量控制实例级开关，处理协同服务异常 | 不通过普通用户页面修改实例配置        |
| R-QA     | 测试                  | 验证开关、连接状态、fallback、旧连接兜底     | 非生产环境验证                        |

| story_id | 角色     | 用户故事                                                                        | 映射页面/接口                                                  | 验收用例 |
| -------- | -------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| US-001   | R-ADMIN  | 作为管理员，我希望在 workspace 设置中关闭实时协同，故障时让编辑继续走本地保存。 | `Settings / Workspace / General`、`POST /api/workspace/update` | ACC-001  |
| US-002   | R-EDITOR | 作为编辑者，我希望在页面头部看到实时协同是否已连接，避免误以为多人正在同步。    | Page Header                                                    | ACC-002  |
| US-003   | R-SRE    | 作为运维，我希望通过实例级环境变量关闭所有协同连接，且前端显示不可用状态。      | `COLLAB_ENABLED`、`/api/auth/collab-token`、`/collab`          | ACC-003  |
| US-004   | R-QA     | 作为测试，我希望绕过前端直接连接 `/collab` 时仍被后端开关阻断。                 | Hocuspocus auth extension                                      | ACC-004  |

## 4. As-Is 现状审计

| 类型           | 现状                                                                            | 证据/位置                                                                                                 | 风险                                              |
| -------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 普通实时事件   | Socket.IO gateway 默认挂载 `/socket.io`，用于树、评论、通知、编辑会话           | `apps/server/src/ws/ws.gateway.ts`、`apps/client/src/features/user/user-provider.tsx`                     | 不应被协同开关联动关闭                            |
| 协同编辑入口   | `CollaborationModule` 在主服务挂载 `/collab` upgrade handler                    | `apps/server/src/collaboration/collaboration.module.ts`                                                   | 当前无实例级 enable/disable 保护                  |
| 独立协同服务   | 保留 `collab:prod/dev` 启动脚本，监听 `COLLAB_PORT`                             | `apps/server/src/collaboration/server/collab-main.ts`                                                     | 独立部署时也需要同一开关语义                      |
| 协同 token     | 前端通过 `/api/auth/collab-token` 获取 token；UserProvider 当前也无条件触发一次 | `apps/client/src/features/auth/queries/auth-query.tsx`、`apps/client/src/features/user/user-provider.tsx` | 关闭协同时不应重试请求 token                      |
| 前端 provider  | 页面编辑器创建 `HocuspocusProviderWebsocket` 和 `HocuspocusProvider`            | `apps/client/src/features/editor/page-editor.tsx`                                                         | 关闭协同时应直接走 local fallback                 |
| 状态 icon      | 现有 `ConnectionWarning` 只在异常时显示 `IconWifiOff`                           | `apps/client/src/features/page/components/header/page-header-menu.tsx`                                    | 用户看不到“已连接”和“已关闭”状态                  |
| Workspace 设置 | 已有 `workspaces.settings` JSONB，AI、sharing、api、templates 均复用此列        | `WorkspaceRepo.updateAiSettings/updateSharingSettings`                                                    | 可扩展 `settings.collaboration.enabled`，无需新表 |

## 5. 改造策略确认闸门

| gate_id     | current_stage             | strategy | 用户确认状态                    | 决策理由                                           | 回滚目标时长                                              | 停机风险 |
| ----------- | ------------------------- | -------- | ------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | -------- |
| G-CHANGE-01 | production-ready codebase | migrate  | 用户已要求“落地为 PRD 然后开工” | 保留现有协同链路，新增开关和状态；默认开启保持兼容 | 30 分钟内通过 `COLLAB_ENABLED=true` 或 workspace 开关恢复 | low      |

## 6. 设计决策

| 方案                                        | 内容                               | 优点                   | 缺点                                  | 结论           |
| ------------------------------------------- | ---------------------------------- | ---------------------- | ------------------------------------- | -------------- |
| A. 只做前端开关                             | 不创建 provider，不改后端          | 实现快                 | 旧 token 或直接连接仍可进入 `/collab` | 放弃           |
| B. 只做环境变量                             | 运维可全局关闭                     | 简单可靠               | workspace 管理员无自助能力            | 作为实例级兜底 |
| C. 环境变量 + workspace 设置 + 后端连接兜底 | 双层开关，前后端一致               | 兼容现有部署，风险可控 | 需要改多处类型和 UI                   | 采用           |
| D. 关闭整个 WebSocket                       | 同时关闭 `/socket.io` 和 `/collab` | 粗暴                   | 会破坏评论、通知、页面树实时更新      | 放弃           |

最终有效状态：

```ts
effectiveCollaborationEnabled =
  COLLAB_ENABLED !== false &&
  workspace.settings?.collaboration?.enabled !== false;
```

默认值：未配置时视为开启，保持现有行为。

## 7. 功能范围

| 优先级 | 功能                   | 说明                                                                       |
| ------ | ---------------------- | -------------------------------------------------------------------------- |
| P0     | 实例级开关             | 新增 `COLLAB_ENABLED`，默认 `true`，关闭后不发 token 且 `/collab` 认证拒绝 |
| P0     | Workspace 级开关       | 新增 `settings.collaboration.enabled`，管理员可在 General 设置页修改       |
| P0     | 前端编辑器适配         | 协同关闭时不请求 token、不创建 provider，直接进入本地保存模式              |
| P0     | 页面头部状态 icon      | 常驻显示 connected/connecting/reconnecting/local/disabled                  |
| P0     | Socket.IO 设置变更事件 | workspace 开关变化后通知在线客户端刷新当前用户/工作区状态                  |
| P1     | 连接统计展示           | 后续可在运维诊断页展示 `/collab/stats` 和最后错误                          |

本期不做：

- 不关闭 `/socket.io`。
- 不新增独立协同诊断后台。
- 不做按页面/空间粒度协同开关。
- 不做复杂冲突合并 UI；协同关闭时复用现有本地保存模式。

## 8. 信息架构与页面设计

### navigation_tree

- Settings
  - Workspace
    - General
      - Workspace icon
      - Workspace name
      - Realtime collaboration switch
      - Hostname（Cloud only）

### route_inventory

| route_id | route_path            | page_type     | primary_user_job         | primary_entity      | core_actions             | out_of_scope                 | split_decision   |
| -------- | --------------------- | ------------- | ------------------------ | ------------------- | ------------------------ | ---------------------------- | ---------------- |
| IA-001   | `/settings/workspace` | settings      | 管理 workspace 基础设置  | workspace           | 修改名称、图标、协同开关 | 协同诊断、连接列表、审计报表 | single_goal_ok   |
| IA-002   | page header           | inline status | 查看当前页面编辑协同状态 | page editor session | 查看状态 tooltip         | 修改全局开关                 | inline_component |

### admin_ui_governance

| page_id                | admin_ui_pattern | primary_object | state_model                    | toolbar_actions     | summary_cards_decision           | design_review_status    |
| ---------------------- | ---------------- | -------------- | ------------------------------ | ------------------- | -------------------------------- | ----------------------- |
| PAGE_WORKSPACE_GENERAL | settings_page    | workspace      | enabled/disabled/loading/error | Save through switch | none，使用紧凑设置行，不加装饰卡 | text_wireframe_approved |

### 前端逐页说明

| component_id      | 位置              | 行为                                               | 权限                         | 文案                                                                                       |
| ----------------- | ----------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| FE-COLLAB-SETTING | Workspace General | Switch 控制 `collaborationEnabled`；关闭时二次确认 | Admin/Owner 可操作，成员只读 | “实时协同编辑”“允许多人同时编辑同一页面，并显示协作者光标。关闭后编辑会使用本地保存模式。” |
| FE-COLLAB-STATUS  | Page Header       | ActionIcon + Tooltip 常驻显示状态                  | 所有能打开页面的用户可见     | 见用户可见文案清单                                                                         |

## 9. 后端设计与接口契约

### 数据模型

复用 `workspaces.settings` JSONB：

```json
{
  "collaboration": {
    "enabled": true
  }
}
```

无迁移要求。历史数据中缺失 `settings.collaboration.enabled` 时按 `true` 处理。

### 环境变量

| key                    | 类型           | 默认值   | 生效范围              | 说明                       |
| ---------------------- | -------------- | -------- | --------------------- | -------------------------- |
| `COLLAB_ENABLED`       | boolean string | `true`   | instance              | `false/0` 时实例级关闭协同 |
| `COLLAB_URL`           | url            | existing | frontend config       | 保持现有协同服务地址       |
| `COLLAB_DISABLE_REDIS` | boolean string | existing | collaboration gateway | 不改变现有语义             |

### API-001：获取协同 token

| 字段        | 内容                                              |
| ----------- | ------------------------------------------------- |
| api_id      | API-COLLAB-TOKEN                                  |
| method/path | `POST /api/auth/collab-token`                     |
| 权限        | 登录用户                                          |
| 业务目的    | 告诉前端协同是否可用；可用时返回 Hocuspocus token |
| 幂等        | 是，无副作用                                      |

响应：

```ts
type CollabTokenResponse =
  | { enabled: true; token: string }
  | { enabled: false; disabledReason: "instance" | "workspace" };
```

兼容策略：旧客户端读取 `token`；默认开启时仍返回 `token`。关闭时返回 `enabled=false`，前端不重试。

### API-002：更新 workspace 协同设置

| 字段        | 内容                                                |
| ----------- | --------------------------------------------------- |
| api_id      | API-WORKSPACE-COLLAB-UPDATE                         |
| method/path | `POST /api/workspace/update`                        |
| 新增字段    | `collaborationEnabled?: boolean`                    |
| 权限        | Workspace Settings Manage                           |
| 写入位置    | `workspaces.settings.collaboration.enabled`         |
| 后置动作    | 广播 `workspaceCollaborationUpdated` Socket.IO 事件 |

### WS-001：workspace 设置变更事件

```ts
{
  operation: "workspaceCollaborationUpdated";
  workspaceId: string;
  enabled: boolean;
}
```

客户端收到后：

- 更新/失效 `currentUser` 查询缓存。
- 当前页面编辑器根据 workspace 设置重新计算 `effectiveCollaborationEnabled`。
- 若从开变关，销毁协同 provider 并进入 local fallback。

### `/collab` 后端兜底

Hocuspocus authentication extension 在 token 校验和页面权限校验前后增加：

1. `COLLAB_ENABLED=false`：拒绝连接。
2. `workspace.settings.collaboration.enabled=false`：拒绝连接。

这保证旧 token 或绕过前端直接连接时也无法继续接入协同。

## 10. 前端状态模型

```ts
type PageEditorCollaborationStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "local"
  | "error";
```

状态映射：

| status       | 条件                                         | 图标          | 颜色   | Tooltip                            |
| ------------ | -------------------------------------------- | ------------- | ------ | ---------------------------------- |
| disabled     | 实例或 workspace 关闭                        | `IconWifiOff` | gray   | “实时协同未开启，当前使用本地保存” |
| connecting   | provider 尚未 synced 或 WebSocket connecting | loader        | blue   | “正在连接实时协同”                 |
| connected    | runtime=`collab` 且 yjs connected/synced     | `IconWifi`    | teal   | “实时协同已连接”                   |
| reconnecting | yjs disconnected/connecting 且非 local       | `IconWifiOff` | red    | “实时协同连接中断，正在重试”       |
| local        | runtime=`local` 且非显式 disabled            | `IconWifiOff` | yellow | “协同暂不可用，正在本地保存更改”   |
| error        | token 或 provider 异常                       | `IconWifiOff` | red    | “实时协同不可用”                   |

## 11. 用户可见文案清单

| copy_id  | surface      | user_visible_copy                                                          | internal_note_not_for_ui   | forbidden_terms_checked |
| -------- | ------------ | -------------------------------------------------------------------------- | -------------------------- | ----------------------- |
| COPY-001 | 设置项标题   | 实时协同编辑                                                               | 不展示 Hocuspocus/Yjs      | yes                     |
| COPY-002 | 设置项说明   | 允许多人同时编辑同一页面，并显示协作者光标。关闭后编辑会使用本地保存模式。 | 不展示 `/collab` 或 token  | yes                     |
| COPY-003 | 关闭确认     | 关闭后，正在编辑的页面会切换为本地保存，其他成员不再实时看到输入内容。     | 不展示 WebSocket 细节      | yes                     |
| COPY-004 | 状态 tooltip | 实时协同已连接                                                             | 内部状态 connected         | yes                     |
| COPY-005 | 状态 tooltip | 正在连接实时协同                                                           | 内部状态 connecting        | yes                     |
| COPY-006 | 状态 tooltip | 实时协同连接中断，正在重试                                                 | 内部状态 reconnecting      | yes                     |
| COPY-007 | 状态 tooltip | 协同暂不可用，正在本地保存更改                                             | 内部状态 local fallback    | yes                     |
| COPY-008 | 状态 tooltip | 实时协同未开启，当前使用本地保存                                           | 内部 disabledReason 不外显 | yes                     |

## 12. 领域边界与服务拆分

| domain_id                  | domain_goal                | primary_entities               | frontend_routes          | backend_router                              | backend_service                     | allowed_commands                          | out_of_scope           |
| -------------------------- | -------------------------- | ------------------------------ | ------------------------ | ------------------------------------------- | ----------------------------------- | ----------------------------------------- | ---------------------- |
| DOMAIN-COLLAB-AVAILABILITY | 判断协同是否可用并阻断连接 | workspace settings、env config | page editor、page header | `AuthController`、`AuthenticationExtension` | `AuthService`、`EnvironmentService` | get_collab_token、validate_collab_enabled | Socket.IO 普通实时事件 |
| DOMAIN-WORKSPACE-SETTINGS  | 管理 workspace 级配置      | workspace                      | `/settings/workspace`    | `WorkspaceController`                       | `WorkspaceService`                  | update_collaboration_enabled              | 协同连接诊断           |
| DOMAIN-EDITOR-STATUS       | 展示当前页面协同状态       | page editor state              | page header              | N/A                                         | client atoms                        | derive_status、render_indicator           | 管理员设置写入         |

## 13. 影响面矩阵

| impact_id | 变更类型       | 现状行为                | 目标行为                              | 影响页面/接口                          | 风险等级 | 回滚动作                   | 回归用例         |
| --------- | -------------- | ----------------------- | ------------------------------------- | -------------------------------------- | -------- | -------------------------- | ---------------- |
| IM-001    | 后端配置       | 无 `COLLAB_ENABLED`     | 可实例级关闭协同                      | environment、static config、auth token | medium   | 设置 `COLLAB_ENABLED=true` | ACC-003          |
| IM-002    | Workspace 设置 | 无 workspace 级开关     | `settings.collaboration.enabled` 可控 | workspace update                       | medium   | 开关恢复 true              | ACC-001          |
| IM-003    | 前端编辑器     | 始终尝试 token/provider | 关闭时直接 local fallback             | page editor                            | high     | 删除开关判断恢复旧逻辑     | ACC-002、ACC-005 |
| IM-004    | 状态指示       | 异常才显示图标          | 常驻显示状态                          | page header                            | low      | 回退 `ConnectionWarning`   | ACC-002          |
| IM-005    | 实时事件       | 无 workspace 设置事件   | 广播设置变更并刷新客户端              | Socket.IO event                        | low      | 移除事件，依赖刷新         | ACC-006          |

## 14. 测试要点与验收标准

| 用例ID  | 场景                      | 前置条件                          | 操作步骤                                      | 预期结果                                                   |
| ------- | ------------------------- | --------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| ACC-001 | 管理员关闭 workspace 协同 | Admin 登录，`COLLAB_ENABLED=true` | 进入 General 设置页，关闭“实时协同编辑”并确认 | workspace 设置保存；当前和其他在线客户端收到状态更新       |
| ACC-002 | 状态 icon 展示连接态      | 协同开启且 `/collab` 可连接       | 打开可编辑页面                                | 页面头部显示绿色连接 icon，tooltip 为“实时协同已连接”      |
| ACC-003 | 实例级关闭                | `COLLAB_ENABLED=false`            | 登录后打开页面                                | 不请求/不使用 token；编辑器进入本地保存；状态显示 disabled |
| ACC-004 | 后端阻断旧连接            | workspace 协同关闭                | 手动使用旧 token 连接 `/collab`               | 认证失败，不能进入协同文档                                 |
| ACC-005 | 本地保存模式可编辑        | 协同关闭，用户有页面编辑权限      | 编辑正文，等待保存                            | 内容通过现有 page update 保存，无 Hocuspocus provider      |
| ACC-006 | 在线客户端接收开关变化    | 两个浏览器打开同一 workspace      | 浏览器 A 关闭协同                             | 浏览器 B 收到设置变化，页面状态变为 disabled/local         |
| ACC-007 | 普通 Socket.IO 不受影响   | 协同关闭                          | 创建/移动页面、评论通知                       | 页面树/评论实时事件仍工作                                  |

## 15. 灰度、回滚与运维

- 默认值为开启，历史 workspace 无需迁移。
- 实例级紧急回滚：设置 `COLLAB_ENABLED=true` 并重启服务。
- Workspace 级回滚：管理员在 General 设置页重新开启。
- 若状态 icon 误判但协同可用，优先回滚前端状态展示；不影响后端连接。
- 若 `/collab` 认证异常升高，优先确认 `COLLAB_ENABLED` 和 workspace 设置。

## 16. 修改日志

| 日期时间                  | 说明                                                    |
| ------------------------- | ------------------------------------------------------- |
| 2026-05-15 18:43:51 UTC+8 | 初稿；补齐开关、状态 icon、接口、数据、验收和回滚设计。 |
