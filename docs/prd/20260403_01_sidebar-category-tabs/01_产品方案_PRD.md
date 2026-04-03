# 01 产品方案 PRD：Sidebar Category Tabs

**成文日期**：2026-04-03 14:15:27 UTC+8
**最后修订**：2026-04-03 14:15:27 UTC+8

本文档用于定义产品目标、范围、规则与验收标准。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：medium
- 交付模式：package_dir
- 判档依据：需求横跨信息架构、交互、接口、数据与迁移规则，且要对现有 Pin 行为、树加载逻辑与 Space 级共享配置做约束。

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260403_01_sidebar-category-tabs
- 命名规则：YYYYMMDD_index_short-slug（short-slug 建议 2-5 词，长度 <= 32）

## 背景与目标

### 背景问题

- 根节点过多时，侧边树可浏览性快速下降，用户要么长滚动，要么依赖搜索。
- `Pinned` 已存在，但只表达“优先级”，不表达“主题归属”。
- 用户明确希望通过 `全部 / 置顶 / 创业` 一类 Tab 切换更快收敛导航范围。
- 若把这件事直接做成“通用标签”，会让树结构、拖拽、复制和排序语义变复杂。

### 目标指标

- G1：在根节点数 >= 20 的 Space 中，用户可通过一次 Tab 切换快速缩小首屏范围。
- G2：用户能够理解“树表示位置、Tab 表示浏览视图、置顶表示优先级”三者语义，不产生内容“消失”的误解。
- G3：新增分类后，Space 内所有成员看到一致的 Tab 结构。
- G4：切换 Tab 不触发整页刷新，根树请求与现有分页/懒加载兼容。
- G5：现有 `Pinned`、树拖拽、文件夹展开、目录统计、权限校验不回归。

## 系统用户与角色

| role_id | 角色 | 核心职责 | 关键任务 | 权限边界 |
|---|---|---|---|---|
| R-OWNER | Space Owner/Admin | 管理 Space 信息架构 | 创建分类、排序分类、指定首级节点归属 | 可管理分类配置与根节点归类 |
| R-EDITOR | Member/Editor | 高频浏览和编辑文档 | 切换 Tab、浏览分类树、维护内容 | 仅能在有编辑权时调整节点归类 |
| R-READER | Member/Viewer | 只读浏览内容 | 使用 Tab 缩小导航范围、定位目标文档 | 仅查看分类结果，不修改配置 |

## 典型用户故事

| story_id | 角色 | 用户故事 | 映射权限点 | 映射页面/接口 | 验收用例 |
|---|---|---|---|---|---|
| US-001 | R-EDITOR | 作为编辑者，我希望把“融资”“跨境电商”等首级目录归到不同分类下，以便减少根树滚动。 | `space:page:edit` | 侧边树节点菜单 + `POST /pages/sidebar-category/assign` | ACC-003 |
| US-002 | R-READER | 作为浏览者，我希望点击 `创业` Tab 后只看到创业相关首级目录，并能继续展开其下级内容。 | `space:page:read` | 侧边树 Tab + `POST /pages/sidebar-pages` | ACC-001 |
| US-003 | R-OWNER | 作为管理员，我希望创建、重命名、删除和排序分类，并让整个 Space 共用同一套 Tab。 | `space:sidebar-category:manage` | 分类管理入口 + `/spaces/sidebar-categories/*` | ACC-004 |
| US-004 | R-EDITOR | 作为编辑者，我希望 `置顶` 仍保留优先级语义，同时不和业务分类混成一个字段。 | `space:page:edit` | 置顶菜单 + `POST /pages/pin` + `POST /pages/sidebar-pages` | ACC-002 |
| US-005 | R-READER | 作为浏览者，我希望即使进入了某个不在当前 Tab 下的页面，侧边栏也不会出现“当前页不见了”的状态。 | `space:page:read` | 页面容器 + 侧边树视图回退逻辑 | ACC-006 |

## 现状审计（As-Is）

- 现有侧边栏只有一棵根树，没有分类 Tab。
- 现有 `page_node_meta` 已包含 `nodeType/isPinned/pinnedAt`，但没有分类字段。
- 现有 `POST /pages/sidebar-pages` 只支持按 `spaceId/pageId` 查询，不支持按视图过滤根树。
- 现有 `Pinned` 仅表达排序优先级，不能表达业务主题归类。
- 详细证据与代码盘点见 `00_现状审计.md`。

## 设计理念与方案对比

