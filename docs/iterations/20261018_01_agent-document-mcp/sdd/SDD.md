---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/SDD.md
description: 独立实现第三方Agent文档MCP的总体技术方案与设计导航。
created_at: 2026-10-18 16:51:24 Asia/Shanghai
updated_at: 2026-10-18 17:42:54 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 第三方 Agent 文档 MCP — SDD v1.0

状态：用户已确认PRD与SDD并授权P0技术验证；P0探针已实施，暂不部署。当前代码基线38d26266；迭代类型existing_system_iteration；技术栈沿用AGENTS.md。没有使用或移植Docmost商业MCP/OAuth模块。

## 1. 技术决策

| 决策 | 实现选择 | 对应验收 |
|---|---|---|
| D01 OAuth | 同源独立授权服务；授权码+S256 PKCE；不透明短期access token、轮换refresh token；PG存hash及grant | AC-01/02/15/21 |
| D02 文档互斥 | PostgreSQL文档门闩行+单调fence，多个人工许可与一个Agent资格互斥；Redis仅路由通知 | AC-03/07/19 |
| D03 权威状态 | 同一Yjs体系的二进制checkpoint+持久化update journal；先持久化后对外确认，content是物化视图 | AC-06/08/12 |
| D04 版本 | 文档generation+PG递增revision；所有正文、标题有效写入推进版本，token绑定内容摘要和schema版本 | AC-04/12 |
| D05 幂等 | PG唯一约束、规范请求hash、持久化operation；业务效果与committed同一事务 | AC-05/07 |
| D06 Agent提交 | 从权威状态构建隔离Y.Doc候选，原子保存，再同步现有Hocuspocus live doc；不先改live doc再等待保存 | AC-06/08/18 |
| D07 历史与副作用 | 同事务写前后恢复基线、操作结果、outbox；搜索/通知至少一次投递并去重 | AC-16/18/23 |
| D08 来源边界 | 公开标准、已授权社区代码、独立业务设计；不复制ee目录商业实现、不绕过许可证 | 用户新增约束 |

PRD：[需求正文](../prd/PRD.md)、[24项验收](../prd/acceptance-criteria.md)。交互：[产品交互合同](../design/interaction-contract.md)。

## 2. 阅读顺序

1. [architecture.md](architecture.md)：现状、模块、统一写路径与依赖。
2. [oauth.md](oauth.md)：OAuth发现、注册、授权、刷新和撤销。
3. [document-consistency.md](document-consistency.md)：互斥、版本、人工入站与Agent候选提交。
4. [idempotency-persistence.md](idempotency-persistence.md)：事务步骤、幂等、崩溃窗口及恢复。
5. [data-model.md](data-model.md)、[api-contract.md](api-contract.md)：表字段、约束和接口。
6. [state-machine.md](state-machine.md)、[permission-security.md](permission-security.md)。
7. [performance.md](performance.md)、[migration.md](migration.md)、[design-to-code-contract.md](design-to-code-contract.md)。
8. [施工顺序](../implementation/task-breakdown.md)、[验收映射](../implementation/acceptance-to-code-map.md)、[测试设计](../test/test-plan.md)、[发布与回退](../release/rollout-plan.md)。

## 3. 不变量

- I01：Agent写入必须来自有效OAuth grant，legacy API token或浏览器Cookie不能获得新增写权限。
- I02：任意用户有效人工许可存在时，没有Agent写资格；Agent资格存在时不发人工许可。
- I03：过期/失效的owner或Agent执行者不能持久化；判断来自PG锁内事实，非本地时间和Redis缓存。
- I04：公开committed必然对应可恢复的PG业务效果；响应丢失不会改变效果唯一性。
- I05：失败的候选修改不可进入live Y.Doc；Yjs事务不是数据库回滚机制。
- I06：读取编辑上下文与修改比较同一种revision；不能混用检索快照updatedAt或单独state vector。
- I07：缩权、撤销、ACL变化与提交串行化；缓存不提供最终写授权。
- I08：目录创建、内容、类型和操作结果一起成功；禁止半创建。

## 4. 范围和完整性

实现PRD首期11工具，不增加全文替换、删除、移动、分享、上传和后台自动化。人工间现有协作仍可多用户进行。增加update journal属于现有Y.Doc持久化扩展，不新增同步引擎或第二协作后端。成本是写路径、权限变更路径及协作确认语义需要贯通，不能伪装成仅增加MCP Controller。

后端设计可进入评审；前端可执行原型目前仍为planned，无低风险豁免。完整SDD给出接口、状态与组件合同，但视觉/交互定稿及前端施工前必须完成原型覆盖，不将文本设计称为已验证交接。此项不阻止本次文档交付。

## 5. 验证与责任

后端负责人负责OAuth、操作事务及ACL；协作负责人负责fence、journal和所有写入口；前端负责人负责许可与草稿恢复；测试负责人执行AC映射；运维负责人负责PG单主、Redis隔离、备份恢复。具体人员在开工时指定。

P0已验证Hocuspocus4.0.0消息接收器、Node22下OAuth5.3.1及PG事务故障模型，详见P0报告；真实协作拓扑、两种目标客户端与容量测量仍待执行。任一验证失败必须修订SDD后再开写入；不能降级跳过可靠性约束。

最新进展：[P0技术验证报告](../test/p0-technical-validation.md)。
