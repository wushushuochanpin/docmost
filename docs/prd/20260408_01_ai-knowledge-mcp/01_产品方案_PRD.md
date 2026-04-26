# 01 产品方案 PRD：Docmost 个人知识库 AI 接入与 MCP 方案

**成文日期**：2026-04-08 13:46:11 UTC+8
**最后修订**：2026-04-26 UTC+8

本文档用于定义产品目标、范围与验收标准。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：large
- 交付模式：package_dir
- 判档依据：需求同时覆盖知识检索、AI 协议、认证授权、限流审计、工作区边界与后续写入能力，属于跨前后端、跨协议层、带高风险写链路预研的方案设计

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260408_01_ai-knowledge-mcp
- 命名规则：YYYYMMDD_index_short-slug（short-slug 建议 2-5 词，长度 <= 32）

## 背景与目标

### 背景问题

1. 个人知识库场景要求 AI 能稳定读取在线文档，而不仅是偶发导出后离线问答。
2. 当前仓库已有搜索、页面读取、导出、Token、Audit、AI Search/MCP 开关预留，但缺少实际可复用的 MCP 服务与面向 LLM 的检索编排层。
3. 直接把现有业务 REST 暴露给 AI 工具，会带来三类问题：
   - 检索质量不足：长文档与多段内容难以被高质量召回
   - 治理能力不足：缺少 tool scope、限流与 AI 专用审计语义
   - 风险过高：写操作开放过早，越权与误写成本高

### 目标指标

1. P0：支持外部 AI 工具以只读方式访问知识库，完成 `search + fetch` 闭环。
2. P0：首期以现有 Docmost 数据库与权限模型为 source of truth，不引入平行知识主库。
3. P0：支持 Bearer API Key 接入，工具调用全程带权限校验与审计留痕。
4. P0：AI 查询结果能返回标题、片段、定位标识与文档正文，支持引用和回链。
5. P1：引入 hybrid retrieval，把现有 FTS 与向量检索组合，提升语义问答效果。
6. P2：补齐 OAuth 兼容授权与可控写入工具。

### 成功指标

| 指标 | 目标值 |
| --- | --- |
| `search` P95 | <= 1200ms |
| `fetch` P95 | <= 800ms |
| 首期工具可用性 | >= 99.9% |
| 只读范围内越权事故 | 0 |
| Token 撤销生效时间 | <= 1 分钟 |
| 典型长文档问答召回满意度 | 主观评审通过率 >= 80% |

## 系统用户与角色

| role_id | 角色名称 | 核心职责 | 权限边界 | 高风险操作 |
| --- | --- | --- | --- | --- |
| ROLE-001 | Workspace Owner/Admin | 开启 MCP、管理工作区 Token、查看审计与限制策略 | 可管理工作区级配置与 Token | 开启写工具、放宽 scope、批量撤销 Token |
| ROLE-002 | 普通成员/个人知识库维护人 | 创建个人 API Key，连接自用 AI 客户端 | 仅能访问自己本就有权限的页面与空间 | 把高权限 Token 配给外部 AI |
| ROLE-003 | 外部 AI Client/App | 通过 MCP 或 API Key 访问知识 | 仅能调用被允许的只读工具 | 高频抓取、错误重试风暴、越权探测 |
| ROLE-004 | 安全/审计负责人 | 追踪调用、复核异常行为、设定保留期 | 不直接负责日常使用 | 漏审敏感调用与外泄迹象 |

## 典型用户故事（按角色）

1. 作为个人知识库维护人，我希望在 `account/api-keys` 创建只读 Token，并在 ChatGPT/Cursor 中接入同一个 MCP 地址，这样我不需要为每个工具重复维护知识副本。
2. 作为外部 AI Client，我希望先执行 `search` 再执行 `fetch`，得到带引用的 Markdown 内容，而不是拿到不可解析的富文本 JSON。
3. 作为 Workspace Admin，我希望可以在工作区层面开启/关闭 MCP，并能撤销异常 Token，这样在发现外部 AI 使用不当时可以快速止损。
4. 作为安全/审计负责人，我希望能看到 MCP 调用轨迹、Token 最近使用时间与来源 IP，这样可以排查异常访问与数据外泄风险。

## 功能概述与范围拆解

### P0 范围

1. remote MCP 接入入口
2. 只读工具：`search`、`fetch`
3. Bearer API Key 鉴权复用
4. 权限感知的检索与正文抓取
5. Token 与工具调用审计
6. 工作区级 MCP 开关与个人/工作区 Token 管理复用

### P1 范围

