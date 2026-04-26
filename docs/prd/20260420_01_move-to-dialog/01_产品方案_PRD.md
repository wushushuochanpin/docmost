# 01 产品方案 PRD：Move To Dialog — 目录定位移动

**成文日期**：2026-04-20 12:08:54 UTC+8
**最后修订**：2026-04-20 12:08:54 UTC+8

本文档用于定义产品目标、范围、规则与验收标准。**阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。**

---

## 文档档位与产物策略

- tier：medium
- 交付模式：package_dir
- 判档依据：需求横跨新 Modal UI、客户端状态、URL 解析、跨 Space 二次确认、与现有移动路径的共存规则。

## 存储路径与命名规范

| root_path | package_mode | package_name | 命名规则 | 例外说明 |
|---|---|---|---|---|
| docs/prd | dir | 20260420_01_move-to-dialog | YYYYMMDD_index_short-slug | 本需求为 medium 专题包，不采用单文件 PRD |

---

## 现状审计（As-Is）

| audit_id | 现状对象 | 当前行为 | 本期影响 |
|---|---|---|---|
| ASIS-001 | 顶部 `MovePageModal` | 只支持移动到 Space 根级，不支持指定父级 | 保留为 `Move to space` 快速入口，新增 `Move to...` 精确入口 |
| ASIS-002 | 侧边栏拖拽 | 支持父子关系调整，但长列表 / 深层级操作困难 | 保留不变，`MoveToModal` 作为补充 |
| ASIS-003 | `POST /pages/move` | `position` 必填字符串；无 `null` 自动追加；单页移动缺少自身/后代 cycle guard | 本期后端向后兼容扩展 |
| ASIS-004 | `POST /search/suggest` | 可搜索页面，但结果缺少 `nodeType / space / canEdit` | P0 通过 `POST /pages/info` 对结果富化 |
| ASIS-005 | URL 路由 | 实际格式为 `/s/:spaceSlug/p/:title-:slugId` 或 `/p/:title-:slugId` | URL 解析必须提取最后一个 slug 片段 |

---

## 背景与目标

### 背景问题

- 现有"移动"功能仅支持将页面迁移至另一个 Space，无法指定目标父级（文件夹）。
- 侧边栏拖拽虽支持任意父子关系调整，但对深层级、长列表、跨 Space 场景极不友好。
- 用户明确需要一种"精确定位目标位置"的移动方式，参考 Notion 的 Move To 对话框体验。

### 目标指标

- G1：用户可通过弹窗将任意页面/文件夹移到同 Space 或跨 Space 的指定父级。
- G2：弹窗支持三种目标选择方式：最近访问列表、关键词搜索、粘贴页面链接。
- G3：操作完成后，侧边树实时更新，页面 URL 无需刷新（若同 Space 则保持当前路由）。
- G4：跨 Space 移动时有明确的二次确认，防止误操作。
- G5：现有拖拽、批量移动、跨 Space 移动路径不回归。

---

## 系统用户与角色

| role_id | 角色 | 核心职责 | 关键任务 | 权限边界 |
|---|---|---|---|---|
| R-EDITOR | Member/Editor | 整理文档结构 | 将文档/文件夹移到指定目标位置 | 需对被移动页面及目标位置均有编辑权 |
| R-OWNER | Space Owner/Admin | 管理 Space 信息架构 | 跨 Space 移动及根级整理 | 同 R-EDITOR，额外可执行跨 Space 移动 |
| R-READER | Member/Viewer | 只读浏览 | 无移动权限 | 不触发移动操作 |

---

## 典型用户故事

