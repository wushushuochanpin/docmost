---
file: docs/iterations/20261104_01_agent-connection-permissions/sdd/SDD.md
description: 认证、授权、数据、安全和迁移设计
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 14:39:39 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# SDD：Agent 接入与权限生命周期

状态：设计草稿；需结合 [PRD](../prd/PRD.md)、[交互合同](../design/screen-state-inventory.md) 审阅。既有依赖：`core/agent-oauth` 的注册、grant、token family；`core/integration-token`；`core/mcp`；`core/document-command` 现有写入屏障和 Y.Doc journal。保留现有技术栈；禁止平行写引擎。

## 架构与职责
- OAuth 适配层提供资源/授权服务器元数据、受限动态注册、授权码+PKCE、用户同意和 token/refresh/revoke；注册客户端不是资源授权。
- API token 适配层生成独立 MCP 令牌，存 hash、类型、范围及生命周期；兼容旧 token，不改旧 JWT 或为其新增隐式写权限。
- 共用 actor 授权门面：把 OAuth grant 和新 MCP token 映射成 `actor{kind, credential_id, workspace_id, user_id, scopes, space_ids, version}`，任何来源仅通过共用文档命令服务写入。不能仅构造伪 OAuth grant 或绕过现有 grant 查询；重构屏障使两类凭据各自查权并复用提交路径。
- UI 管理聚合两个来源，拥有各自实际 ID 和类型；服务端按类型路由，禁止通过猜 ID 跨租户查询或变更。保留已注册管理员客户端和旧 OAuth grant。

## DCR 协议合同（AC01/02/07）
在 OAuth 元数据发布 `registration_endpoint`，新增公共 POST 注册端点；接受 `redirect_uris`、`client_name`、`grant_types`、`response_types`、`token_endpoint_auth_method`、可选 `scope`；只支持 public + `none`、authorization_code/refresh_token、code；有效请求返回 201 和新 client_id、对应已验证元数据；非法请求按 OAuth DCR 返回 400、限流 429，关闭时不可注册。以严格 schema 拒绝未知危险行为、数组/字符串长度及数量上限；限制 IP/全局速率、总注册量、过期清理与管理停用，不能将 client_name 当验证身份。不得自动访问 client_uri/logo_uri 等外部 URL，防 SSRF；客户端不默认获得任何租户权限。回调允许 HTTPS 或仅 `127.0.0.1`/`[::1]` loopback HTTP，精确路径匹配、仅允许动态端口规则；禁止通配、userinfo、片段、localhost，防开放重定向。沿用 state、PKCE S256、resource 精确绑定、单次 code、refresh 旋转和重放防护。豆包探针请求包含 loopback 回调及 `scope=knowledge.read pages.edit`，实际 scope/回调以真实请求验证，不硬编码厂商名字。注册请求的权限仅是允许申请上限，最终由登录用户同意、ACL/策略共同约束。验证兼容客户端可能不支持部分 scope 或 `resource` 等情况，不能为求绿弱化校验。

## 数据模型与 API（AC03–05）
- 在原令牌上新增可区分 `legacy` / `mcp_scoped` 的显式类型和绑定空间、权限、version；用独立关联表或同等约束的数组持久化，外键带 workspace 语义；给 owner/workspace/status 列表建立索引。旧行仅标 legacy；严禁空 scope 解释成新写权限。新令牌仅鉴权 MCP；现有其他 HTTP 路径拒绝新类型，避免意外扩权。
- 租户隔离：每次从服务端凭据解析 user、workspace，禁止信任客户端传入 owner。每次工具发现和调用交叉检查范围、当前 ACL、用户状态和策略。写事务内锁定凭据/授权记录、版本和策略后再检查并提交 journal，和撤销/缩权采用相同锁序；配置写先持锁时后续提交失败，写先持锁时允许完成。不能在认证通过后只用缓存 scope。
- 连接管理接口语义：创建 MCP 令牌 `POST /api/integration-keys` 按既有约定扩展或增设独立路由，输入 name、space_ids、scopes、expires_at、request_id；返回 id、masked_prefix、一次性 token。服务端用创建请求幂等记录处理重试，不重放明文；若响应丢失返回创建结果未知及安全恢复流程，撤销已创建凭据后重建，不返回或再次储存明文。列表按 workspace/owner 过滤分页返回 credential_type、id、name、space_ids、scopes、version、status、created_at、expires_at、last_used_at；无原文。详情与变更使用类型+ID；修改输入 scope/space/expected_version，成功返回最新版本，冲突 409，未授权 403，已撤销/过期 409，验证错误 400；撤销幂等，返回终态。具体最终路由应依据现有 controller 命名固定并由 OpenAPI 与测试覆盖。
- OAuth 缩权允许当前 grant 子集，事务版本化并同步约束既有 access/refresh；升权不能靠修改 grant，需新授权码流程；新授权未完成前旧连接不扩大。API 升权通过登录用户确认和 CSRF 防护，服务端核查 ACL/策略；同一 token 权限变更实时生效，审计前后范围；不得借助 token 自行升权。
- 权限集 `knowledge.read`、`folders.create`、`pages.create`、`pages.edit`；创建/编辑均依赖 read，默认 read，空间非空且仅包含当前用户有权访问的空间；无空间 ACL 则拒绝。文档操作仍逐对象判断实际 ACL；工作区全局禁写优先。

## 安全、隐私、运行与质量
审计注册、创建、缩权、升权、撤销、策略变更和写入结果，记录 actor、credential id、workspace、范围差异、时间、结果、request_id；不记录 token、code、cookie、Authorization 或文档正文。凭据只存不可逆 hash；不把秘密放 URL、前端持久化、日志。注册造成的资源占用限额与过期清理须监控；分别统计注册失败、授权失败、撤销冲突、401/403/429 与写入冲突，不包含敏感信息。接口分页（默认 20、上限 100），注册和认证限流；未授权/过期/撤销/禁写/冲突有可恢复错误。

## 迁移、上线和回退（AC08）
先检查基线最新 migration，仅追加唯一且更晚的 sortable 时间戳文件，安全默认 legacy，无破坏旧数据，执行 `pnpm run security:migration-order`。采用默认关闭的 DCR 和 MCP scoped-token 写入独立开关，先隔离环境/指定工作区，再逐步上线；旧授权与令牌继续工作。数据库角色、RLS、迁移、备份或部署变动必须 `pnpm run test:backup`，在一次性 PostgreSQL 16 + Redis 中验证恢复、两个 workspace 和 Y.Doc。变更合并前完整安全/并发/客户端回归；生产需要既有备份 job 门禁与部署后真实排队备份、本地/COS 校验；CI 不新增独立 runner，遵守 AGENTS.md 共享 ARC 规则。
回退先关闭新增注册及新 token 写入、阻止新授权并排空进行中写操作；验证所有已提交 journal 持久化并备份，撤销或暂停本次新凭据，再视旧版是否识别 schema 与 journal 决定回退镜像；不执行破坏性 down migration。旧版若不能安全处理新数据则前滚修复，不能声称单纯关开关即可回退。详见发布文档。

## 接受映射
AC01/02→DCR、OAuth 客户端 E2E；AC03→令牌服务、管理 UI；AC04→grant 生命周期；AC05→所有调用及事务屏障；AC06→document-command/协作回归；AC07→DCR 安全负例；AC08→迁移、备份、灰度回滚。所有验证必须记录真实环境、版本、候选提交及证据；模拟服务不能替代真实客户端。
