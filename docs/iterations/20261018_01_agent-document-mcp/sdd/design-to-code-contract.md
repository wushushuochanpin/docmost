---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/design-to-code-contract.md
description: 前端状态、接口及实现边界的技术交接。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-18 16:56:10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 前端交接

沿用现有React18、Mantine组件、路由、国际化和会话体系，不复制EE授权页面。授权、连接管理、工作区管理为普通业务状态；可编辑正文仍由稳定editor实例与Y.Doc负责，禁止React Query作为正文实时真相或因保存回执重建editor。

| 页面 | 数据/动作 | 必需状态与边界 |
|---|---|---|
| R01 授权 | auth request、A02 decision | 登录/过期请求/无可选空间/提交中/失败/成功；写scope默认空，显示应用和到期时间 |
| R02 连接列表 | GET connections | loading/empty/error/active/revoked/expired；只显示本人连接 |
| R03 连接详情 | PATCH shrink、A04 revoke | expected_version冲突重新加载；缩权不能扩权；撤销后清理本地缓存 |
| R04 活动 | GET operations、A06 query/retry | pending/committed/rejected/result_expired；重试不盲目生成新幂等键 |
| R05 策略 | A07 PUT policy | 仅有管理权限可进入；禁用确认说明影响新写入及授权 |
| R06 审计 | GET audit | 权限拒绝/分页/过滤/空态，禁止显示正文或凭证 |
| R07 编辑器 | permit acquire/heartbeat/release | Agent占用只读、恢复中、许可过期、本地草稿待处理；提示不展示其他用户身份 |

同一操作按钮loading禁重入，服务端仍必须幂等。错误码统一映射本地化文案；用户界面显示“正在保存/已保存/等待确认/需要重新获取内容”，不暴露fence、checkpoint或事务术语。Agent已持久化但live同步失败不能显示“修改失败”；显示“已保存，正在同步”。

许可状态保存在编辑器外围控制层，通过setEditable更新而非重新创建编辑器。断线及时停止继续发送，在IndexedDB按user/workspace/page/generation隔离草稿，注销/切换账号不可读取前账号草稿。恢复草稿先展示差异与最新版本，用户确认后通过新许可的正规编辑路径提交。

[交互合同](../design/interaction-contract.md)为产品约束；可执行原型仍planned。正式前端施工前需补齐R01–R07与A02/A04/A06/A07/A08路径的可点击原型、屏幕状态截图和走查记录。SDD完成不等于该原型已经验收。
