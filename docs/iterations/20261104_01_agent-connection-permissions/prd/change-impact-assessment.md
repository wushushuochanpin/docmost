---
file: docs/iterations/20261104_01_agent-connection-permissions/prd/change-impact-assessment.md
description: 已有连接授权和权限模型变更影响
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 14:39:39 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户本次需求、项目现有代码及本迭代方案
applies_to: [agent, mcp, permissions]
disclaimer: 本文可更新，仅供参考；当前代码、产品行为和权威事实源优先。
---

# 变更影响

| 面 | 决策 |
|---|---|
| 类型 | cross_surface_change；OAuth 连接、API 令牌、工作区策略和 Agent 客户端共同受影响 |
| 对象 | 注册客户端是应用身份，不等于用户授权；OAuth grant 和 API token 是独立凭据，均投影为可管理的连接，不合并底层存储 |
| 主流程 | OAuth 从客户端发起注册→登录授权→回客户端；API 由用户创建→一次展示→复制到 Agent；之后各自修改/撤销 |
| 页面 | modify：我的 Agent 连接、令牌管理、工作区策略、OAuth 同意页；add：受控令牌权限编辑/升权确认；不删除旧入口 |
| 状态 | 加载、空、错误、无权、取消、过期、已撤销、冲突、客户端不支持授权、令牌一次展示、升权待确认 |
| 数据 | 实际权限是凭据范围∩用户当前 ACL∩空间范围∩工作区策略；前端只显示服务端事实 |
| 旧约束 | 旧令牌默认继续原只读；不能因迁移或空 scope 获得写入；新增 OAuth DCR 不等于自动授予资源 |
| 回归 | 两类认证、旧客户端、文档协作互斥、跨租户、撤销竞态、备份恢复及真实客户端 |
| 决策 | 用户要求两方式均支持新增时选权限、修改、撤销；本方案将 API 写入纳入设计，遵守等价写保护。自动注册的应用身份不视为可信品牌身份。|