| story_id | 角色 | 用户故事 | 映射权限点 | 映射页面/接口 | 验收用例 |
|---|---|---|---|---|---|
| US-001 | R-EDITOR | 我想把"API 文档"移到"后端"文件夹下，但它在侧边树很深处，拖拽太难了 | `page:edit` + 目标 `page:edit` | `MoveToModal` + `POST /pages/move` | ACC-001 |
| US-002 | R-EDITOR | 我刚访问过"设计系统"文件夹，想直接从最近列表点选它作为目标 | `page:edit` | `MoveToModal` 最近访问列表 | ACC-002 |
| US-003 | R-EDITOR | 我从聊天里拿到了目标文件夹的链接，想粘贴进搜索框直接跳到那个位置 | `page:edit` | `MoveToModal` URL 解析 | ACC-003 |
| US-004 | R-OWNER | 我想把整个"旧版文档"文件夹移到另一个 Space 的"归档"目录下 | `page:edit` + 跨 Space 权限 | `MoveToModal` 跨 Space 二次确认 + `POST /pages/move-to-space` | ACC-004 |
| US-005 | R-EDITOR | 我误选了目标，想重新选择 | — | `MoveToModal` 取消选中 | ACC-005 |

---

## 功能概述与范围

### P0：核心功能

1. **新增 `MoveToModal` 弹窗**，从两处入口触发：
   - 侧边栏节点右键菜单 → "Move to..."
   - 页面顶部菜单 → "Move to..."（替换或新增，与原 "Move to Space" 区分）
2. **目标选择方式 A：最近访问列表**
   - 弹窗打开时，展示最近访问的 6 条页面/文件夹（来自 localStorage）
   - 过滤掉被移动页面本身及其所有后代
3. **目标选择方式 B：关键词搜索**
   - 输入框 debounce 300ms 后调用 `POST /search/suggest`
   - 结果展示：页面图标、标题、所属 Space、父级路径
4. **目标选择方式 C：粘贴链接**
   - 自动检测 `/s/{space}/p/{title}-{slugId}` 或 `/p/{title}-{slugId}` 格式
   - 前端提取 slugId 后调用 `POST /pages/info`（`includeContent=false`）解析并展示目标信息
5. **移动执行**：
   - 同 Space：调用 `POST /pages/move`，`position = null` 或省略（后端追加到目标末尾）
   - 跨 Space：先弹二次确认，再依次调用 `POST /pages/move-to-space` → `POST /pages/move`
6. **树更新**：移动成功后刷新侧边树相关查询缓存，保持路由不跳转（同 Space 时）。

### P1：后续迭代

1. 支持"移动到根级"（`parentPageId = null`）选项
2. 弹窗内展示目标位置的完整面包屑路径（含多级祖先）
3. 最近访问列表服务端持久化
4. 支持从 MoveToModal 同时触发批量移动

### 非范围

1. 不变更现有拖拽移动路径
2. 不合并旧 `MovePageModal`（保留跨 Space 快速入口）
3. 不在 Modal 内展示完整树形浏览器
4. 不支持移动操作的撤销（Undo）
5. 不新增服务端接口

---

## 信息架构与导航结构

### navigation_tree

- 侧边栏节点右键菜单
  - Rename
  - **Move to...** ← 新增
  - Move to Space（保留原有）
  - Delete
- 页面顶部菜单（`···`）
  - **Move to...** ← 新增
  - Move to Space（保留原有）

### route_inventory

| route_id | route_path | page_type | page_goal | primary_entity | primary_user_job | independent_goal_count | split_decision | single_workbench_exception | nav_upgrade_plan |
|---|---|---|---|---|---|---|---|---|---|
| ROUTE-001 | `/s/:spaceSlug/p/:pageSlug` | 页面容器 | 在当前文档上下文触发精确移动 | page | 选择目标父级并移动当前页面/文件夹 | 1 | keep_same_route（Modal 覆盖层，不新增路由） | forbidden | 当前导航可承载，无需升级 |

### page_boundary_decisions

| decision_id | candidate_scope | chosen_design | alternatives | decision_reason | why_not_modal | tradeoff | mitigation |
|---|---|---|---|---|---|---|---|
| IA-BD-001 | 当前页面移动到指定目标父级 | 在页面路由内打开 Modal | 新增独立路由、复用旧 Space Modal、侧边树树选择器 | 移动是短任务，不需要独立深链和刷新恢复 | 本场景允许 Modal，因为主任务在 1 分钟内完成，且无长表单 / 多步骤编辑 | Modal 内无法完整浏览整棵树 | P0 提供最近打开、搜索、粘贴链接；P1 再评估树选择器 |

