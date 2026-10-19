---
file: docs/iterations/20261018_01_agent-document-mcp/test/p2-retention-observability.md
description: P2 留存清理、受限遥测及本地回归证据与部署后边界。
created_at: 2026-10-19 14:47:53 Asia/Shanghai
updated_at: 2026-10-19 14:47:53 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认 SDD、当前实现及本地隔离测试
applies_to: [test, operations, release]
disclaimer: 文档可能更新，仅供参考；当前代码和原始验收证据优先。未部署，公开放行未通过。
---

# P2 留存与监控前置项

本轮新增一份向前迁移和应用实现，没有部署或向业务数据库应用迁移，没有新增运行时依赖。清理默认关闭；监控输出不包含正文、令牌、请求 hash 或高基数租户标签。新增的清理不会修改 pages.ydoc、历史正文或仍在处理中的操作。

## 留存合同与执行边界

| 对象 | 条件与行为 |
|---|---|
| 操作结果 | 终态且超过 30 天后可清空载荷，写 result_expired_at；保留唯一幂等键、请求 hash、操作身份与状态。未决 gate、outbox、quota 存在时不清理；缺恢复证据的 changed 提交也不清理 |
| 幂等重试/查询 | 仍先检查授权/ACL/请求一致性；到期返回 OPERATION_RESULT_EXPIRED，禁止重新执行。最小墓碑当前不自动删除，不承诺个人数据全部在 180 天删除 |
| 恢复快照 | 至少 180 天；仅清理已终结且没有历史关联的快照。历史关联记录继续遵守现有历史生命周期，不做独立销毁 |
| journal | 必须有已持久化 checkpoint、非空 Y.Doc、open gate、没有活跃人工许可；记录超过备份窗口，且对应 session 已绝对到期或撤销超过 24 小时。旧 gate 默认 checkpoint=0，不能假定旧 journal 已安全落盘 |
| outbox | 仅已送达并超过备份窗口且关联操作已解决的载荷置空，保留送达记录；未送达不清理 |
| OAuth | code/request 到期及响应重放窗口结束后再保留 24 小时；refresh token 必须整个 family 和 grant 均绝对到期超过 24 小时才可分批清理。已消费但 family 仍有效的记录保留以检测重放；grant 不删除 |
| 管理审计/维护审计/结算日额度 | 至少 180 天，取配置值与既有两处工作区审计配置的较大值；现有审计配置缺省按当前审计服务的 365 天处理。未决预留不清理 |

每分钟扫描最多 10 个工作区，按 ID 游标推进；每类每工作区默认最多 200 条，事务使用 5 秒语句超时和 1 秒锁等待。清理与授权/写入共用 PostgreSQL 排他授权屏障；繁忙则跳过，多节点不会重复清理。清理与计数审计同事务，任何一步失败全部回滚。全局未绑定的过期 OAuth request 独立有界清理。

## 配置和回退

- `AGENT_RETENTION_ENABLED`：只有字面值 true 才启用，默认关闭；需先排空不理解 result_expired_at 的旧节点。
- `AGENT_RETENTION_RESULT_DAYS`：默认/下限 30。
- `AGENT_RETENTION_AUDIT_DAYS`：默认/下限 180，同时尊重既有更长审计配置。
- `AGENT_RETENTION_HISTORY_DAYS`：默认/下限 180，仅控制无历史关联快照。
- `AGENT_RETENTION_BACKUP_DAYS`：默认 7，下限 1；默认值不是已经确认的业务备份窗口，启用前必须与实际恢复策略核对。
- `AGENT_RETENTION_HOLD_WORKSPACES`：逗号分隔 UUID，接受空白及大小写；非法值启动失败。命中后整个工作区暂停清理。
- 上述天数必须为整数且不超过 36500。保留名单需在每个节点一致配置。

出现异常先将清理开关关闭并重启相关进程；这只停止后续批次，不能找回已删除载荷。回退必须使用理解过期标记的版本，或完成一致备份恢复演练后按维护流程操作。新迁移不可破坏性 down。用户注销/法律删除与墓碑、历史、审计之间的例外审批政策仍需数据责任人确认，不能用手工删 grant/operation 替代。