1. hybrid retrieval：FTS + vector + snippet/rerank
2. 可选通用只读工具：`get_page_markdown`、`list_spaces`、`get_current_user`
3. 查询性能监控与配额策略
4. 附件图片 URL 在 `fetch` 结果中随页面正文返回，供视觉型 AI 客户端按需请求

### P2 范围

1. OAuth 兼容的远程 MCP 授权
2. scope 细粒度治理
3. 可控写工具：`create_page`、`update_page` 等
4. MCP content block 内联图片（base64），支持视觉型 AI 客户端（如 Claude）在单次工具调用内直接理解图片内容，无需二次请求

### 非目标

1. 首期不做公开互联网搜索与私有知识混跑编排。
2. 首期不支持自动执行高风险写操作。
3. 首期不建设独立知识门户或新工作台页面。
4. 不做页面整页截图（headless browser 渲染），AI 需要的是结构化内容而非像素图。
5. 不提供 CLI 工具作为面向用户的正式 AI 接入协议，正式接入协议为 remote MCP。
6. 不做图片内容的服务端 OCR 或描述生成，由 AI 客户端自行处理。

## 信息架构与路由拆分

### navigation_tree

- 设置
  - 账户
    - `account/api-keys`
  - 工作区
    - `api-keys`
    - `audit`
  - AI
    - `ai/mcp`

### route_inventory

| route_id | route_path | parent_route | menu_path | page_type | primary_user_job | page_goal | primary_entity | core_actions | deep_link_required | independent_permission | secondary_readonly_modules | entry_from | child_routes | out_of_scope | independent_goal_count | split_decision | single_workbench_exception | nav_upgrade_plan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IA-001 | `/settings/account/api-keys` | `/settings/account` | 设置 / 账户 / API Keys | list | 管理个人 Token | 创建、查看、撤销个人只读 Token | personal_api_token | 创建、复制、撤销 | yes | yes | MCP 地址说明卡片 | 设置侧边栏 | 无 | 工作区级策略与审计 | 1 | split_required | forbidden | 不新增子路由 |
| IA-002 | `/settings/api-keys` | `/settings` | 设置 / API Keys | list | 管理工作区 Token | 创建、查看、撤销工作区 Token | workspace_api_token | 创建、撤销、查看使用情况 | yes | yes | 只读说明 | 设置侧边栏 | 无 | 个人 Token 创建细节 | 1 | split_required | forbidden | 不新增子路由 |
| IA-003 | `/settings/audit` | `/settings` | 设置 / Audit | list | 审计 AI 与 Token 相关事件 | 查询审计、按条件过滤 | audit_event | 查询、过滤、导出 | yes | yes | 调用概览卡片 | 设置侧边栏 | 无 | Token 编辑、MCP 开关 | 1 | split_required | forbidden | 不新增子路由 |
| IA-004 | `/settings/ai/mcp` | `/settings/ai` | 设置 / AI / MCP | config | 管理 MCP 能力与接入说明 | 开关 MCP、展示地址、说明支持工具 | workspace_ai_mcp_config | 开启、关闭、复制地址、查看指南 | yes | yes | 只读状态摘要 | 设置侧边栏 | 无 | Token CRUD、审计查询 | 1 | split_required | forbidden | 若后续增加索引诊断，再拆兄弟路由 |

### page_boundary_decisions

| decision_id | candidate_scope | chosen_design | alternatives | decision_reason | why_not_modal | tradeoff | mitigation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IA-BD-001 | MCP 开关、Token 管理、审计查询统一成单页工作台 | split_routes | single_page_workbench | 三类能力主任务不同、权限不同、停留时长不同 | Token 创建与审计查询都不适合作为 MCP 开关页内弹窗承载 | 路由更多，导航更分散 | 保持设置侧边栏层级清晰，用说明卡串联 |
| IA-BD-002 | 在 `account/api-keys` 同页承载工作区级 Token 管理 | split_routes | list_with_tabs | 个人 Token 与工作区 Token 操作人不同、授权边界不同 | 管理员与成员看到的对象范围不同，放同页易误导 | 页面数量增加 | 维持现有路径分离，降低认知歧义 |

## 功能操作说明

