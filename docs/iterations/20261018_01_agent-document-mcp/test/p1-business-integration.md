---
file: docs/iterations/20261018_01_agent-document-mcp/test/p1-business-integration.md
description: P1 工具、管理界面、配额与性能的本地验收证据。
created_at: 2026-10-19 11:56:00 Asia/Shanghai
updated_at: 2026-10-19 14:27:15 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 当前候选代码、已确认 PRD/SDD、p1-jest-results.json 和 p1-performance.json
applies_to: [test, implementation, server, admin-web]
disclaimer: 文档可能更新，仅供参考；当前代码、产品及原始测试结果优先，本地通过不代表生产发布。
---

# P1 正式业务接入与验收

P0/P1（AC-01～AC-20）已通过当前候选工作树的本地验收。未部署，四份追加迁移仅在隔离数据库执行，未应用业务库。P2 与公开放行不在本轮完成范围。

## 交付内容

- 11 个工具：search、fetch、get_page、list_pages、list_spaces、get_edit_context、edit_page、update_page_metadata、create_page、create_folder、get_operation。按 OAuth scope 过滤发现，逐次检查真实 ACL；旧 API key 保留原四工具。
- 编辑支持受控 Markdown、原子批量、预览、签名分页、版本冲突、文档互斥、幂等和持久化确认。复杂节点拒绝修改；预览不创建写入操作；15 秒未完成返回可查询的 pending。
- 用户连接列表、详情、缩权、撤销与活动；管理员策略、限额、授权时长和审计。菜单、直接路由和后端权限一致。写操作具备 CSRF、版本校验、防重复提交及失败恢复。
- PostgreSQL 原子分钟/日额度、工作区聚合、并发额度和幂等预留/结算。无变化释放日额度；重试不重复消耗写额度。新工作区默认关闭 Agent 写入。

## 验收映射

| 验收 | 实现和实际证据 |
|---|---|
| AC-01～08、18 | 本轮包含 P0 全回归：真实 OAuth、ACL 矩阵、跨节点互斥、旧版本、重复提交、失败恢复、结构保护及完整应用历史恢复；见 p1-jest-results.json 和 P0 读取矩阵 |
| AC-09 | DocumentCommandService 创建事务；父目录删除、跨空间移动、成员撤权竞争均拒绝且无孤立页；完整浏览器确认新文档出现在侧栏且正文正常显示 |
| AC-10 | DocumentToolsService、KnowledgeRetrievalService；11 工具 Schema 快照、scope 发现、旧四工具兼容和成功/拒绝请求 |
| AC-11 | 候选修改与 Markdown 适配器；预览不修改 Y.Doc、不产生操作，预览版本变更后正式写冲突 |
| AC-12 | 签名游标绑定 grant/空间/文档版本；分页、伪造、版本变化拒绝；截断和保护标志 |
| AC-13 | 完整应用浏览器：列表/详情/活动直接打开与刷新、缩权、撤销取消/确认、重复保护、断网重试、375px 手机界面 |
| AC-14 | 用户仅看自身连接；成员菜单隐藏且策略/审计路由和 API 拒绝；他人连接 404；CSRF 失败拒绝 |
| AC-15 | 即时令牌和刷新拒绝，沿用 P0 授权屏障和撤权竞争；缩权版本 CAS |
| AC-16 | 操作审计包含应用、用户、grant、文档、状态及前后版本；创建补齐提交快照；不返回正文、令牌、差异和编辑凭据 |
| AC-17 | 分钟额度并发临界、preview 双额度、日预留/释放、重复结算、grant/workspace 并发及聚合、默认关闭、入口 429、策略读写及切换时区不重置额度 |
| AC-19 | 旧连接、延迟写入、失效租约、恢复草稿和基础设施异常的 P0 回归保持通过 |
| AC-20 | 两个 HTTP 节点、3 用户、2 注册应用、10 并发客户端、50 次真实持久化写入；超 15 秒 pending 后一次提交测试 |