---

## UI 规格

### 弹窗结构

```
┌──────────────────────────────────────────────────────┐
│  Move "{{pageTitle}}" to...                  [×]     │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐  │
│  │ 🔍 Search or paste a link...                   │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  [选中预览区 — 当 targetPage 不为 null 时显示]       │
│  ✓ Move to: 📁 Design System  · Work               │
│    Work › Design System                              │
│                                                      │
│  [列表区 — 动态切换]                                 │
│  Recently Visited               ← query 为空时标题   │
│  Results                        ← query 非空时标题   │
│  ─────────────────────────────────────────────────   │
│  📁 Design System          Work ›                    │
│  📄 API Documentation      Work › Backend ›          │
│  📁 Meeting Notes          Personal ›                │
│                                                      │
│                    [Cancel]       [Move Here]        │
└──────────────────────────────────────────────────────┘
```

- 弹窗宽度：500px，最大高度：520px，可滚动列表
- `[Move Here]` 按钮：未选中目标时灰色禁用
- 列表项高度：44px，含左侧图标、中间文字、右侧 Space 标签

### 列表项规格（`MoveTargetItem`）

```
[icon] Title                               [Space name]
       Parent › Parent ›（最多两级，超出省略）
```

- `icon`：页面 emoji 或 nodeType 默认图标（📁 folder / 📄 file）
- 高亮：选中项背景色 `var(--mantine-color-blue-light)`，左侧蓝色竖线
- 禁用态：无编辑权限时文字灰色，不可点击

### 跨 Space 二次确认（内嵌于 Modal）

```
⚠️  "Design System" and all its sub-pages will be moved to
    the "Work" space. This cannot be undone automatically.

                    [Cancel]       [Confirm Move]
```

- 不额外弹新 Modal，在 MoveToModal 内切换到确认视图
- 确认后执行跨 Space 移动序列

---

## 功能操作说明

| operation_id | operation_name | user_role | business_goal | entry_path | preconditions | operation_steps | expected_result | exception_cases | recovery_action | related_pages_apis | acceptance_case_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OP-001 | 通过最近访问选目标并移动 | R-EDITOR | 快速移动到常用位置 | 右键菜单 / 顶部菜单 → Move to... | 用户有编辑权；localStorage 有访问记录 | 1. 打开弹窗；2. 从列表点击目标；3. 点击 Move Here | 页面移至目标下，树刷新 | 最近访问记录已被删除 | 列表不展示已删除项，降级展示空列表提示 | `POST /pages/move` | ACC-001, ACC-002 |
| OP-002 | 搜索目标并移动 | R-EDITOR | 精确定位目标位置 | 同上 | 用户有编辑权 | 1. 打开弹窗；2. 输入关键词；3. 等待结果；4. 点击目标；5. 点击 Move Here | 同上 | 搜索无结果 | 展示"No results found" | `POST /search/suggest` + `POST /pages/move` | ACC-001 |
| OP-003 | 粘贴链接定位目标并移动 | R-EDITOR | 从外部链接快速定位 | 同上 | 用户有编辑权；粘贴内容是合法页面 URL | 1. 打开弹窗；2. 粘贴 URL；3. 系统自动解析并展示目标；4. 点击 Move Here | 同上 | URL 无效 / 页面不存在 | 输入框下方红色提示"Invalid page URL" | `POST /pages/info` + `POST /pages/move` | ACC-003 |
| OP-004 | 跨 Space 移动 | R-OWNER | 将文档迁移到另一 Space 下的指定位置 | 同上 | 目标在不同 Space，用户有两端权限 | 1-4 同上；5. 系统检测跨 Space，展示确认视图；6. 点击 Confirm Move | 页面移至目标 Space 目标位置，路由跳转到新 Space URL | 目标 Space 无权限 | 禁用该目标项，Tooltip 提示"No access" | `POST /pages/move-to-space` + `POST /pages/move` | ACC-004 |
| OP-005 | 取消选中目标 | R-EDITOR | 重新选择 | MoveToModal 内 | 已选中某目标 | 点击已选中项 或 清除输入框 | 取消高亮，Move Here 再次禁用 | — | — | — | ACC-005 |