| operation_id | operation_name | user_role | business_goal | entry_path | preconditions | operation_steps | expected_result | exception_cases | recovery_action | related_pages_apis | acceptance_case_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OP-001 | 连接 AI 助手 | 普通成员/Owner | 用只读 Token 连接外部 AI 客户端 | `/settings/account/api-keys`、`/settings/ai/mcp` | 工作区已开启 MCP；用户具备创建 Token 权限 | 1. 进入个人 Token 页面创建 Token。2. 复制明文 Token。3. 进入 MCP 设置页复制 `/mcp` 地址。4. 在外部 AI 客户端配置 Bearer Token 与服务地址。 | AI 客户端可成功列出并调用只读工具 | MCP 未开启、Token 已过期、无权创建 Token | 到 `ai/mcp` 开启能力，或让管理员放宽策略，或重新创建 Token | `POST /integration-keys/create`、`/mcp` | ACC-001 |
| OP-002 | AI 查询知识 | 外部 AI Client | 根据自然语言问题检索并获取页面正文 | 外部 AI 客户端对 `/mcp` 的 `search`、`fetch` 调用 | Token 有效；目标页面对该用户可见；索引可用 | 1. 调用 `search` 传入自然语言 query。2. 服务端返回候选结果列表。3. AI 选择结果 ID 调用 `fetch`。4. 服务端返回 Markdown 正文与元数据。 | AI 获取可引用、可回链的正文内容 | 查询无结果、页面被删除、Token 被撤销、目标空间无权限 | 返回稳定错误码；AI 提示用户缩小问题范围或改问关键词；管理员检查 Token 和权限 | `POST /search`、`POST /pages/info`、`/mcp search/fetch` | ACC-002 |
| OP-003 | 撤销异常 Token | Workspace Admin/成员本人 | 发现外部 AI 调用异常后快速止损 | `/settings/account/api-keys`、`/settings/api-keys` | 调用人拥有对应撤销权限 | 1. 查看 Token 最近使用时间/IP。2. 在个人或工作区页面执行撤销。3. 后端更新状态并记录审计。 | 被撤销 Token 后续调用立即失败 | Token 不存在、权限不足、重复撤销 | 刷新列表并查看审计；必要时补发新 Token | `POST /integration-keys/revoke`、`POST /admin/integration-keys/revoke`、`POST /audit-events/list` | ACC-003 |

## 标识与编码策略

| identifier_id | identifier_name | identifier_type | business_meaning | generated_by | create_time_policy | user_visible_scope | editable | uniqueness_scope | format_rule | source_of_truth | conflict_strategy | acceptance_case_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IDENT-001 | `token_id` | `system_id` | API Token 主键 | `backend_service` | `not_input` | `detail_readonly` | no | `workspace + token` | UUIDv7 | Token 创建接口 | server_retry_on_collision | ACC-ID-001 |
| IDENT-002 | `page_id` | `system_id` | 页面主键 | `backend_service` | `not_input` | `detail_readonly` | no | `workspace + page` | UUID | 页面服务 | existing_entity_only | ACC-ID-002 |
| IDENT-003 | `mcp_document_id` | `external_reference` | MCP `search/fetch` 使用的文档或分块引用标识 | `backend_service` | `not_input` | `tool_result_only` | no | `workspace + source + chunk` | `page:{pageId}:chunk:{chunkIndex}` | 检索编排层 | deterministic_regeneration | ACC-ID-003 |
| IDENT-004 | `scope_code` | `business_code` | Token 可调用能力集合 | `backend_service` | `not_input` | `detail_readonly` | no | `workspace` | 枚举值，如 `knowledge.read`、`knowledge.write` | Token Scope 配置 | reject_unknown_scope | ACC-ID-004 |

规则说明：

1. 普通创建流程不得要求手输 `system_id`；所有 `system_id` 默认由后端生成并只读展示。
2. `mcp_document_id` 不是业务主键，只是对外协议层的稳定引用，允许根据 `pageId + chunkIndex` 确定性生成。
3. `scope_code` 首期仅开放只读枚举，不允许自由输入自定义 scope。

## 现状审计（As-Is）

### 现有页面/交互盘点

1. 现有设置页已经存在 `account/api-keys`、`api-keys`、`ai/mcp`、`audit` 等入口或预留。
2. 前端 `ai/mcp` 页面已展示 `/mcp` 地址与工具清单，但当前开源代码没有可证明可用的服务端实现。

### 现有接口盘点

1. 已有 Token 管理接口：个人与工作区 `integration-keys/*`。
2. 已有页面读取接口：`POST /pages/info`，支持 Markdown/HTML。
3. 已有全文检索接口：`POST /search`。
4. 已有导出接口：`POST /pages/export`、`POST /spaces/export`。
5. 已有审计接口：`POST /audit-events/list`。

### 现有数据表盘点

