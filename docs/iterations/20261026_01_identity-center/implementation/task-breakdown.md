---
file: docs/iterations/20261026_01_identity-center/implementation/task-breakdown.md
description: 认证中心接入的task-breakdown记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 分片构建计划

| slice | 工作 / 验收 | depends_on | acceptance_gate | stop_before_next_if |
| --- | --- | --- | --- | --- |
| S1 | 身份短事务、映射与绑定 AC01-05 | 已接受范围及中心协议 | 定向安全测试、真实PG原子性 | 协议不清、唯一约束失败 |
| S2 | opaque会话、HTTP与实时撤销 AC04/06 | 会话接口约定 | 撤销、过期和兼容测试 | 任一鉴权绕过 |
| S3 | 登录/绑定/失败回流与竞态 AC01/02/05/06 | S1接口、既有target-stack交互合同 | 客户端测试及构建 | 界面与服务端合同漂移 |
| S4 | 模块集成、迁移和备份 AC07/08 | S1/S2/S3 | server/client build、迁移顺序、备份恢复 | 回归失败或中心仍未登记 |
| S5 | 独立环境真实验收 | S4及真实client | 真实扫码、SSO、job→Pod及归零证据 | 外部配置/验收缺失，保持关闭 |

并行实现按文件所有权隔离，主代理集成。发布顺序见 release，不能代替以上构建门槛。

## 执行状态

S1–S4 本地实现与定向验证完成，详见测试证据；S5 等待真实 client 登记、提供方与部署环境验收，保持默认关闭。
