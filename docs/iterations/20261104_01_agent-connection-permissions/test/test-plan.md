---
file: docs/iterations/20261104_01_agent-connection-permissions/test/test-plan.md
description: 验收与回归计划
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 14:39:39 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# 测试计划

| 测试 | 验收 |
|---|---|
| 真豆包：真实服务注册→浏览器确认→只读/写 scope→发现→新建测试文档、编辑、读回→缩权与撤销拒绝；取消/过期/回调失败 | AC01/04/05 |
| 真 Codex：预登记原路径及动态注册若客户端支持；完整授权、编辑读回和撤销；记录版本 | AC02 |
| API token：新建默认只读、选空间、按权限编辑、一次展示、超时不重放明文、缩权、升权、撤销/过期、旧令牌原行为 | AC03/05 |
| DCR：非法回调、公开 URL SSRF、超限/限流、伪造 client、重复参数、PKCE/resource/refresh 重放 | AC07 |
| 两工作区、两个用户、空间对象 ACL、成员停用、策略关闭、逐对象越权和伪造 ID | AC05 |
| 两连接并发和事务屏障：撤销/缩权/策略关与最终提交的先后顺序；并发修改 version、幂等重放和故障恢复 | AC04–06 |
| 协作、Y.Doc、历史、已有 API 和客户端回归；生产数据库和 Redis 实际集成；新迁移顺序、安全、备份和恢复两个 workspace + Y.Doc | AC06/08 |

证据层级分别记录静态/单测、真实数据库集成、浏览器、真实客户端和部署环境；不得将 mock 测试写成真实端到端。实现者记录命令、版本、候选提交、预期/实际、失败分类与测试数据清理。