---

## 标识与编码策略

| identifier_id | identifier_name | identifier_type | business_meaning | generated_by | create_time_policy | user_visible_scope | editable | format_rule | source_of_truth |
|---|---|---|---|---|---|---|---|---|---|
| IDENT-001 | `pages.id` | `system_id`（系统唯一标识） | 页面系统内唯一标识 | `backend_service` 后端生成 | `not_input`，普通页面不手动输入 | URL 内不展示，接口内部使用 | `no`，只读不可编辑 | UUID | `pages.id` |
| IDENT-002 | `pages.slugId` | `external_reference`（外部引用号） | 页面链接中的稳定引用片段 | `backend_service` 后端生成 | `server_return_only`，不得手填 | URL 可见 | `no`，只读不可编辑 | nanoid 10 位；URL 可带 title 前缀 | `pages.slug_id` |
| IDENT-003 | `docmost:recent-pages:{workspaceId}` | `business_code`（客户端存储 key） | 当前浏览器最近打开页面缓存 | 前端客户端 | `client_generated`，退出登录清理 | 仅当前浏览器 localStorage | 可由系统覆盖，用户不手动输入 | JSON array of `RecentPageEntry`，max 10 | 客户端 localStorage |
| IDENT-004 | `targetPage` | `system_id` 引用状态 | Modal 内部选中目标页面 | React state | `server_return_only`，由查询接口返回后写入 | 仅弹窗内 | 用户通过选择项变更，不手输内部 ID | `MoveTargetPage \| null` | 组件 state |

---

## 权限矩阵

| 操作 | Owner/Admin | Editor | Viewer |
|---|---|---|---|
| 打开 MoveToModal | 是 | 是 | 否（菜单项隐藏） |
| 浏览最近访问列表 | 是 | 是 | — |
| 搜索目标页面 | 是 | 是 | — |
| 粘贴链接解析 | 是 | 是 | — |
| 执行同 Space 移动 | 是（需目标编辑权） | 是（需目标编辑权） | — |
| 执行跨 Space 移动 | 是 | 是（需两端权限） | — |

---

## 跨模块联动规则与阻断矩阵

| rule_id | source_of_truth | trigger_action | block_condition | frontend_surface | backend_guard | recovery_action |
|---|---|---|---|---|---|---|
| LINK-001 | `pages.nodeType` | 选择目标时 | 目标是 `file` 类型且被移项是 `folder` | 列表项禁用，Tooltip 提示 | 服务端校验层级规则 | 提示"Folders can only be placed inside folders" |
| LINK-002 | `pages.id` / 后代查询 | 选择目标时 | 目标是被移页面自身或其后代 | 已知后代列表项禁用；未知后代由提交失败提示兜底 | `PageService.movePage` 递归祖先检查 | 提示"Cannot move a page into its own child" |
| LINK-003 | `pages.spaceId` | 确认移动时 | 目标 Space 与当前不同 | 展示跨 Space 确认视图 | `move-to-space` 接口 | 用户取消或确认 |
| LINK-004 | `page_node_meta.sidebarCategoryId` | 移动成功后 | 被移页面原为首级节点（有 sidebarCategoryId） | 无额外提示 | 后端 `movePage` 自动清空 `sidebarCategoryId` | 节点在目标 Space/位置正常显示 |
| LINK-005 | `permissions.canEdit` | 渲染列表项时 | 用户对目标页面无编辑权 | 列表项灰色禁用 | 服务端权限校验 | 提示"No access to this location" |

---

## 改造策略确认闸门

- current_stage：pre_production
- strategy：migrate（前端新增组件；后端对既有 `POST /pages/move` 做向后兼容增强，不破坏旧客户端）
- user_confirmation：confirmed
- 决策理由：评审确认现有 `position` 与 cycle guard 不足以支撑目标体验；采用兼容增强可让旧拖拽继续传字符串 position，新 Modal 可传 null 追加。

---

## 能力复用与重复建设审查

