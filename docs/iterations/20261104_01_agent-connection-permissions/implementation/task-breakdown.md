---
file: docs/iterations/20261104_01_agent-connection-permissions/implementation/task-breakdown.md
description: 分片实施计划与门槛
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 14:39:39 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# 实施顺序

| phase | depends_on | 任务/acceptance | acceptance_gate | stop_before_next_if |
|---|---|---|---|---|
| P0 | 无 | 审阅 PRD/SDD、现状差异、S1–S8 交互与可执行原型；核实基线和测试环境 | 原型与权限合同确认；明确真实客户端版本 | 权限边界、原型或数据事实不清 |
| P1 | P0 | append-only migration，legacy 默认和 actor 门面，AC03/05 | 隔离数据库迁移、租户/旧令牌兼容、备份通过 | 旧令牌扩权或恢复失败 |
| P2 | P1 | API 令牌创建、一次展示、修改/撤销和事务屏障，AC03/05/06 | 正负权限、版本竞争、重放、协作回归通过 | 写一致性或撤销先后不确定 |
| P3 | P1 | 受限 DCR + OAuth 授权/缩权/升权，AC01/02/04/07 | 协议及安全负例通过，旧 Codex 保持兼容 | 注册可自动授权、开放重定向、未限定资源 |
| P4 | P2/P3 | 设置 UI 与错误恢复，真实豆包/Codex，AC01–05 | 真客户端授权、工具发现、读写/读回/撤销同一候选 | 只有 mock 或缺少真实授权证据 |
| P5 | P4 | CI、安全、备份、发布与回退演练 AC06–08 | 所有门禁及同提交证据通过 | 任一门禁未完成 |

每片先读现状与相关测试→实现→最小回归→记录真实结果→下一片。真实线上写测试只在明确授权的测试环境和测试文档；生产发布需遵循项目交付与备份门禁。