### 设计原则

1. 树只表示真实层级，不表示业务标签。
2. Tab 只做首级浏览视图，不替代搜索。
3. 置顶是优先级维度，不与分类字段合并。
4. 先做单分类、共享分类、最小可理解模型，后续再考虑真正标签系统。
5. 所有“可能让文档看起来消失”的交互都必须有可恢复路径。

### 方案对比

| 方案 | 描述 | 优点 | 风险/缺点 | 结论 |
|---|---|---|---|---|
| A | 全节点通用多标签 + Tab 过滤 | 未来扩展性强 | 树结构断裂、重复出现、继承规则复杂、超出当前需求 | 不选 |
| B | 首级节点单分类 + 系统视图 Tab | 语义简单、与树兼容、实现成本可控 | 不能覆盖高级标签检索场景 | 选中 |
| C | 直接拆成多套物理目录树 | 用户容易理解 | 会把“浏览视图”错误地固化成“物理归属”，迁移成本高 | 不选 |

## 功能概述与范围

### P0 范围

1. 侧边栏顶部新增 Tab 视图：
   - `全部`
   - `置顶`
   - 自定义分类 Tab
2. 仅首级文件/文件夹可设置分类，且一项最多一个分类。
3. 自定义分类支持：
   - 创建
   - 重命名
   - 删除
   - 排序
4. 首级节点支持：
   - 设为某个分类
   - 清除分类
5. 根树查询支持按 `全部 / 置顶 / 分类` 过滤。
6. 每个 Space 记住上次选中的 Tab。
7. 当当前页面不属于当前 Tab 视图时，自动切回 `全部` 并刷新根树。

### P1 范围

1. 批量设置分类。
2. `未分类` 独立 Tab。
3. 分类数量徽标。
4. 分类颜色/图标。
5. 真正的搜索 Facet 标签系统。

### 非范围

1. 不变更文档真实父子归属。
2. 不做跨 Space 共享或模板化分类。
3. 不把 `Pinned` 改造成全局快捷入口中心。

## 信息架构与导航结构

### navigation_tree

- Space Sidebar
  - 搜索区（现有）
  - View Tabs
    - 全部
    - 置顶
    - 自定义分类 1..N
    - 更多（overflow）
  - Tree Content
    - 根节点列表
    - 展开后的完整子树

### route_inventory

| route_id | route_path | page_type | primary_user_job | page_goal | deep_link_required | independent_permission | split_decision |
|---|---|---|---|---|---|---|---|
| ROUTE-001 | `/s/:spaceSlug/:pageSlug` | page_container | 浏览/编辑当前文档并借助侧边栏导航 | 在不新增主路由的前提下增强侧边导航效率 | no | no | keep_same_route |
| ROUTE-002 | 无新增路由；Tab 为 sidebar view state | local_view_state | 切换根树浏览范围 | 仅改变侧边树数据源，不改变主内容路由 | no | no | no_new_route |

### page_boundary_decisions

| decision_id | candidate_scope | chosen_design | alternatives | decision_reason | why_not_modal | tradeoff | mitigation |
|---|---|---|---|---|---|---|---|
| IA-001 | 分类视图切换 | 作为侧边栏本地视图层实现 | 独立路由、独立页面 | 这是导航上下文切换，不是新的主任务页 | N/A | 无法直接分享某个分类视图链接 | 先记忆用户上次选择；如后续有需求再补 query 参数 |
| IA-002 | 分类配置入口 | 小型管理弹层/菜单实现 | 独立设置页 | 配置对象少、字段少、停留时间短 | 不需要独立主内容区 | 管理复杂度上升时弹层会拥挤 | 超过 20 个分类或权限/审计增强时再拆设置页 |
| IA-003 | 分类模型 | 首级节点单分类 | 全节点多标签 | 当前需求是导航收敛，不是检索系统 | N/A | 未来高级检索能力需另建模型 | 预留后续标签系统，不复用本字段 |

## 功能操作说明

