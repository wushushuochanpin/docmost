---
file: docs/iterations/20261104_01_agent-connection-permissions/release/README.md
description: 发布与回退合同
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 14:39:39 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# 发布与回退

默认关闭动态注册和 scoped-token 写入；先隔离数据环境验证，再授权工作区试点。发布前完成安全评审、迁移顺序、完整回归、生产备份 job 依赖；发布后执行真实队列备份并校验本地/COS、真实客户端读写与撤销，再接受部署身份。失败先关闭新注册和写入、排空写事务与 journal、验证备份并处置新凭据；只有确认旧版本理解数据库/持久化状态且完成回退演练才允许回滚，否则前滚。禁止更改已合并迁移或执行破坏性 down migration。