1. `pages` 已维护 `text_content` 与 `tsv`。
2. `page_embeddings` 已存在 chunk 维度字段。
3. `sc_api_tokens`、`sc_api_token_events` 已存在。
4. `sc_audit_events` 与 retention 相关表已存在。

### 现有权限与埋点盘点

1. 页面、附件、评论均通过现有 `PageAccessService` 或空间能力工厂做权限校验。
2. Token 创建与撤销已写入审计。
3. 外部 AI 调用尚未形成独立的工具级审计字段与限流策略。

## 改造策略确认闸门

- current_stage：production
- strategy：hybrid
- user_confirmation：confirmed
- 决策理由与回退约束：
  - 已有生产可用的 REST、Token、Audit、Search、Page 服务，应采用 `migrate + thin adapter`，而非 `replace`
  - 首期对外仅新增只读 MCP 能力，不替换现有用户端搜索与阅读体验
  - 任何异常均可通过关闭 `workspace.settings.ai.mcp` 和撤销 Token 快速回退

## 能力复用与重复建设审查

- existing_scan：
  - 页面读取：复用现有 `PageService` 与 `PageAccessService`
  - 搜索：复用现有 FTS 与向量表结构，新增检索编排
  - Token：复用现有 `IntegrationTokenService`
  - Audit：复用现有 `AuditLogService`
- build_vs_reuse：extend
- non_reuse_reason（若 new_build 必填）：不适用
- consolidation_plan：
  - 不新建第二套知识库或 CMS
  - 协议层新增 MCP 模块，但查询与权限判断下沉复用现有领域服务
  - 后续写工具开放时，依然复用既有 Page/Comment/Space 服务，不在 MCP 内重写业务逻辑

## 权限矩阵

| 资源 | 成员 | Admin/Owner | 外部 AI Client |
| --- | --- | --- | --- |
| 个人 Token 创建 | 允许，受 `restrictToAdmins` 影响 | 允许 | 不适用 |
| 工作区 Token 管理 | 不允许 | 允许 | 不适用 |
| 只读 MCP `search/fetch` | 允许，但仅限本人可见内容 | 允许 | 通过用户 Token 继承发起人权限 |
| 写工具 | 首期不开放 | 首期不开放 | 首期不开放 |
| MCP 开关 | 不允许 | 允许 | 不适用 |
| 审计查看 | 不允许 | 允许 | 不适用 |

## 跨模块联动规则与阻断矩阵

| rule_id | 规则名称 | source_of_truth | related_entities | trigger_action | block_condition | frontend_surface | backend_guard | data_constraint | error_code | user_copy | recovery_action | acceptance_case_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LINK-001 | MCP 功能总开关约束 | `/settings/ai/mcp` + workspace settings | workspace、token、mcp_session | 外部 AI 调用 `/mcp` | 工作区 `mcpEnabled=false` | MCP 设置页开关状态；Token 页提示说明 | MCP 入口统一校验工作区开关 | 关闭时不允许工具执行 | `MCP_DISABLED` | 当前工作区未开启 MCP | 由管理员在设置页开启 | ACC-LINK-001 |
| LINK-002 | Token Scope 阻断 | Token scope 配置 | sc_api_tokens、tool_call | 调用不在授权范围的工具 | token scope 不包含目标工具所需 scope | Token 页说明受限能力 | 工具执行前二次校验 scope | scope 不匹配直接拒绝 | `MCP_SCOPE_DENIED` | 当前 Token 无权调用该工具 | 重新创建更高权限 Token 或改用只读工具 | ACC-LINK-002 |
| LINK-003 | 页面 ACL 阻断 | PageAccessService | page、space、user、search_result | `search` 或 `fetch` 命中目标页面 | 页面或空间对该用户无查看权限 | AI 客户端只看到结果缺失，不应泄露隐含对象 | 服务端在检索后与抓取前都做 ACL 过滤 | 不可泄露 pageId 对应正文 | `MCP_PAGE_FORBIDDEN` | 目标文档不可访问 | 由管理员调整空间/页面权限 | ACC-LINK-003 |

## 领域边界与服务拆分