- existing_scan：已有搜索建议接口、`POST /pages/info`、`POST /pages/move`、`POST /pages/move-to-space`、树查询失效能力
- build_vs_reuse：extend
- consolidation_plan：
  - 复用 `POST /search/suggest` 作为搜索源
  - 复用 `POST /pages/info` 富化 URL / 搜索 / 最近打开目标
  - 复用侧边树 query 失效与清空树数据触发重载
  - 复用 `MoveTargetItem` 组件在最近访问列表与搜索结果之间共享

---

## 领域边界与服务拆分

| domain_id | domain_goal | primary_entities | frontend_routes | backend_router | backend_service | allowed_commands | read_models | out_of_scope | split_trigger | permission_scope | acceptance_case_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DOMAIN-MOVE-TO-DIALOG | 为单个页面/文件夹提供精确父级移动 | page, page_node_meta | `/s/:spaceSlug/p/:pageSlug` | `PageController` | `PageService` | move_page_append, move_page_to_space_then_parent | page_info_query, search_suggest_query, breadcrumbs_query | 拖拽排序、批量移动、撤销移动、完整树选择器 | 若新增批量 MoveTo 或移动历史，拆出独立 move orchestration service | space page edit + target page edit | ACC-001~ACC-009 |

---

## 改造影响矩阵

| impact_id | 变更类型 | 现状行为（As-Is） | 目标行为（To-Be） | 影响页面/交互 | 影响接口 | 影响数据表 | 影响权限点 | 灰度开关/维度 | 回滚动作 | 回归用例ID |
|---|---|---|---|---|---|---|---|---|---|---|
| IM-001 | 前端入口 | 仅有 `Move` 到 Space | 新增 `Move to...`，旧入口改为 `Move to space` | 顶部菜单、侧边栏菜单 | 无 | 无 | 编辑菜单可见性 | 无 | 移除新菜单项 | REG-002 |
| IM-002 | 后端契约 | `position` 必填字符串 | `position` 可省略 / null，服务端追加末尾 | MoveToModal 提交 | `POST /pages/move` | pages.position 更新 | 被移页面与目标父级编辑权 | 无 | 回退 DTO 与 service 逻辑，隐藏 Modal | TC-001, TC-006 |
| IM-003 | 后端安全 | 单页 move 无 cycle guard | 禁止移动到自身或后代 | 所有单页 move 入口 | `POST /pages/move` | 无 | 对象级权限不变 | 无 | 保留 guard，不建议回滚 | TC-008, TC-009 |
| IM-004 | 客户端存储 | 无最近打开 | workspace 维度 localStorage 最近打开 | 页面访问、MoveToModal | 无 | localStorage | 无 | 无 | 清空 key / 停止写入 | REG-004, REG-005 |

---

## 验收标准

- ACC-001：从右键菜单或顶部菜单均可打开 MoveToModal；弹窗包含搜索框和最近访问列表。
- ACC-002：最近访问列表展示最多 6 条；被移页面本身及其后代不出现在列表中；点击后高亮选中并激活 Move Here 按钮。
- ACC-003：在搜索框粘贴合法页面 URL 后，自动解析并在选中预览区展示目标页面信息；粘贴无效 URL 时显示错误提示。
- ACC-004：目标页面在不同 Space 时，点击 Move Here 前先切换到跨 Space 确认视图，确认后完成移动并跳转到新 URL。
- ACC-005：点击已选中的目标项可取消选中；取消后 Move Here 按钮回到禁用状态。
- ACC-006：`file` 类型的页面不可作为移动目标（移动 `folder` 时）；违规时列表项禁用，含 Tooltip 说明。
- ACC-007：将页面移动到自身或其后代时，目标项禁用；若后端返回错误，弹出 error notification。
- ACC-008：移动成功后侧边树自动刷新；同 Space 移动时路由不变；跨 Space 移动时路由跳转到目标 Space。
- ACC-009：现有拖拽移动、批量移动、MovePageModal（跨 Space 快速移动）行为不回归。

---

## 修改日志

- 2026-04-20：完成首版产品方案定稿。
