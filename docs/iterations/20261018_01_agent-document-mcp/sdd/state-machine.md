---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/state-machine.md
description: 授权、文档门闩、操作状态和恢复时序。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-18 16:56:10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 状态机

```mermaid
stateDiagram-v2
 [*] --> pending: 操作入库及配额预留
 pending --> running: worker条件认领
 running --> rejected: 确定未提交的业务错误
 running --> failed: 已确认无效果的持久化故障
 running --> committed: 业务效果与结果同事务
 running --> recovering: 租约失效或提交结果未知
 recovering --> running: 旧事务排除且新attempt认领
 recovering --> committed: 查到已提交事实
 recovering --> rejected: 确定无效果且已失权
 committed --> [*]
 rejected --> [*]
 failed --> [*]
```

数据库内部running/recovering对Agent均映射pending；get_operation可返回安全phase，但不承诺进度百分比。committed/rejected/failed不可回退。进程超时不得写rejected掩盖未知提交；恢复必须先等待旧数据库事务完成并获取operation行锁。

```mermaid
stateDiagram-v2
 open --> open: 多个人工许可获取与续期
 open --> agent: 没有有效人工许可且原子增加fence
 agent --> open: 未提交拒绝并安全释放
 agent --> open: 提交且live状态同步成功
 agent --> recovering: 超时或owner丢失
 recovering --> open: 查明事务结果并重建live状态
```

open并不代表无人编辑，是否可Agent写仍需锁内检查human_permits。所有过期许可按PG时间判断。recovering期间拒绝新写与新人工许可，允许授权的只读与状态查询。60秒为报警/恢复阈值，不是强制释放门闩期限。

grant从active进入revoked/expired后不可恢复；扩权建立新授权，不能修改旧grant来扩大权限。client或workspace禁用使其grant即刻不可用；重新开启不复活显式撤销或过期grant。

人工接管：等待Agent终结→确认gate open→取最新generation/revision→获取permit→同步最新Y.Doc→允许编辑。离线旧草稿只读展示，由用户决定复制或重新应用，不能自动把旧Yjs更新发送到新epoch。原草稿保留至用户明确处理或按既定草稿保留政策清理。

对外恢复状态使用PRD的reconciling（错误/提示码OPERATION_RECONCILING）；数据库内部recovering为实现枚举。纯业务拒绝为rejected，确定无效果的基础设施失败为failed/PERSISTENCE_UNAVAILABLE；提交未知绝不能进入failed。
