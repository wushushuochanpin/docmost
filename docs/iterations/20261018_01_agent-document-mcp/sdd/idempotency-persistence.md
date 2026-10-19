---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/idempotency-persistence.md
description: 幂等唯一性、原子提交、保存确认及各崩溃窗口恢复。
created_at: 2026-10-18 16:51:24 Asia/Shanghai
updated_at: 2026-10-18 16:51:24 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 幂等与持久化确认

## 1. 请求登记

仅通过身份/基础参数校验的正式写入进入operation。唯一键(workspace,user,client,grant,tool,idempotency_key)；key≤128 ASCII，推荐UUID。先补齐默认值、UUID规范化、scope外的服务端身份后做确定性JSON编码，保留Markdown字节/空白、操作顺序，排除preview和trace；request_hash=SHA256(canonical payload)。重复key不能从不同工具互相查询，get_operation(key)须提供tool，operation_id不需tool。

事务INSERT ON CONFLICT取已存行：同hash返回原operation（包括处理中）；异hash返回IDEMPOTENCY_KEY_REUSED。不能覆盖旧body、旧expected_revision。preview不登记正式operation，不占key；正式提交绑定实际payload。无权限的重复调用同样拒绝，不直接返回历史正文。

登记时预分配page UUID（创建）、operation UUID，并存加密请求payload，key唯一约束在PG跨节点生效。内容最多256KiB，使用独立版本化数据加密密钥加密，日志不记明文。写请求15秒等待上限只影响HTTP等待；进程断线不取消operation。pending扫描器每2秒取可执行任务，claim用operation行锁SKIP LOCKED+attempt_epoch，不能仅依赖BullMQ唯一job。

## 2. 操作执行阶段

A. 事务登记operation=pending、预留日配额与并发槽；相同key不重复预留。基础配额不足不创建可执行任务。
B. claim→running，attempt_epoch+1；获取文档资格。DOCUMENT_BUSY/版本冲突明确记rejected并退还预留；不会后台等待人工结束后擅自执行。
C. 无数据库长事务地重建候选，期间续租。构建失败记failed/rejected，确认未产生效果才释放。
D. 最终原子提交Tcommit。
E. 事务结果确认后同步live并释放门闩；outbox后续驱动索引/通知。结果查询以PG为准。

## 3. Tcommit精确边界

所有步骤使用同一Kysely transaction对象，禁止repo忽略trx重新走连接池。

```text
BEGIN
  lock client FOR SHARE
  lock workspace_security FOR SHARE
  lock grant FOR SHARE; check user, grant, scope, space, policy, expiry
  lock quota buckets in sorted key order
  lock doc_gate(s) in sorted page UUID order FOR UPDATE
  lock operation FOR UPDATE; verify attempt_epoch and running/recovering ownership
  verify owner_epoch, agent_fence, lease expiry, active_operation_id
  lock target/parent pages; evaluate ACL with this trx
  verify generation + revision + content schema / parent constraints
  save history_before + binary recovery snapshot (existing page only)
  save pages.ydoc + content + text_content + title + actor
  advance revision/checkpoint_seq; compact covered journal range only
  save history_after + operation link
  change operation to committed with exact revision/result/committed_at
  convert quota reservation to usage (changed=false does not charge modified-day count)
  insert unique outbox events (operation_id,event_type)
COMMIT
```

创建：同事务新增pages、node_meta、目录位置、必要watcher及doc_gate；预分配ID不可变，重复执行不会新建第二页。为同父节点排序在父gate内计算position；根目录创建使用space结构锁，禁止根文件。若repo safeEnsureNodeMeta吞错，需新增严格事务版本，不能沿用该容错方法。

标题：不先调用现有PageService.update写标题再改状态；走相同事务和revision。批内正文操作全部一次提交。历史写失败必须回滚，因为PRD要求可恢复基线。审计事实和operation一起写，通用外部审计sink可通过outbox延迟，不影响提交事实存在。

