---
file: docs/iterations/20261018_01_agent-document-mcp/implementation/acceptance-to-code-map.md
description: 验收、技术设计、责任模块与测试用例的全量映射。
created_at: 2026-10-18 16:58:00 Asia/Shanghai
updated_at: 2026-10-19 14:23:27 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [implementation]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 验收到实现映射

P0/P1 本地验收已通过，P2 未放行；具体完成项和未执行项以 [业务接入报告](../test/p1-business-integration.md) 为准；下表保留需求到责任模块的映射，不表示全部通过。

| 验收 | 技术设计 | 实现责任 | 用例 |
|---|---|---|---|
| AC-01 OAuth授权 | [方案](../sdd/oauth.md) | 后端+测试 | TC-01 |
| AC-02 资源隔离 | [方案](../sdd/permission-security.md) | 后端+测试 | TC-02 |
| AC-03 文档互斥 | [方案](../sdd/document-consistency.md) | 后端+协作 | TC-03 |
| AC-04 版本校验 | [方案](../sdd/document-consistency.md) | 后端+协作 | TC-04 |
| AC-05 幂等 | [方案](../sdd/idempotency-persistence.md) | 后端+测试 | TC-05 |
| AC-06 持久化 | [方案](../sdd/idempotency-persistence.md) | 后端+协作 | TC-06 |
| AC-07 恢复 | [方案](../sdd/state-machine.md) | 后端+协作 | TC-07 |
| AC-08 结构保护 | [方案](../sdd/document-consistency.md) | 后端+协作 | TC-08 |
| AC-09 创建 | [方案](../sdd/data-model.md) | 后端+测试 | TC-09 |
| AC-10 工具契约 | [方案](../sdd/api-contract.md) | 后端+测试 | TC-10 |
| AC-11 预览 | [方案](../sdd/api-contract.md) | 后端+测试 | TC-11 |
| AC-12 分页 | [方案](../sdd/document-consistency.md) | 后端+测试 | TC-12 |
| AC-13 连接UI | [方案](../sdd/design-to-code-contract.md) | 前端+后端 | TC-13 |
| AC-14 权限UI | [方案](../sdd/permission-security.md) | 前端+后端 | TC-14 |
| AC-15 撤销竞争 | [方案](../sdd/oauth.md) | 后端+测试 | TC-15 |
| AC-16 审计 | [方案](../sdd/permission-security.md) | 后端+测试 | TC-16 |
| AC-17 配额 | [方案](../sdd/performance.md) | 后端+测试 | TC-17 |
| AC-18 历史 | [方案](../sdd/idempotency-persistence.md) | 后端+协作 | TC-18 |
| AC-19 旧客户端 | [方案](../sdd/migration.md) | 前端+后端 | TC-19 |
| AC-20 性能 | [方案](../sdd/performance.md) | 后端+测试 | TC-20 |
| AC-21 客户端 | [方案](../sdd/oauth.md) | 后端+测试 | TC-21 |
| AC-22 接入 | [方案](../sdd/api-contract.md) | 后端+测试 | TC-22 |
| AC-23 停用 | [方案](../sdd/migration.md) | 后端+测试 | TC-23 |
| AC-24 公开放行 | [方案](../sdd/performance.md) | 后端+测试 | TC-24 |

AC-21～24 本轮落点为 public/ 文档、scripts/mcp/client-example.mjs、scripts/mcp/diagnose.mjs、codex-probe.ts 与 p2-clients.ts/p2-operations.ts；具体本地证据和未完成项见 [P2 准备记录](../test/p2-readiness.md)。
