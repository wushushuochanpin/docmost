# Docmost 安全与稳定性加固 PRD

**成文日期**：2026-05-26  
**来源**：v0.90.0 深度代码审计

本文档基于对 Docmost 全栈（NestJS 后端、React 前端、PostgreSQL 数据库、Hocuspocus/Yjs 协作栈）的深度审计，梳理出 25 项问题并按优先级排列，指导逐项修复。

---

## 1. PRD 元信息

| 项目 | 内容 |
|---|---|
| doc_id | `PRD-20260526-01-security-stability-hardening` |
| 版本 | v1.0 |
| 档位 | medium，多文件分批 PRD |
| 落盘路径 | `docs/prd/20260526_01_security-stability-hardening.md` |
| 需求状态 | pending |
| 改造策略 | fix — 修复已有代码缺陷，不新增功能 |

---

## 2. 问题总览

### 优先级定义

| 等级 | 定义 | 数量 |
|------|------|------|
| **P0** | 数据安全风险、多租户隔离漏洞、竞态导致数据丢失 | 3 |
| **P1** | 安全隐患、数据一致性、可用性风险 | 4 |
| **P2** | 中等风险、可靠性问题 | 4 |
| **P3** | 低风险、代码质量、设计改善 | 14 |

---

## 3. P0 — 立即修复

### P0-1: Setup Guard 竞态条件

**文件**: `apps/server/src/core/auth/guards/setup.guard.ts`  
**问题**: `canActivate()` 先查询 workspace count，再允许创建。无事务/锁保护，并发请求可同时通过检查，创建出多个 workspace 和 admin 用户。  
**修复方案**: 在 `workspaces` 表上使用 PostgreSQL advisory lock (`pg_try_advisory_lock`) 或在事务中用 `SELECT ... FOR UPDATE` 串行化 setup 流程。

### P0-2: RLS 多租户隔离覆盖缺失

**文件**: `apps/server/src/database/migrations/20260219T030000-full-tenant-rls-rollout.ts`  
**问题**: 以下新建表未纳入 RLS 策略，数据可能跨 workspace 泄露：

- `notifications`, `watchers`, `pageAccess`, `pageVerifications`
- `page_transclusions`, `page_transclusion_references`, `labels`
- `user_sessions`, `ai_chats`, `templates`, `favorites`
- `audit`, `scim_groups`, `scim_users`, `sidebar_categories`

**修复方案**: 新增迁移文件，为上述所有表添加 `tenant_rls_*` 策略，与已有 RLS 模式一致。需要评估 `audit` 表的 RLS 策略是否适合（审计可能需要跨 tenant 查询）。

### P0-3: EditorSession Redis 非原子操作竞态

**文件**: `apps/server/src/core/editor-session/editor-session.service.ts`  
**问题**: `mutateState()` 使用 GET → 本地修改 → SET 模式，多实例下并发写入可能冲突，导致编辑会话状态不一致。  
**修复方案**: 用 Lua 脚本替代当前的 GET/SET 模式，将读取-修改-写入封装为单个原子操作。

---

## 4. P1 — 高优先级

### P1-1: 密码对比时序攻击面

**文件**: `apps/server/src/core/auth/services/auth.service.ts:72`  
**问题**: `comparePasswordHash()` 未确认使用恒定时间比较。  
**修复方案**: 确认基础库的 `comparePasswordHash` 实现为恒定时间（如 bcrypt.compare 本身是安全的）。若不确定，包装为显式恒定时间比较。

### P1-2: Persistence Extension 贡献者 Map 泄漏

**文件**: `apps/server/src/collaboration/extensions/persistence.extension.ts`  
**问题**: `contributors` Map 在连接异常断开或 `onStoreDocument` 异常时残留，可能跨文档污染。  
**修复方案**:
1. `onStoreDocument` 的 `consumeContributors` 移到 try/catch 外层确保始终消费
2. 添加定时清理：超过 N 分钟未 store 的文档的 contributors 自动丢弃
3. `afterUnloadDocument` 添加 finally 语义确保清理

### P1-3: movePage 缺少事务保护

**文件**: `apps/server/src/core/page/services/page.service.ts` (movePage 方法)  
**问题**: `updatePage` 和 `clearSidebarCategoryForPages` 在不同调用中，无事务边界。页面位置可能更新但分类未清除。  
**修复方案**: 将 movePage 的全部数据库操作包裹在 `executeTx` 事务中。

### P1-4: forgotPassword 无速率限制

**文件**: `apps/server/src/core/auth/auth.controller.ts`  
**问题**: `/auth/forgot-password` 未应用 AUTH_THROTTLER（controller 级别有 SkipThrottle），可被滥用。  
**修复方案**: 为 forgotPassword 端点显式添加 `@Throttle()` 装饰器配置独立限流。

