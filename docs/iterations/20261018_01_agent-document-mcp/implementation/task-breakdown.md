---
file: docs/iterations/20261018_01_agent-document-mcp/implementation/task-breakdown.md
description: 独立MCP的施工顺序、依赖与停止条件。
created_at: 2026-10-18 16:58:00 Asia/Shanghai
updated_at: 2026-10-19 14:23:27 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [implementation]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 实施计划

用户已确认 SDD；T01～T05 已完成 P0/P1 本地验收。T06 公开接入、客户端支持矩阵及长期观察仍按 P2 完成；暂不部署。

| 顺序 | 工作项 | 依赖及完成条件 |
|---|---|---|
| T01 | 固化旧MCP契约、所有writer/ACL入口清单；Hocuspocus4 hooks及OAuth库PoC | 在隔离测试工程验证，不能上线写；证明先持久化再apply及Node22兼容 |
| T02 | 追加数据模型、事务接口、RLS、gate/permit/fence/journal；普通编辑路径接入 | T01；跨节点人工/Agent互斥和旧owner拒绝成立，现有编辑回归通过 |
| T03 | OAuth发现、预注册、授权码/刷新/撤销与grant策略 | T01；真实业务AC-01/02/15安全集成通过；库精确版本及许可证记录 |
| T04 | command service、11工具、候选修改、版本、幂等、history/outbox与恢复worker | T02/T03；P0全部通过，不能以临时HTTP写替代可靠事务 |
| T05 | 授权/连接/策略/审计页面、编辑许可及草稿恢复 | 可执行原型走查完成+T02/T03/T04接口稳定；P1全回归与性能试用 |
| T06 | 接入文档、两客户端认证、运维脚本、灰度与14天观察 | T05；P2全部通过后才开放外部用户 |

每项按可回退的小PR提交；默认开关关闭，不允许中间提交意外放开写权限。改造现有写入口是T02交付的一部分，不推迟到上线后。遇到无法阻止Hocuspocus旧消息、无法事务化ACL或无法恢复Y.Doc时暂停写入实现并修订方案，不以Redis锁/事件ack临时替代。

依赖决策：复用现有MCP SDK、Yjs、Hocuspocus、PG驱动及校验设施；OAuth 库固定 @node-oauth/oauth2-server 5.3.1（MIT），已验证 Node22、协议行为及锁文件；详细依赖与回退决定见业务接入报告。adapter隔离，停用新授权可回退；不得自行假定仓库manifest版本已在registry发布。无第二同步后端、编辑器或实时正文缓存。

T01证据：[P0技术验证报告](../test/p0-technical-validation.md)。固定版本库及数据库机制验证已完成；现有编辑、标题、复制、导入、批量移动及数据库写边界证据见业务接入报告。

本轮范围、实测结果和实现差异见 [正式业务接入报告](../test/p0-business-integration.md)。

P1 最终证据见 [P1 接入报告](../test/p1-business-integration.md)。

T06 本轮完成公开接入文档、SDK 可运行示例、Codex/SDK 本地协议验证、运维诊断与告警判定准备；生产接线、独立开发者、14 天观察和放行签署待执行，见 [P2 准备记录](../test/p2-readiness.md)。