## 监控口径

`GET /api/agent-observability` 返回单进程快照，要求有效登录、平台登记白名单及当前工作区管理权限，Cache-Control=no-store；普通成员、匿名及非白名单管理员不应取得全局快照。也可开启 `AGENT_TELEMETRY_LOG_ENABLED=true`，每分钟由现有日志系统收集 AGENT_METRICS。没有向公开 Agent 暴露监控工具。

OAuth 授权/换 token/认证记录尝试、成功、有限错误码和耗时；refresh 重放单独计数。文档事务、恢复、维护、新增文档工具记录耗时与错误；checkpoint 失败单独计数。计数标签只有固定业务域和错误码，未知异常归并 INTERNAL_ERROR。旧的四个知识检索工具、进入业务服务前的参数拒绝以及反代限流不在 mcp_tool/OAuth 服务计数分母内，入口指标需由网关补充。

诊断脚本补充 journal 未 checkpoint 尾部行数/字节、结果正常过期数量，以及实际进入 recovering 的年龄；存量 recovering 状态迁移时以迁移时间作为保守基线。原有 pending、outbox、提交完整性和 live 未同步指标继续有效。正常清理后的结果空值不会被误报为提交丢失。

每个进程独立采样，使用 instance_id/started_at 区分重启，禁止跨节点做计数相减。`scripts/mcp/evaluate-metrics.mjs previous.json current.json` 计算窗口比率及直方图 P95 上界，退出 0=无已定义告警、2=告警、1=输入失败；重启输出 baseline_required，须重新建立基线，不当作健康样本。P95 为桶上界，不是精确分位数。事件循环 P95/P99/max 是进程启动后的采样值；数据库物理 WAL 写放大不由这些应用计数替代。

默认规则：refresh 重放、checkpoint/清理失败任意增量告警；窗口至少 60 秒且至少 10 次尝试，token 失败率 >20% 或 busy+revision conflict >50% 告警；至少 20 次事务且 P95 上界 >200ms 告警。阈值为试用初值，部署后按实际负载校准。指标输出和判定器已实现，不代表采集调度、通知和当班人已配置。

## 本地验证与剩余门槛

原始结果见 [完整应用回归](p2-retention-jest-results.json)、[客户端与运维回归](p2-retention-clients-jest-results.json)、[监控入口](p2-metrics-probe.json)、[诊断故障注入](p2-operations-probe.json)。两个分支均为 10 组、131 项测试和 1 份 Schema 快照通过；另有 2 项离线告警测试通过。服务构建、定向 ESLint、迁移顺序和差异空白检查通过。构建成功但 Nx 提示 editor-ext 历史任务 flaky 标记，本轮没有编辑器编译失败。

新增测试使用真实隔离 PostgreSQL、非超级用户和 RLS，覆盖保留名单、跨工作区、并发清理、写入屏障繁忙跳过、事务失败回滚、默认不开启、旧结果重放不重复创建/编辑、历史关联保留、journal checkpoint/session/许可/备份窗口、刷新 family 重放证据、既有审计期限和缺恢复证据保护。保留原有 OAuth、多节点、权限、编辑/历史/连接 UI 及 Codex/SDK 路径，两个完整应用分支分别运行。离线告警判定器另有阈值、重启与直方图一致性测试。

必须部署后验证：真实 HTTPS/反代及外部回调、所有实际节点的版本/策略与采集、告警通知送达和恢复、目标数据量的清理耗时/锁等待/积压消化与物理 WAL、真实备份恢复及兼容回退、目标容量性能、连续 14 天观察和放行签署。

无需部署但仍需人员/政策确认：实际责任人与通知渠道、独立开发者仅凭文档试用、最终支持客户端名单、实际备份窗口与保留例外/注销删除政策。完整门槛见 [P2 部署清单](../release/p2-deployment-gates.md)。P2 公开发布仍未放行。