PG配置synchronous_commit=on。成功保证以数据库已确认且配置的持久性边界为准；若使用自动故障切换，需同步复制且可靠主节点隔离才能承诺确认后无丢失。异步复制灾难恢复的RPO另行声明，不伪称任何故障下exactly-once。

## 4. 崩溃窗口与恢复裁定

| 窗口 | PG事实 | 恢复动作 |
|---|---|---|
| 登记前退出 | 无operation | 同key重试可登记，无业务效果 |
| 登记后未claim | pending | 扫描器claim；重新检查授权 |
| claim/拿锁后退出 | running，门闩可能agent | 租期失效→recovering；新恢复者增加fence，原worker失权 |
| 候选构建中退出 | 原文未改 | 新fence下可重新构建；不换operation/key |
| COMMIT返回前连接丢失 | 未知 | 标示/展示reconciling；重新连接主库锁operation/gate核对，不猜失败 |
| 原事务仍在数据库执行 | 行锁被占 | 等事务超时或结束后再判断，不能因本地TTL强行另写 |
| 事务已提交、响应丢失 | operation=committed且文档同事务生效 | 直接返回原结果，绝不重复delta |
| 事务已回滚 | operation仍running且无效果 | 新attempt/fence重试；如果权限或版本变化则明确rejected |
| commit后live同步失败 | committed、mode=recovering | 从PG重载owner，确认同步再释放；业务结果仍成功 |
| outbox投递后未标发送 | committed+outbox未完成 | 重投，消费端按事件ID去重 |
```
恢复不能仅“查询没有committed就断定失败”：先拿到对应事务会持有的行锁，锁内再读，才能排除原事务稍后提交。PG不可达则保持未知；60秒告警，不给虚假失败。reconciling不是另一个有权绕过fence的执行者。
```

最终事务statement_timeout=5秒、lock_timeout=1秒、idle_in_transaction_session_timeout=5秒（事务内SET LOCAL），转换/网络请求不在事务内。死锁/序列化重试仅在可确认回滚时，以同operation最多3次；结果不明走核对。

## 5. 保留期和重放

operation完整结果至少30天，审计180天；未决任务永久保留至裁定。已终态payload可在7天清除（不影响已存result/hash），幂等键/hash/终态墓碑至少保留180天，之后直到grant清理完成保留摘要以防旧key重放；此实现强于PRD最低30天，仍只承诺合同内自动重试窗口。结果已清理返回OPERATION_RESULT_EXPIRED，不重新执行旧key。

operation结果只保存必要page ID、revision、摘要，不保存完整正文；get_operation需当前grant及页面读取权，权限丢失返回不含正文/标题的拒绝。网络失败可查同operation；明确failed/rejected后修正意图用新key。

## 6. Checkpoint、历史和outbox

人工journal先持久化，checkpoint worker按固定最高seq S重建状态，锁gate后仅推进checkpoint_seq到S，保留>S的尾部；pages.content标snapshot_revision，不得标为当前gate revision。Agent提交时门闩排他，将其新状态完整checkpoint，序列推进并只删除已覆盖日志。物化失败可重试，不影响已durable journal；读取必须合并tail。

不再用JSON相等跳过二进制保存。历史前后快照用新agent_history_snapshots存ydoc/generation/revision及page_history ID，同步写已有page_history JSON以复用网页展示；异步普通历史任务不能合并或清理这些受保护关联。删除页面按现有删除策略处理，禁止操作日志绕过已删除页面权限。

outbox消费者：索引更新、转引同步、提及通知、审计转发、live重载提示。唯一event ID；每消费者独立delivery记录，失败退避1s～5min并告警。通知消费者在实际发送前登记去重键；外部发送成功后丢ack仍可能重复通知，必须明确其边界，文档内容不会重复写。

## 无变化提交

候选与基线无有效变化时仍以同一幂等操作返回committed、changed=false；不推进revision，不生成重复前后快照或正文outbox，不扣有效修改日额度，释放预留与门闩。请求限速及审计仍计入。以上是提交事务的显式分支，不允许先无条件推进版本再修正。