| operation_id | operation_name | user_role | business_goal | entry_path | preconditions | operation_steps | expected_result | exception_cases | recovery_action | related_pages_apis | acceptance_case_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OP-001 | 切换侧边栏 Tab | 全部角色 | 缩小根树浏览范围 | Space 侧边栏顶部 Tab | 用户有 Space 读权限 | 1. 点击 `全部/置顶/某分类`；2. 系统刷新根树；3. 保留当前展开/选中状态的可恢复部分 | 只展示当前视图下的根节点，并可继续展开子树 | 请求失败、分类已删除 | 回退到 `全部` 并提示分类已不可用 | `SpaceTree`、`POST /pages/sidebar-pages` | ACC-001 |
| OP-002 | 创建分类 | Owner/Admin | 新增一个业务导航视图 | 侧边栏分类管理入口 | 用户有分类管理权限，名称合法且不重复 | 1. 打开分类管理；2. 输入名称；3. 提交保存 | 新分类出现在 Tab 列表与管理面板中 | 名称重复、超长、数量超限 | 提示原因并保留输入内容 | `/spaces/sidebar-categories/create` | ACC-004 |
| OP-003 | 给首级节点设置分类 | 可编辑成员 | 把根节点归入某个业务视图 | 首级节点更多菜单 | 节点是首级节点且用户可编辑 | 1. 打开根节点菜单；2. 选择分类；3. 提交 | 节点在所选分类 Tab 中可见，在 `全部` 中仍可见 | 节点不是首级、分类不属于当前 Space、无权限 | 禁止提交并明确提示“仅首级节点可设置分类” | `/pages/sidebar-category/assign` | ACC-003 |
| OP-004 | 删除分类 | Owner/Admin | 收缩无用 Tab，不删除文档 | 分类管理入口 | 用户有管理权限 | 1. 点击删除分类；2. 二次确认；3. 系统取消关联所有根节点分类并删除分类配置 | 分类从 Tab 中消失，相关根节点回到未分类状态，只在 `全部` 中可见 | 分类已被他人删除、删除过程中写入失败 | 保持原状态并提示重试 | `/spaces/sidebar-categories/delete` | ACC-005 |

## 标识与编码策略

| identifier_id | identifier_name | identifier_type | generated_by | create_time_policy | user_visible_scope | editable | uniqueness_scope | format_rule | source_of_truth | conflict_strategy |
|---|---|---|---|---|---|---|---|---|---|---|
| IDENT-001 | `sidebar_category_id` | system_id | backend_service | not_input | hidden | no | `space + category` | UUID v7 | `space_sidebar_categories` | 服务端生成；冲突自动重试 |
| IDENT-002 | `sidebar_view_key` | display_state_key | frontend_client | derived | local_state | yes | `space + user` | `all/pinned/category:<id>` | 客户端持久化状态 | 分类不存在时回退 `all` |

## 权限矩阵

| 操作 | Owner/Admin | Editor | Viewer |
|---|---|---|---|
| 查看 Tab 与分类结果 | 是 | 是 | 是 |
| 创建/重命名/删除/排序分类 | 是 | 否 | 否 |
| 给首级节点设分类 | 是 | 是（需有页面编辑权） | 否 |
| 清除节点分类 | 是 | 是（需有页面编辑权） | 否 |

## 跨模块联动规则与阻断矩阵

| rule_id | source_of_truth | trigger_action | block_condition | frontend_surface | backend_guard | recovery_action |
|---|---|---|---|---|---|---|
| LINK-001 | `pages.parent_page_id` | 给节点设分类 | 节点不是首级节点 | 菜单隐藏或置灰 | 服务端拒绝写入 | 引导先移动到根级，或仅在父目录内置顶 |
| LINK-002 | `space_sidebar_categories.space_id` | 绑定分类 | 分类不属于当前 Space | 提示不可选 | 服务端校验 `page.spaceId == category.spaceId` | 重新选择当前 Space 下分类 |
| LINK-003 | 树移动逻辑 | 把已分类根节点移动到其他父目录下 | 节点失去首级身份 | 前端不额外阻断 | 写操作完成后清空 `sidebar_category_id` | 节点仍可在 `全部` 中找到 |
| LINK-004 | 分类删除逻辑 | 删除分类 | 分类下仍有关联根节点 | 二次确认显示受影响数量 | 事务内先解绑再删除分类 | 用户确认后删除，文档不删除 |

## 改造策略确认闸门

- current_stage：pre_production
- strategy：migrate
- user_confirmation：confirmed
- 决策理由与回退约束：
  - 不改变树的真实层级，不影响已有页面 URL。
  - 所有历史节点默认“未分类”，不需要回填脚本。
  - 若上线后理解成本或筛选稳定性不达标，可直接回退前端 Tab 入口和新增查询条件。

## 能力复用与重复建设审查

