# PRD 共享数据库（线上/测试同库）处理模板（精简）

用于改造类需求在“线上与测试共用同一数据库”时，快速写出 AI 可执行的隔离与发布方案。

## 1. 先回答三个问题（必填）

- 是否共库：`yes/no`
- 是否存在测试写入线上风险：`yes/no`
- 本次是否涉及写链路/迁移：`yes/no`

任一为 `yes`，必须启用本模板。

## 2. 最小策略（必填）

- 隔离策略：`release_channel_guard` 或 `workspace_allowlist`
- DDL 策略：`additive_only`（新增表/字段优先）
- 灰度单元：`workspace`
- 发布策略：`flag_off_by_default`
- 回滚策略：`feature_flag_off + job_based_data_rollback`

## 3. PRD 必写字段（直接复制）

```yaml
shared_db_mode: true
isolation_strategy: release_channel_guard
ddl_policy: additive_only
rollout_unit: workspace
flag_default: off
migration_mode: job_based_reversible
rollback_slo: "<=30m"
no_impact_scope: "workspaces_without_flag"
```

## 4. 验收门槛（必填）

- 跨环境误写入：`= 0`
- 迁移成功率：`>= 99%`
- 关键写接口错误率：`< 1% (15m window)`
- 回滚完成时长：`<= 30m`

## 5. 禁止项（评审直接退回）

- 未定义隔离策略就开始写功能细节。
- 直接改造核心热表且无回滚窗口。
- 不按 workspace 灰度，整库一次性切换。
- 无迁移明细记录，无法精确回滚。
