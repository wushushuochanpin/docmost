---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/performance.md
description: 容量预算、配额算法与监控告警。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-18 16:56:10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 性能与运行预算

实际验收阈值以PRD AC-20为准；以下为工程预算，压测前必须记录机器、PG/Redis版本、文档体积及并发模型。编辑上下文每页最多100块/64KiB；大文档不向模型一次返回全文。候选生成移出数据库事务，事务目标p95<200ms；最终事务statement_timeout=5s、lock_timeout=1s。单次工具前台最多等待15s，之后查询；不能延长HTTP等待代替持久操作。

human journal每次入站有效Yjs update持久化后才确认，不能为降延迟提前ack。对相同页面串行，跨页面受控并行。测量1/10/50并发文档、典型与上限文档、人工突发输入，记录PG写放大、journal体积、event-loop延迟和保存p95/p99。超出预算先优化checkpoint批次和序列化，不削弱确认语义。压缩journal只清理已成功checkpoint的覆盖范围；监控replay尾长，避免无限重放。

配额：grant每分钟read60/write10/query30/preview10，创建100/日、修改500/日、并行2；workspace创建500/日、修改2000/日、并行10。日界按工作区配置时区，bucket_start落库；时区变化不重置当日用量，下一完整周期生效。固定分钟桶允许边界突发，另设短时入口保护。每日限额及并发槽PG原子预留，提交转used，拒绝释放一次，未知状态保留直到恢复；幂等重放不重复计写入/每日量，仍计请求查询速率。workspace与grant桶按固定排序上锁。Redis只能做提前拒绝缓存，不能放行绕过PG硬限额。

指标：oauth失败率/refresh重放、busy与version_conflict占比、pending年龄、恢复耗时、committed但live未同步数量、journal尾长/字节、owner fence拒绝、quota拒绝、DB事务延迟、outbox积压、审计缺失。业务指标不含原文/令牌，高基数ID进日志不做metric label。

告警：pending>60s立即任务告警；recovering持续>5min升级人工；任何committed缺少快照或结果、fence绕过、跨租户泄漏为P0停止新写；outbox最老>5min及checkpoint持续失败为P1。关闭开关只停止新操作，不抹掉运行中事实。提供按operation_id只读诊断和受审计恢复命令，禁止人工直接改status解锁。
