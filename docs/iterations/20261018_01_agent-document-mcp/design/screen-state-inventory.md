---
file: docs/iterations/20261018_01_agent-document-mcp/design/screen-state-inventory.md
description: 首期页面、状态与原型覆盖输入。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-18 16:28:41 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [design]
disclaimer: 本文可能更新，仅供参考；现状以当前代码、产品和源系统为准，拟议行为以正式评审后的需求为准，本文不代表功能已经实现。
---

# 屏幕与状态清单

每行的后端事实来源均为PRD对应授权/操作/策略或文档状态；原型不得伪造功能已上线。

| screen_id | primary_user_job | entry_points | actor_states | data_source_of_truth | visible_states | primary_actions | exits_and_returns | acceptance_ids |
|---|---|---|---|---|---|---|---|---|
| AUTH-CONSENT | 完成一次知情授权 | Agent连接 | 登录前后/无空间 | 应用登记+权限+授权请求 | 加载/可授权/无空间/过期/非法/提交中 | 选择、允许、拒绝 | Agent或本站错误页 | AC-01/02 |
| AGENT-LIST | 管理个人连接 | 账号设置 | 已登录 | grants查询 | 加载/空/列表/错误 | 查看、撤销 | 详情或设置 | AC-13 |
| AGENT-DETAIL | 管理单项范围 | 列表/深链 | 本人/非本人 | grant实时状态 | 有效/暂停/到期/撤销/待确认/无权限 | 缩权、撤销、记录 | 列表/记录 | AC-13/15 |
| AGENT-ACTIVITY | 核对个人操作 | 详情/深链 | 本人 | operation+ACL | 空/列表/处理中/核对中/成功/失败/拒绝 | 筛选、开文档 | 详情/文档历史 | AC-16/18 |
| AGENT-POLICY | 配置集成策略 | 工作区设置 | 管理员/非管理员 | workspace policy | 加载/配置/确认/待确认/失败/无权限 | 保存、启停 | 设置/同页 | AC-14/23 |
| AGENT-AUDIT | 检查租户操作 | 管理设置 | 管理员 | 审计+页面ACL | 空/列表/脱敏/错误/无权限 | 筛选、查看结果 | 设置/有权文档 | AC-16 |
| EDITOR-BUSY | 查看文档与等待编辑 | 文档地址 | 有读/编辑权限 | 文档级资格+协作状态 | 正常/Agent占用/恢复中/本地待恢复 | 重试、返回 | 同页/目录 | AC-03/19 |

prototype_required=executable；prototype_authority_kind=executable_html；外部Agent仅provider_owned_placeholder。计划7类产品屏幕，至少35个可见状态，覆盖范围以交互合同为准；此数量为设计输入，未生成可执行原型。