---

## 5. P2 — 中等优先级

### P2-1: MFA 模块加载失败静默跳过

**文件**: `apps/server/src/core/auth/auth.controller.ts:70-90`  
**问题**: MFA 通过 `try { require(...) } catch {}` 懒加载，失败时无告警，MFA 强制被静默绕过。  
**修复方案**: 加载失败时记录 error 级别日志，且在 workspace 配置了 `enforceMfa` 时拒绝登录（而非静默放行）。

### P2-2: Transclusion 同步在事务外运行

**文件**: `apps/server/src/collaboration/extensions/persistence.extension.ts`  
**问题**: `syncTransclusion` 在页面数据已提交后运行。失败时 transclusion 引用丢失且无自动修复。  
**修复方案**: 将 transclusion 同步移入 `onStoreDocument` 的主事务内，或实现幂等修复队列（下次保存时自动收敛）。

### P2-3: CollaborationGateway.destroy 扩展泄漏

**文件**: `apps/server/src/collaboration/collaboration.gateway.ts:202-217`  
**问题**: 每次 destroy 都 push 新 extension 到数组，多次调用导致内存和事件处理泄漏。  
**修复方案**: destroy 前检查是否已存在同名 extension，或使用 Set 去重，或在 push 前清理旧的。

### P2-4: 前端 IndexedDB 持久化未清理

**文件**: `apps/client/src/features/editor/page-editor.tsx`  
**问题**: y-indexeddb 实例在组件卸载时未调用 `destroy()`，快速切换页面可能产生悬挂连接。  
**修复方案**: 在 useEffect 清理函数中显式调用 `indexeddbProvider.destroy()`。

---

## 6. P3 — 代码质量与设计改善

### P3-1: 错误消息格式不统一
**影响**: 前端需处理三种格式（英文文本、错误码、结构化对象）  
**修复**: 统一为 `{ code: string, message: string }` 结构化格式

### P3-2: Tiptap 扩展定义重复
**影响**: 客户端/服务端各维护一份 `tiptapExtensions`，扩展变更需两处同步  
**修复**: 将扩展定义提升到 `packages/editor-ext` 共享包

### P3-3: jsonToText 静默失败
**影响**: 搜索索引内容静默丢失  
**修复**: 失败时回退到基本文本提取（strip HTML tags），保证至少有文本内容

### P3-4: 审计表无自动清理
**影响**: 审计表可能无限增长  
**修复**: 添加 PostgreSQL cron 扩展定时清理或确认 AuditLogCleanupService 的调度可靠性

### P3-5: 编辑器接管覆盖层中文硬编码
**影响**: 国际化不完整  
**修复**: 使用 i18n key 替代硬编码中文

### P3-6: @ts-ignore 清理
**影响**: 类型安全性降低，协作网关等关键路径存在多个 @ts-ignore  
**修复**: 逐项修复类型定义，减少 @ts-ignore 使用

### P3-7: 数据库迁移文件命名不统一
**影响**: 混淆风险  
**修复**: 统一为 UTC 时间戳格式

### P3-8: 批量创建页面无内容大小限制
**影响**: 恶意构造的超大 JSON 可被直接写入  
**修复**: 添加内容大小上限（如 10MB）校验

### P3-9: 分享密码熵值偏低
**影响**: 受保护分享的密码安全  
**修复**: 将密码长度从 8 增加到 12

### P3-10: 前端 Tree Model 不必要的重渲染
**影响**: 性能  
**修复**: update 方法增加相等性检查，patch 无变化时返回原引用

### P3-11: signup 事务外赋值 workspaceId
**影响**: 理论上的竞态风险  
**修复**: 在事务回调内赋值

### P3-12: 服务端日志遗漏上下文
**影响**: 排查困难  
**修复**: 关键日志补充 workspaceId、userId、pageId

### P3-13: 缺少请求体大小限制中间件
**影响**: DoS 风险  
**修复**: 在 Fastify 中添加全局 body limit

### P3-14: 空 catch 块残留
**影响**: 错误被静默吞掉  
**修复**: 所有空 catch 块至少添加 debug 日志

---

## 7. 修复顺序

```
Phase 1 (本周):  P0-1, P0-2, P0-3
Phase 2 (下周):  P1-1, P1-2, P1-3, P1-4
Phase 3 (迭代):  P2-1 ~ P2-4
Phase 4 (债务):  P3-1 ~ P3-14
```

---

## 8. 回滚策略

- 所有 P0/P1 修复通过 feature flag 或独立迁移文件实现，支持快速回滚
- RLS 迁移提供 `down()` 函数
- EditorSession Lua 脚本提供旧版 fallback 路径
