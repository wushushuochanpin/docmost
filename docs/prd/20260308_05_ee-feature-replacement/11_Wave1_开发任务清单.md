# 11 Wave 1 开发任务清单

**成文日期**：2026-03-08 23:56:01 UTC+8
**最后修订**：2026-03-08 23:56:01 UTC+8

本文档用于把 `Wave 1` 进一步拆成可执行的开发任务和代码落点。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 目标

把 `Wave 1` 拆成可以直接进入开发排期的任务，明确：

1. 哪些文件必须修改
2. 哪些目录需要新建
3. 哪些现有 `ee` / 上游实现只能参考、不能复用
4. 任务依赖顺序和验收口径

## Wave 1 范围

本波次包含：

1. 个人 API Token 管理
2. 工作区 API Token 管理
3. Audit Log
4. 设置页 `Source Code` 入口
5. `/api/version.sourceUrl`

本波次不包含：

1. `OIDC / SSO`
2. `SAML / LDAP`
3. 登录页源码入口
4. 页面级权限

## 禁止复用清单

以下路径只允许作为黑盒行为参考，不允许直接复制实现：

1. `apps/client/src/ee/api-key/**`
2. `apps/client/src/ee/audit/**`
3. `apps/client/src/ee/security/**`
4. `apps/server/src/ee/**`

以下路径可阅读其现状，但不作为本期直接落地实现：

1. `apps/server/src/database/migrations/20250912T101500-api-keys.ts`
2. `apps/server/src/database/migrations/20260305T000100-audit.ts`

原因：

1. `ee` 目录受企业版许可约束
2. 上游同名表和迁移语义与本期 `sc_*` 自研路线不一致

## 必改文件清单

### 前端现有文件

1. [apps/client/src/App.tsx](/root/coderepository/docmost/apps/client/src/App.tsx)
   - 把 `/settings/account/api-keys`、`/settings/api-keys`、`/settings/audit` 路由从 `@/ee/*` 页面切到自研页面
2. [apps/client/src/components/settings/settings-sidebar.tsx](/root/coderepository/docmost/apps/client/src/components/settings/settings-sidebar.tsx)
   - 将灰菜单判断从 `hasLicenseKey` 迁移到 `workspace.capabilities`
   - 增加 `Source Code` 展示入口或与底部版本区域联动
3. [apps/client/src/components/settings/app-version.tsx](/root/coderepository/docmost/apps/client/src/components/settings/app-version.tsx)
   - 展示 `sourceUrl`
   - 保持当前版本号与更新提示逻辑
4. [apps/client/src/components/settings/settings-queries.tsx](/root/coderepository/docmost/apps/client/src/components/settings/settings-queries.tsx)
   - 将 `prefetchApiKeys`、`prefetchApiKeyManagement`、`prefetchAuditLogs` 改为走自研 service
5. [apps/client/src/features/workspace/services/workspace-service.ts](/root/coderepository/docmost/apps/client/src/features/workspace/services/workspace-service.ts)
   - 扩展 `getAppVersion()`
   - 如需 capability 从 workspace 接口读取，这里也要兼容
6. [apps/client/src/features/workspace/queries/workspace-query.ts](/root/coderepository/docmost/apps/client/src/features/workspace/queries/workspace-query.ts)
   - 校验 version 查询缓存与返回类型
7. [apps/client/src/features/workspace/types/workspace.types.ts](/root/coderepository/docmost/apps/client/src/features/workspace/types/workspace.types.ts)
   - 新增 `capabilities`
   - 扩展 `IVersion.sourceUrl`

### 后端现有文件

1. [apps/server/src/integrations/security/version.service.ts](/root/coderepository/docmost/apps/server/src/integrations/security/version.service.ts)
   - 返回 `sourceUrl`
   - 推荐同时返回 `commitSha`
2. [apps/server/src/integrations/security/version.controller.ts](/root/coderepository/docmost/apps/server/src/integrations/security/version.controller.ts)
   - 维持现有自托管鉴权策略
3. [apps/server/src/core/workspace/services/workspace.service.ts](/root/coderepository/docmost/apps/server/src/core/workspace/services/workspace.service.ts)
   - 在 `workspace/info` 返回中加入 `capabilities`
4. [apps/server/src/core/workspace/controllers/workspace.controller.ts](/root/coderepository/docmost/apps/server/src/core/workspace/controllers/workspace.controller.ts)
   - 无需大改接口路径，但要确保 capability 字段下发
5. [apps/server/src/core/core.module.ts](/root/coderepository/docmost/apps/server/src/core/core.module.ts)
   - 注册自研 Token / Audit 模块
   - 将默认 `NoopAuditService` 切换为真实实现
