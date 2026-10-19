---
file: docs/iterations/20261018_01_agent-document-mcp/implementation/p0-writer-inventory.md
description: P0基线中的写入与权限入口清单及后续接入要求。
created_at: 2026-10-18 17:42:54 Asia/Shanghai
updated_at: 2026-10-18 18:13:24 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户确认的PRD及SDD、本轮本地P0探针与构建记录
applies_to: [server, test, implementation]
disclaimer: 文档可能更新，仅供参考；当前代码和真实测试结果优先。技术探针通过不等于应用集成或产品验收通过。
---

# 写入路径盘点（38d26266）

| 现有入口 | 风险 | 后续接入 |
|---|---|---|
| collaboration/extensions/persistence.extension.ts | debounce保存、JSON比较、容错日志不构成durable ack | gate/fence、checkpoint+journal、失败不确认 |
| collaboration/collaboration.gateway.ts、handler.ts | direct连接及自定义事件可绕过公开工具 | 共用DocumentCoordinator，不允许旧owner提交 |
| collaboration/extensions/redis-sync | Redis路由/所有权可能晚到 | PG owner_epoch权威，Redis续租/释放CAS |
| core/page/services/page.service.ts | create/update、复制/移动、导入/恢复等路径调用repo或直接updateTable | 全部复检ACL与gate，原子目录元信息，推进generation/revision |
| database/repos/page/page.repo.ts | updatePage、insertPage、批量及直接SQL底层 | 显式trx传递，禁止外层事务中另开连接 |
| core/page/page-access/page-access.service.ts及成员/组/空间权限路径 | 当前权限更新与Agent提交没有共同锁 | workspace_security_versions排他锁，统一排序 |
| core/editor-session | 原有按用户lease不能排斥其他用户Agent资格 | 人工permit与既有同用户策略并存，不能warn-only绕过 |
| core/mcp/mcp-gateway.service.ts | 旧API key空scope允许读取 | 保留四项读取契约，OAuth写入独立Bearer鉴权 |

以上是施工入口清单，不声称全部已改造。代码路径相对apps/server/src；正式T02需追踪服务及repo所有调用者，并以静态检查加真实入口集成测试证明没有遗漏。当前没有生产开关或路由将探针写入暴露给用户，因此本轮不存在部分切流。

## 本轮接入状态

Persistence、collaboration handler、PageService.create/update 已接入正式边界，数据库触发器覆盖权限变更与旧页面 SQL。非受管文档保持既有实时保存路径；受管文档禁用旧二进制回写。全量导入/复制/批量调用仍需端到端验证。详见 [接入报告](../test/p0-business-integration.md)。