- existing_scan：已有节点元数据表、置顶能力、根树查询接口、树懒加载与权限判定。
- build_vs_reuse：extend
- non_reuse_reason：N/A
- consolidation_plan：
  - 继续使用 `page_node_meta` 承载节点导航元数据。
  - 不新建第二套树接口，不复制 Pin 能力。
  - 将“分类”严格限定为导航视图模型，避免与未来 Tags 混淆。

## 领域边界与服务拆分

| domain_id | domain_goal | primary_entities | frontend_routes | backend_router | backend_service | allowed_commands | out_of_scope |
|---|---|---|---|---|---|---|---|
| DOMAIN-SIDEBAR-CATEGORY | 管理 Space 级分类配置 | `space_sidebar_categories` | 当前页面容器内侧边栏 | `space.controller` 或分类专用 controller | `SidebarCategoryService` | create_category, rename_category, delete_category, reorder_category, list_categories | page_content_edit, pin_management |
| DOMAIN-PAGE-NAVIGATION-VIEW | 管理根树视图过滤与首级节点归类 | `pages`, `page_node_meta` | 当前页面容器内侧边栏 | `page.controller` | `PageService` 或 `PageNavigationService` | filter_root_sidebar, assign_root_category, clear_root_category | global_tags, search_facets, cross_space_categories |

### 边界结论

- `domain_id=DOMAIN-SIDEBAR-CATEGORY` 只负责分类配置，不直接负责页面内容和树节点写入。
- `domain_id=DOMAIN-PAGE-NAVIGATION-VIEW` 只负责根树视图与节点归类，不承接分类配置 CRUD。
- `primary_entities` 明确拆成“分类配置实体”和“节点导航元数据实体”，避免继续把所有逻辑堆在一个大总管服务中。

## 改造影响矩阵与灰度切换

| impact_id | 现状行为 | 目标行为 | 影响对象 | 风险等级 | 回归用例 |
|---|---|---|---|---|---|
| IM-001 | 只有一棵根树 | 顶部新增系统/自定义 Tab | 侧边栏导航 | medium | ACC-001 |
| IM-002 | 无分类配置 | Space 级共享分类 | Space 配置与协作一致性 | medium | ACC-004 |
| IM-003 | 根节点无法归入主题视图 | 首级节点支持单分类 | 节点菜单与树过滤 | high | ACC-003 |
| IM-004 | `Pinned` 仅排序，不可单独浏览根视图 | `置顶` Tab 可查看置顶根节点 | 置顶语义与树排序 | medium | ACC-002 |
| IM-005 | 当前页面可能通过祖先补齐显示 | 当前页不属于所选视图时自动回退 `全部` | 当前页与树一致性 | high | ACC-006 |

### 灰度策略

1. Stage 1：开发/测试环境验证数据模型与根树过滤正确性。
2. Stage 2：小范围 Space 灰度启用，重点观察“当前页缺失”“分类删除后树异常”。
3. Stage 3：全量启用。

### 回滚策略

- 触发条件：
  - 当前页与侧边树不同步
  - 分类过滤错误
  - 分类写入导致节点在 `全部` 中不可见
- 回滚动作：
  1. 前端隐藏 Tab 与分类入口
  2. 服务端忽略 `viewMode/categoryId`
  3. 保留数据表与字段，不做破坏性回滚
- 目标时长：30 分钟内恢复为单树模式

## 验收标准

- ACC-001：侧边栏支持 `全部 / 置顶 / 自定义分类` Tab 切换；切换后只影响根节点列表，不改变真实子树结构。
- ACC-002：`全部` 与分类视图中，排序继续遵循“置顶优先 + 位置排序”；`置顶` 视图只展示首级置顶节点。
- ACC-003：仅首级文件/文件夹可以设置分类；设置后在对应分类 Tab 中可见，子节点跟随所属根节点展示。
- ACC-004：分类支持创建、重命名、删除、排序；同一 Space 全员共享同一套分类。
- ACC-005：删除分类不会删除任何文档；所有关联根节点退回未分类状态，并继续在 `全部` 中可见。
- ACC-006：当前页面若不属于当前 Tab 结果集，客户端自动切回 `全部`，保证当前页路径在树中可见。
- ACC-007：无分类权限的用户仍可查看分类 Tab，但不能修改分类配置或节点归类。
- ACC-008：现有 `Pinned`、文件夹展开、目录统计、拖拽与页面权限不回归。

## 修改日志

- 2026-04-03 14:15:27 UTC+8：完成首版产品方案定稿，确定采用“首级单分类 + 系统视图 Tab”。