6. [apps/server/src/integrations/audit/audit.service.ts](/root/coderepository/docmost/apps/server/src/integrations/audit/audit.service.ts)
   - 保留接口定义
   - 由新实现类实现同一契约

## 新建目录建议

### 前端

1. `apps/client/src/features/compliance-admin/api-keys/pages`
2. `apps/client/src/features/compliance-admin/api-keys/components`
3. `apps/client/src/features/compliance-admin/api-keys/services`
4. `apps/client/src/features/compliance-admin/api-keys/queries`
5. `apps/client/src/features/compliance-admin/api-keys/types`
6. `apps/client/src/features/compliance-admin/audit/pages`
7. `apps/client/src/features/compliance-admin/audit/components`
8. `apps/client/src/features/compliance-admin/audit/services`
9. `apps/client/src/features/compliance-admin/audit/queries`
10. `apps/client/src/features/compliance-admin/audit/types`

### 后端

1. `apps/server/src/core/integration-token/controllers`
2. `apps/server/src/core/integration-token/services`
3. `apps/server/src/core/integration-token/repos`
4. `apps/server/src/core/integration-token/dto`
5. `apps/server/src/core/integration-token/integration-token.module.ts`
6. `apps/server/src/core/audit-log/controllers`
7. `apps/server/src/core/audit-log/services`
8. `apps/server/src/core/audit-log/repos`
9. `apps/server/src/core/audit-log/dto`
10. `apps/server/src/core/audit-log/audit-log.module.ts`

### 数据库

1. `apps/server/src/database/migrations/<timestamp>-sc-api-tokens.ts`
2. `apps/server/src/database/migrations/<timestamp>-sc-audit-events.ts`

## 任务拆分

### T1：Capability 基座

目标：

1. 把前端设置页的显示控制从 `hasLicenseKey` 迁移到 capability
2. 为 `Wave 1` 三类页面提供独立开关

代码落点：

1. [apps/server/src/core/workspace/services/workspace.service.ts](/root/coderepository/docmost/apps/server/src/core/workspace/services/workspace.service.ts)
2. [apps/client/src/features/workspace/types/workspace.types.ts](/root/coderepository/docmost/apps/client/src/features/workspace/types/workspace.types.ts)
3. [apps/client/src/components/settings/settings-sidebar.tsx](/root/coderepository/docmost/apps/client/src/components/settings/settings-sidebar.tsx)

交付物：

1. `workspace.capabilities.integrationTokens`
2. `workspace.capabilities.workspaceTokenManagement`
3. `workspace.capabilities.auditLogs`
4. `workspace.capabilities.sourceCodeAccess`

依赖：

- 无

### T2：版本接口与源码入口

目标：

1. 让 `/api/version` 返回 `sourceUrl`
2. 在设置页底部展示 `Source Code`

代码落点：

1. [apps/server/src/integrations/security/version.service.ts](/root/coderepository/docmost/apps/server/src/integrations/security/version.service.ts)
2. [apps/client/src/components/settings/app-version.tsx](/root/coderepository/docmost/apps/client/src/components/settings/app-version.tsx)
3. [apps/client/src/features/workspace/types/workspace.types.ts](/root/coderepository/docmost/apps/client/src/features/workspace/types/workspace.types.ts)
4. [apps/client/src/features/workspace/services/workspace-service.ts](/root/coderepository/docmost/apps/client/src/features/workspace/services/workspace-service.ts)

交付物：

1. `IVersion.sourceUrl`
2. 设置页 `Source Code` 链接
3. 版本号、源码链接、部署版本一致性校验

依赖：

- `T1` 可并行，不强依赖

### T3：Token 数据层

目标：

1. 建立 `sc_api_tokens`、`sc_api_token_events`
2. 提供 repo 与 DTO

代码落点：

1. `apps/server/src/database/migrations/<timestamp>-sc-api-tokens.ts`
2. `apps/server/src/core/integration-token/repos`
3. `apps/server/src/core/integration-token/dto`

交付物：

1. 表结构
2. 索引
3. repo 单测或基本读写验证

依赖：

- 无

### T4：个人 Token API

目标：

1. 支持成员查看和撤销自己的 Token
2. 策略允许时支持创建

代码落点：

1. `apps/server/src/core/integration-token/controllers`
2. `apps/server/src/core/integration-token/services`
3. [apps/server/src/core/casl/abilities/workspace-ability.factory.ts](/root/coderepository/docmost/apps/server/src/core/casl/abilities/workspace-ability.factory.ts)
4. [apps/server/src/core/casl/interfaces/workspace-ability.type.ts](/root/coderepository/docmost/apps/server/src/core/casl/interfaces/workspace-ability.type.ts)

