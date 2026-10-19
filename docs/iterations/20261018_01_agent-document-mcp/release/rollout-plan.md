---
file: docs/iterations/20261018_01_agent-document-mcp/release/rollout-plan.md
description: P0至P2灰度门槛与运行回退。
created_at: 2026-10-18 16:58:00 Asia/Shanghai
updated_at: 2026-10-19 14:23:27 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [release]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 发布与回退

状态not_started；无部署动作。功能开关分为oauth_enabled、agent_read_enabled、agent_write_enabled，按实例/工作区白名单生效；写开关关闭仍允许现有读取与本人历史结果查询。新workspace默认agent_write_enabled=false。

P0仅隔离环境：完成授权、互斥、版本、幂等、持久化、恢复与复杂内容保护，AC-01～08和18全部有证据。P1内部明确授权用户：3用户、2客户端、至少50次写入≥99%成功，AC-01～20通过；性能读取/预览P95≤2秒、提交P95≤5秒。P2经用户授权的公开第三方Agent：全部24项、两客户端支持矩阵、独立接入验证及14天观察，无未解决高严重度数据/授权问题。P3的并发人机协作、批量事务与更多写能力另行PRD，不在本轮放行。

出现跨租户泄漏、已确认内容丢失、重复创建、fence失效或授权撤销后仍提交，立即关闭新写并保留现场。维护人员先查operation/PG事实，恢复worker排除旧事务后重建live状态；不能直接删除锁键恢复服务。outbox可重试，持久化内容不可因通知失败回滚。

回退按照[迁移设计](../sdd/migration.md)执行：排空操作、checkpoint所有journal、排空协作连接且确认无未决状态，才允许旧版本。只关闭MCP不足以让不理解journal的旧程序安全接管。备份恢复、更换generation及令牌处置在隔离环境演练后执行。

| 风险 | 责任角色 | 放行证据 |
|---|---|---|
| hook时序与Yjs pending updates导致丢失 | 协作负责人 | 固定4.0.0故障测试及重启hash一致 |
| ACL路径漏锁或旧writer绕过gate | 后端负责人 | 全入口清单、并发屏障及静态检查 |
| journal写放大、恢复积压 | 运维+后端 | 容量报告、checkpoint报警与恢复时长 |
| 客户端OAuth发现差异 | 接入负责人 | 精确协议/客户端版本矩阵 |
| 原型未验证或草稿恢复不完整 | 前端负责人 | R01–R07走查与旧客户端恢复录屏 |
| 商业代码授权边界 | 项目负责人 | 无EE移植及新增依赖许可证记录 |

验收签署角色为产品、后端、协作、测试和运维；人员、日期、证据URL在实际执行后填写，不预签通过。

## P2 实现配置与准备更新

前文 oauth_enabled/agent_write_enabled 为设计概念；真实配置使用 AGENT_OAUTH_ENABLED 和工作区 agent_policies.enabled，没有名为 agent_read_enabled 的新增环境变量。只停新写应使用工作区策略，不能关闭 OAuth 总入口后声称读取不受影响。实际启停、诊断与回退步骤见 [P2 运维手册](p2-operations.md)，未部署项见 [部署后门槛](p2-deployment-gates.md)。
