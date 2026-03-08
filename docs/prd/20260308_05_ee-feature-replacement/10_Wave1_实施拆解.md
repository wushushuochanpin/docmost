# 10 Wave 1 实施拆解

**成文日期**：2026-03-08 23:47:55 UTC+8
**最后修订**：2026-03-08 23:47:55 UTC+8

本文档用于拆解 `Wave 1` 的开发范围、模块边界与交付顺序。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## Wave 1 范围锁定

`Wave 1` 只交付三类能力：

1. 个人 API Token 管理
2. 工作区 API Token 管理
3. Audit Log 与 AGPL 源码入口

本阶段明确不做：

1. OIDC / SSO
2. SAML / LDAP
3. 页面级权限
4. 登录页源码入口

## 目标结果

1. 普通成员在策略允许时可以创建、查看、撤销自己的 API Token。
2. Admin / Owner 可以统一管理工作区级 Token。
3. Owner 可以查看审计日志并设置保留期。
4. 设置页可看到 `Source Code` 入口。
5. `/api/version` 响应中包含 `sourceUrl`，可定位到当前运行版本源码。

## 前端拆解

### 1. 设置页导航与入口

- 修改 `settings-sidebar` 能力判断逻辑
- `API keys`、`API管理`、`Audit log` 改为 capability 控制
- 新增 `Source Code` 入口展示逻辑
- `Source Code` 链接值来自 `/api/version.sourceUrl`

验收点：

- 无 capability 时仍保持灰态或隐藏
- capability 打开后对应页面可进入
- `Source Code` 只在存在 `sourceUrl` 时展示

### 2. 个人 Token 页面

- 页面路径：`/settings/account/api-keys`
- 核心元素：
  - Token 列表
  - 新建弹窗
  - 撤销确认弹窗
  - 最后使用时间
  - 过期时间
  - scope 标签

验收点：

- 创建成功后仅展示一次明文 Token
- 刷新页面后不再显示明文
- 已撤销 Token 不可继续使用

### 3. 工作区 Token 页面

- 页面路径：`/settings/api-keys`
- 仅 `Admin` 及以上可见
- 支持：
  - 按 owner / creator / status 筛选
  - 创建工作区级 Token
  - 撤销 Token
  - 查看最近使用时间

验收点：

- 普通成员不可见也不可调用管理接口
- 策略关闭时成员不可创建个人 Token

### 4. Audit Log 页面

- 页面路径：`/settings/audit`
- 仅 `Owner` 默认可见
- 支持：
  - 事件类型筛选
  - 操作者筛选
  - 时间范围筛选
  - cursor 分页
  - 保留期配置

验收点：

- Token 创建、撤销、策略修改都能在列表中看到
- 筛选条件切换后结果正确

## 后端拆解

### 1. IntegrationTokenModule

建议目录：

- `apps/server/src/core/integration-token/controllers`
- `apps/server/src/core/integration-token/services`
- `apps/server/src/core/integration-token/repos`
- `apps/server/src/core/integration-token/dto`

核心接口：

- `POST /api/integration-keys/list`
- `POST /api/integration-keys/create`
- `POST /api/integration-keys/revoke`
- `POST /api/admin/integration-keys/list`
- `POST /api/admin/integration-keys/create`
- `POST /api/admin/integration-keys/revoke`

### 2. AuditLogModule

建议目录：

- `apps/server/src/core/audit-log/controllers`
- `apps/server/src/core/audit-log/services`
- `apps/server/src/core/audit-log/repos`
- `apps/server/src/core/audit-log/dto`

核心接口：

- `POST /api/audit-events/list`
- `POST /api/audit-events/retention`
- `POST /api/audit-events/retention/update`

### 3. Version 扩展

- 在现有版本接口响应中新增 `sourceUrl`
- 返回值至少包含：
  - `currentVersion`
  - `latestVersion`
  - `sourceUrl`
  - `commitSha`（推荐）

验收点：

- 设置页展示的 `Source Code` 链接来自后端，不在前端写死
- 测试和生产能返回各自对应版本的源码地址

## 数据与迁移拆解

### 新增表

1. `sc_api_tokens`
2. `sc_api_token_events`
3. `sc_audit_events`
4. `sc_audit_retention`

### 迁移要求

1. 不复用企业版同名迁移文件
2. 时间戳顺序必须晚于当前已执行本地迁移
3. 为查询高频字段补索引：
   - `workspace_id`
   - `owner_user_id`
   - `status`
   - `event_type`
   - `created_at`

## Capability 拆解

建议首期 capability：

1. `integrationTokens`
2. `workspaceTokenManagement`
3. `auditLogs`
4. `sourceCodeAccess`

建议下发位置：

1. `workspace/info`
2. `users/me`

## 开发顺序

### Step 1：基础数据与 Repo

- 建表
- Repo
- DTO
- 基础单测

### Step 2：个人 Token

- 列表
- 创建
- 撤销
- 权限校验
- 审计事件写入

### Step 3：工作区 Token 管理

- 管理员列表
- 创建
- 撤销
- 策略开关

### Step 4：Audit Log

- 写入服务
- 查询接口
- 列表页面
- 保留期设置

### Step 5：Source Code 入口

- 后端版本接口增加 `sourceUrl`
- 设置页展示 `Source Code`
- 回归版本显示逻辑

## 风险与回避

1. 风险：把工作区级 Token 和个人 Token 混成一套权限判断。
   处理：接口和表字段中显式区分 `is_workspace_managed`。
2. 风险：审计事件只在页面入口触发，漏掉后端直接调用。
   处理：在服务层写统一审计，不依赖前端触发。
3. 风险：`sourceUrl` 指向错误版本。
   处理：发布流程中加入版本号与 commit sha 校验。

## 交付物

1. PRD 包本专题文档
2. 数据迁移脚本
3. 前后端页面与接口实现
4. 权限测试与审计测试
5. AGPL 源码归档与访问入口