接口：

1. `POST /api/integration-keys/list`
2. `POST /api/integration-keys/create`
3. `POST /api/integration-keys/revoke`

依赖：

- `T3`

### T5：工作区 Token 管理 API

目标：

1. 支持 Admin / Owner 管理工作区级 Token
2. 支持“仅管理员可创建”策略

代码落点：

1. `apps/server/src/core/integration-token/controllers`
2. `apps/server/src/core/integration-token/services`
3. [apps/server/src/core/workspace/services/workspace.service.ts](/root/coderepository/docmost/apps/server/src/core/workspace/services/workspace.service.ts)

接口：

1. `POST /api/admin/integration-keys/list`
2. `POST /api/admin/integration-keys/create`
3. `POST /api/admin/integration-keys/revoke`
4. `POST /api/admin/integration-keys/policy`

依赖：

- `T3`
- `T4`

### T6：Audit 数据层与真实实现

目标：

1. 建立 `sc_audit_events`、`sc_audit_retention`
2. 将 `AUDIT_SERVICE` 从 `Noop` 切到真实实现

代码落点：

1. `apps/server/src/database/migrations/<timestamp>-sc-audit-events.ts`
2. `apps/server/src/core/audit-log/services`
3. `apps/server/src/core/audit-log/repos`
4. [apps/server/src/core/core.module.ts](/root/coderepository/docmost/apps/server/src/core/core.module.ts)
5. [apps/server/src/integrations/audit/audit.service.ts](/root/coderepository/docmost/apps/server/src/integrations/audit/audit.service.ts)
6. [apps/server/src/common/events/audit-events.ts](/root/coderepository/docmost/apps/server/src/common/events/audit-events.ts)

交付物：

1. 统一写入服务
2. 审计保留期更新接口
3. Token 创建 / 撤销事件落表

依赖：

- `T3`

### T7：Audit 查询页

目标：

1. Owner 可查看审计日志
2. 支持筛选与分页

代码落点：

1. `apps/client/src/features/compliance-admin/audit/pages`
2. `apps/client/src/features/compliance-admin/audit/components`
3. `apps/client/src/features/compliance-admin/audit/services`
4. `apps/client/src/features/compliance-admin/audit/queries`
5. [apps/client/src/App.tsx](/root/coderepository/docmost/apps/client/src/App.tsx)
6. [apps/client/src/components/settings/settings-queries.tsx](/root/coderepository/docmost/apps/client/src/components/settings/settings-queries.tsx)

依赖：

- `T6`
- `T1`

### T8：Token 页面

目标：

1. 替换当前 `ee` 页面路由
2. 实现个人页与管理页

代码落点：

1. `apps/client/src/features/compliance-admin/api-keys/pages`
2. `apps/client/src/features/compliance-admin/api-keys/components`
3. `apps/client/src/features/compliance-admin/api-keys/services`
4. `apps/client/src/features/compliance-admin/api-keys/queries`
5. [apps/client/src/App.tsx](/root/coderepository/docmost/apps/client/src/App.tsx)
6. [apps/client/src/components/settings/settings-queries.tsx](/root/coderepository/docmost/apps/client/src/components/settings/settings-queries.tsx)

依赖：

- `T4`
- `T5`
- `T1`

### T9：集成回归

目标：

1. 保障 `Wave 1` 不破坏现有登录、分享、备份
2. 校验 capability、版本接口、审计写入一致性

代码落点：

1. 现有冒烟脚本与手测清单
2. 必要时补接口测试到对应 controller / service spec

关键验证：

1. `/settings/account/api-keys`
2. `/settings/api-keys`
3. `/settings/audit`
4. 设置页 `Source Code`
5. `/api/version`
6. 登录、分享页、备份页

依赖：

- `T1` 到 `T8`

## 并行建议

可并行：

1. `T1` 与 `T2`
2. `T3` 与前端页面骨架搭建
3. `T6` 与 `T8` 的纯 UI 部分

不建议并行：

1. `T4` / `T5` 未稳定前，不要完成 Token 页面联调
2. `T6` 未稳定前，不要锁死审计查询页字段结构

## Definition Of Done

1. 三个设置页路由已全部切离 `@/ee/*`
2. `workspace.capabilities` 可以控制显示和权限
3. `/api/version` 返回 `currentVersion`、`latestVersion`、`releaseUrl`、`sourceUrl`
4. `Source Code` 链接来自后端接口，不在前端硬编码
5. Token 创建成功后只展示一次明文
6. Token 创建 / 撤销 / 策略修改有审计记录
7. Owner 能查审计日志，Admin 和 Member 不越权
8. 测试环境验证通过后再进入正式灰度