## 运行与性能

完整回归 9 组、118 项通过，1 份工具 Schema 快照通过。前后端生产构建、客户端类型检查、相关 ESLint、迁移顺序、ProseMirror 单例、实时部署配置和 diff 空白检查通过。构建输出含既有 Nx editor-ext flaky task 提示，但本轮构建退出成功。

环境：Apple M3 Pro / 11 核、Node 22.23.3、隔离 PostgreSQL 16.14（fsync/synchronous_commit 开启）、Redis 7.4.4。两个协议实现分别为原生 Fetch JSON-RPC 和 MCP SDK StreamableHTTP。每文档约 99KB，每次写入含 5 项操作，使用默认限额。

| 路径 | 样本 | P95 | 门槛 |
|---|---:|---:|---:|
| 读取 | 50 | 168.3 ms | 2000 ms |
| 预览 | 50 | 493.9 ms | 2000 ms |
| 提交 | 50 | 696.3 ms | 5000 ms |

50/50 次写入成功（100%），所有日额度预留均完成结算。以上仅是当前机器、当前数据规模下的本地测量。

原始证据：[完整结果](p1-jest-results.json)、[运行环境](p1-runtime.json)、[性能分布](p1-performance.json)。浏览器证据：[手机撤销](p1-connection-revoked-mobile.png)、[管理员审计](p1-admin-audit.png)、[创建后侧栏](p1-created-sidebar.png)。单元/契约验证、真实数据库多节点集成、完整应用浏览器三个层次分别覆盖，未以原型替代应用验收。

## 实现细化及限制

1. 沿用 P0 授权屏障，配额短事务采用工作区 advisory lock，保守串行化工作区额度变更；文档 gate/fence 继续负责文档互斥。此实现通过本地负载门槛，更大规模跨工作区/跨机器负载留待公开放行验证。
2. 日额度切换时区保留当前桶及计数，延伸到新时区完整日边界，不能借切换时区清零。管理策略 JSON 显式经 text 转 jsonb，回归覆盖保存/读回，防止驱动二次编码后回落默认限额。
3. 单 grant 入口另有 60 请求/秒保护，业务分钟/日额度独立；超限提供等待时间。恢复任务按工作区每批清理最多 5000 条过期一小时的非日桶；日预留关联记录保留。
4. get_page/fetch 的 snapshot_revision 是检索快照哈希，不是编辑资格；编辑必须获取 get_edit_context 的版本与区块引用。分页绑定授权和请求条件，目录分页受 ACL 筛选可返回短页并继续下一游标。
5. 客户端登记复用受控 /api/agent-oauth/clients 接口，未另建 /api/agent-clients。公开开发者登记、支持矩阵与运维发布属于 P2。
6. 用户已接受以两个独立协议客户端完成本地试用；真实 Codex OAuth/MCP 另见 [Codex 报告](p1-codex-integration.md)。没有验证第二个真实产品、模型自主规划或 14 天观察，也未向当前桌面永久添加连接。
7. 本轮原始 P0 JSON 曾被中间回归覆盖；当前 P0+P1 的最终证据以 p1-jest-results.json 为准，旧 99 项报告只表示上一轮结果。当前代码仍为未提交工作树，不是已发布版本。

## 复现

使用 Node 22，设置 P1_ACCEPTANCE=true 与 P0_PG_BIN、P0_REDIS_BIN、P0_OAUTH_MODULE 后运行 apps/server/test/agent-mcp-p0/run.mjs。测试自行创建并清理临时数据库与 Redis。真实 Codex 单独设置 P1_CODEX_PROBE=true。不得将测试变量指向业务环境。

## P2 准备期间的复验

P2 新增策略关闭竞争用例后，P1 模式完整应用回归更新为 9 组 119 项和 1 份 Schema 快照通过；本页 118 项及性能表为前一轮交付记录，最新原始结果以 p1-jest-results.json / p1-performance.json 为准。P2 边界见 [准备记录](p2-readiness.md)。
