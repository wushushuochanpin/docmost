---
file: docs/iterations/20261018_01_agent-document-mcp/test/p2-readiness.md
description: P2 文档、兼容验证与运维准备的实际完成状态。
created_at: 2026-10-19 14:23:27 Asia/Shanghai
updated_at: 2026-10-19 14:47:53 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认 PRD/SDD、当前 OAuth/MCP 代码和本地验收结果
applies_to: [test, release]
disclaimer: 文档可能更新，仅供参考；当前代码、产品与原始验收证据优先。未部署，文中 HOST 为占位地址，不是已开放服务。
---

# P2 部署前准备记录

本轮完成公开接入文档草案、可执行 SDK 接入示例、两客户端本地兼容验证、只读运维诊断、告警判定和部署后验收清单。没有部署、应用业务库迁移、发送外部告警、创建生产任务、永久注册桌面连接或提交 Git。AC-21～24 不标为公开放行通过。

## 证据与映射

| 验收项 | 本轮产物/证据 | 状态 |
|---|---|---|
| AC-21 | Codex 与 SDK 从发现/用户许可至创建、编辑、撤销的真实协议调用；精确版本见客户端矩阵 | 本地两种实现通过；公网及其他产品仍待验证；Codex 协议头已单独记录 |
| AC-22 | public/ 下指南、登记格式、端点、scope、工具示例、限额/错误/留存；scripts/mcp/client-example.mjs 在完整应用实跑 | 文档和示例完成；独立开发者仅凭文档接入尚未执行，没有伪称独立验证 |
| AC-23 | scripts/mcp/diagnose.mjs 真实数据库只读诊断及故障注入；Codex 实测关闭新写后读取和 committed 结果保留；最终提交前关闭策略拒绝且零历史/内容 | 本地检查通过；通知送达、实际多节点策略传播、备份恢复/回退仍待部署环境验收 |
| AC-24 | 新 workspace 默认关闭、既有权限和一致性回归继续执行 | 14 天观察及签署未执行，公开发布未放行 |

本轮 P2 测试 9 组 119 项和 1 份工具 Schema 快照通过。与 P1 相比新增“候选生成后、最终提交前关闭策略”的受控竞争场景；完整应用测试在 P2 模式运行真实客户端和诊断路径，P1 普通编辑/历史/管理 UI 路径另以 P1 模式回归（同样 9 组 119 项、1 份快照通过），不能把 P2 模式称为重复执行了所有 UI 场景。

原始结果：[P2 测试](p2-jest-results.json)、[P2 环境](p2-runtime.json)、[Codex](p2-codex-probe.json)、[SDK](p2-sdk-probe.json)、[诊断故障注入](p2-operations-probe.json)、[性能样本](p2-performance.json)。证据级别为 L4 真实隔离数据库运行和 L5 浏览器许可交互，不是部署环境或人工真实设备认证。

诊断已验证正常退出 0、告警退出 2、90 秒 pending、提交缺结果 critical、6 分钟 outbox 积压、操作查询、跨 workspace 拒绝、superuser 拒绝、正文/令牌/hash 不输出及不修改业务状态。恢复关联操作年龄 >5 分钟的升级告警也已故障注入验证。脚本不等于完整 SDD 遥测体系或已接通通知。

## 遗留事项的性质

- 必须部署环境：HTTPS/反代/公网回调、实际各节点和网关故障、告警调度和送达、目标环境备份恢复与回退、目标容量、14 天观察及签署。
- 可在部署前继续完成、不能推给环境：独立开发者试用、其他目标 Agent 选择与验证、实际值班人/渠道指定、实际备份窗口与隐私删除例外政策。
- 首轮只追加测试、脚本和文档；后续已增加留存清理和监控实现及向前迁移，见下方报告。没有新增运行时依赖。

详细清单见 [部署后门槛](../release/p2-deployment-gates.md)，操作方法见 [运维手册](../release/p2-operations.md)，对接入口见 [公开接入文档](../public/README.md)。

最新补充：[留存与监控前置项验收](p2-retention-observability.md)。新增默认关闭的安全清理、结果过期幂等保护、持久化 checkpoint、恢复状态计时、服务计数/延迟和受限监控入口；本轮原始结果独立保存，不以首轮 119 项数字代表最新回归。
