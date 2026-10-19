---
file: docs/iterations/20261018_01_agent-document-mcp/design/interaction-contract.md
description: 授权、写入、撤销和管理流程的交互输入与恢复合同。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-18 16:28:41 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [design, prd]
disclaimer: 本文可能更新，仅供参考；现状以当前代码、产品和源系统为准，拟议行为以正式评审后的需求为准，本文不代表功能已经实现。
---

# 交互合同

状态：产品设计输入。可读主/分支流程见PRD第4、6、7节；详细测试编号待技术设计后分配，使用AC作为现阶段稳定映射。

| use_case_id | surface / entry | actor_state / preconditions | primary_action / happy_result | failure_or_edge / recovery_action | ui_state_id | prototype_required / authority | copy_boundary | acceptance_id |
|---|---|---|---|---|---|---|---|---|
| UC-01 | AUTH-CONSENT，Agent连接 | 已登录、请求合法、应用获准 | 允许连接→回Agent | 拒绝/过期/无空间/弱网→返回或重发 | CONSENT-ready/error/empty/pending | executable / executable_html | action/help/privacy | AC-01/02/15 |
| UC-02 | 外部Agent→文档页 | 授权创建且父目录有效 | 新建→文档地址 | 超时→查原操作；无父目录→重选 | OP-pending/committed/rejected | provider_owned_placeholder / executable_html | action/help | AC-05/09/10 |
| UC-03 | 外部Agent→EDITOR-BUSY→文档历史 | 授权编辑、版本有效 | 修改→保存→查看历史 | 人工忙/版本冲突/未决→退避、重读、查询 | EDITOR-busy/recovering/ready | executable / executable_html | action/help | AC-03/04/07/08/18/19 |
| UC-04 | AGENT-LIST→DETAIL | grant属于本人 | 缩权/撤销→终态 | 弱网→回读；重复→相同终态 | GRANT-active/revoked/expired/suspended | executable / executable_html | action/help | AC-13/15 |
| UC-05 | AGENT-POLICY→AUDIT | 工作区管理员 | 停用→新写拒绝 | 在途→核对；拒绝访问→返回设置 | POLICY-ready/confirm/pending/forbidden | executable / executable_html | action/help | AC-14/16/23 |

## 流转合同

| flow_id | from / trigger_action_id | preconditions | transition_type / to | success_return | cancel_return | failure_return / direct_open_fallback | acceptance_id |
|---|---|---|---|---|---|---|---|
| F01 | Agent / A01-connect | 合法OAuth请求 | auth_redirect / AUTH-CONSENT | 已验证Agent回调 | 合法回调拒绝 | 本站错误页可返回；无有效请求禁止授权 | AC-01 |
| F02 | AUTH-CONSENT / A02-allow | 已选范围、未过期 | provider_handoff / Agent | Agent显示连接成功 | 保留选择或拒绝 | 留授权页重试；非法回调不跳转 | AC-01 |
| F03 | AGENT-LIST / A03-detail | 本人授权 | push / AGENT-DETAIL | 详情 | 返回列表 | 刷新按ID加载；不可访问返回列表 | AC-13 |
| F04 | AGENT-DETAIL / A04-revoke | 可撤销 | alert / 撤销确认 | 原详情已撤销 | 原详情未改变 | 原详情显示待确认并回读 | AC-15 |
| F05 | AGENT-DETAIL / A05-activity | 有记录读取权 | push / AGENT-ACTIVITY | 记录页 | 返回详情 | 错误可重试，直达核验权限 | AC-16 |
| F06 | EDITOR-BUSY / A06-retry-edit | 已重新同步 | replace / 编辑或继续只读 | 同页编辑 | 同页查看 | 继续忙碌可刷新/返回，不丢本地内容 | AC-19 |
| F07 | AGENT-POLICY / A07-disable | 管理权限 | alert / 策略确认 | 原页已停用 | 原页不变 | 状态待确认并回读；直达无权限拒绝 | AC-23 |

## 操作结果合同

| action_id / visible_label | screen_id / action_type | preconditions / disabled_reason | success_feedback / destination | failure_feedback / cancel_feedback | weak_network_behavior | idempotency_or_duplicate | acceptance_id |
|---|---|---|---|---|---|---|---|
| A02 / 允许连接 | AUTH-CONSENT / submit | 有空间、请求有效；否则解释不可点原因 | 连接完成/Agent | 失败保留选择；取消不授权 | 禁重复点击，回读结果 | 同请求只一个授权结果 | AC-01 |
| A04 / 撤销连接 | AGENT-DETAIL / destructive | active；已撤销显示终态 | 已撤销/原页 | 失败可重试；取消不改变 | 显示确认中并回读 | 重复撤销同终态 | AC-15 |
| A08 / 保存访问范围 | AGENT-DETAIL / submit | 仅缩小；扩大引导重授权 | 已更新/原页 | 校验错误保留选择；取消丢弃未保存选择 | 结果待确认，服务端事实为准 | 版本过期刷新，不覆盖新范围 | AC-13/15 |
| A06 / 重试编辑 | EDITOR-BUSY / CTA | 无未决写且重同步完成；否则说明原因 | 开放编辑/同页 | 仍忙保留只读；可离开 | 保持只读和本地恢复入口 | 重复点击不创建多个会话 | AC-03/19 |
| A07 / 关闭Agent写入 | AGENT-POLICY / toggle-confirm | 管理权限 | 已关闭/原页 | 失败可重试；取消开关不变 | 展示待确认，不乐观报成功 | 重复设置同终态 | AC-23 |

页面共同覆盖加载、空、内容、错误、无权限；可重试失败保留输入，终态提供返回。开发者协议字段只出现在Agent/tool边界，不进入普通用户文案。
