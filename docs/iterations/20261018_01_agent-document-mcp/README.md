---
file: docs/iterations/20261018_01_agent-document-mcp/README.md
description: PRD与完整SDD的迭代入口及当前状态。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-19 14:47:53 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [iteration]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 第三方 Agent 文档 MCP

当前状态：PRD approved；SDD approved；P0/P1 本地验收已通过，P2 与公开发布未放行。迭代模式：existing_system_iteration；档位：large。

用户已确认主动授权第三方Agent、首期人机互斥，以及独立实现、不使用官方付费功能。方案扩展现有MCP与Yjs协作体系，不新增同步引擎。已实现正式业务接入，新增默认关闭的 OAuth 入口和四份未应用业务库的迁移；未部署。

1. [完整SDD](sdd/SDD.md)：技术决策、OAuth、互斥、版本、幂等和持久化。
2. [已确认PRD](prd/PRD.md)与[24项验收](prd/acceptance-criteria.md)。
3. [接口合同](sdd/api-contract.md)与[数据模型](sdd/data-model.md)。
4. [施工分解](implementation/task-breakdown.md)、[验收映射](implementation/acceptance-to-code-map.md)、[测试计划](test/test-plan.md)。
5. [发布与回退](release/rollout-plan.md)、[验证记录](test/verification-evidence.md)。
6. [交互合同](design/interaction-contract.md)与[原型状态](design/prototype-authority.md)。
7. [机器可读索引](machine/iteration_struct.yaml)。

9 组 118 项及工具 Schema 快照通过。工具集、连接/权限界面、配额与性能已完成本地验收；未部署，未提交 Git。

最新进展：[P1 业务接入报告](test/p1-business-integration.md)、[真实 Codex 接入试用](test/p1-codex-integration.md)。

P2 最新进展：[部署前准备记录](test/p2-readiness.md)、[公开接入指南](public/README.md)、[运维手册](release/p2-operations.md)、[部署后门槛](release/p2-deployment-gates.md)。文档、示例和本地客户端验证已完成；P2 公开放行仍未通过，未部署。

P2 留存清理与监控本地补充见 [验收记录](test/p2-retention-observability.md)。部署与公开放行仍未执行。