| domain_id | domain_goal | primary_entities | frontend_routes | backend_router | backend_service | allowed_commands | read_models | out_of_scope | split_trigger | permission_scope | acceptance_case_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DOMAIN-MCP-GATEWAY | 提供协议适配与工具注册 | mcp_session、tool_call | `/settings/ai/mcp` | `mcpRouter` | `mcpGatewayService` | register_tool、call_search、call_fetch | tool_manifest、session_context | 页面写入逻辑 | 当写工具上线时，必须拆分只读/写入 handler | `knowledge.read:*` | ACC-DOMAIN-001 |
| DOMAIN-KNOWLEDGE-RETRIEVAL | 提供权限感知的检索与正文抓取 | page、chunk、embedding | 无新增用户页 | `knowledgeRetrievalRouter` | `knowledgeRetrievalService` | search_content、fetch_content | retrieval_result、page_markdown | Token 管理 | 当接入外部来源或多源知识时，拆分索引子域 | `knowledge.read:search/fetch` | ACC-DOMAIN-002 |
| DOMAIN-TOKEN-GOVERNANCE | 管理 Token、scope、最近使用信息 | sc_api_tokens、sc_api_token_events | `/settings/account/api-keys`、`/settings/api-keys` | `integrationTokenRouter` | `integrationTokenService` | create_token、revoke_token、list_token | token_list、token_usage | 检索算法 | 当 OAuth 上线时拆为本地 token 与 oauth authz 两子域 | `token.manage:*` | ACC-DOMAIN-003 |
| DOMAIN-AUDIT-COMPLIANCE | 记录与查询审计 | sc_audit_events | `/settings/audit` | `auditRouter` | `auditLogService` | log_event、list_event | audit_timeline | 内容检索与正文抓取 | 当需要实时告警时再拆监控子域 | `audit.read` | ACC-DOMAIN-004 |

## 改造影响矩阵与灰度切换

| impact_id | 变更类型 | 现状行为（As-Is） | 目标行为（To-Be） | 影响页面/交互 | 影响接口 | 影响数据表 | 影响权限点 | 灰度开关/维度 | 回滚动作 | 回归用例ID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IM-001 | 新协议入口 | 前端有 `/mcp` 文案，无实际服务 | 新增可用 remote MCP 入口 | `ai/mcp` 文案从“预留”变为“可连接” | `/mcp` | 无或新增轻量元数据 | 只读工具权限 | workspace 级 `mcpEnabled` | 关闭开关并返回不可用提示 | TC-001 |
| IM-002 | Token 语义增强 | Token 仅有有效/无效语义 | Token 增加 scope 语义与用途说明 | Token 创建弹窗和详情说明 | `integration-keys/*` | `sc_api_tokens` | Token 创建/调用权限 | workspace 级 restrict + scope | 回退为统一只读 scope | TC-002 |
| IM-003 | 检索能力增强 | 仅 page-level FTS | hybrid retrieval + ACL 过滤 | 无新增用户页 | `/search` 内部复用或新增 retrieval 服务 | `page_embeddings` | 页面查看权限 | workspace 级 `aiSearch` | 退回纯 FTS | TC-003 |
| IM-004 | 审计增强 | 仅 Token CRUD 审计明显 | 增加 MCP 工具调用留痕 | `/settings/audit` 可见更多事件 | `/audit-events/list` | 复用审计表 | 审计查看权限 | 管理员灰度开放 | 仅保留 Token 事件 | TC-004 |

灰度策略：

1. Wave 1：仅 Owner/Admin 工作区内测，启用只读 `search/fetch`。
2. Wave 1.1：扩大到个人知识库场景，允许普通成员创建只读 Token。
3. Wave 2：补 hybrid retrieval 与监控阈值。

回滚策略：

1. 关闭 `mcpEnabled`，使 `/mcp` 统一返回关闭态。
2. 批量撤销异常 Token。
3. 将检索策略回退为纯 FTS，不影响现有页面搜索。
4. 保留审计与调用日志用于事后排查。

## 验收标准

### 功能验收

1. 外部 AI 客户端可通过 Bearer Token 连接 `/mcp` 并成功调用 `search`、`fetch`。
2. `fetch` 返回 Markdown 正文和基本元数据，不泄露无权限页面内容。
3. Token 撤销后旧 Token 调用立即失败。

### 接口验收

1. `search` 支持 query，返回结果列表与稳定 `id`。
2. `fetch` 支持基于 `id` 抓取正文。
3. 所有错误返回稳定错误码，便于外部 AI 客户端识别。

### 回归验收

1. 现有页面查看、搜索、导出、Token CRUD 不发生行为回归。
2. `mcpEnabled=false` 时不会影响现有 Web 用户。
3. 工作区与页面权限模型保持一致，不出现越权读取。

## 修改日志

- 2026-04-08 13:46:11 UTC+8：整理用户诉求与现有代码能力，形成首版 PRD
- 2026-04-26 UTC+8：补充图片支持（P1 附件 URL、P2 内联 content block）；明确非目标（页面截图、CLI 工具、服务端 OCR）；接入协议确认为 remote MCP，不做 CLI
