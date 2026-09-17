# Docmost 代码质量债务清理 PRD

**成文日期**：2026-05-26  
**来源**：v0.90.0 深度代码审计 — P3 遗留项  
**依赖**：`PRD-20260526-01-security-stability-hardening` 已完工

---

## 1. 元信息

| 项目 | 内容 |
|---|---|
| doc_id | `PRD-20260526-02-code-quality-debt-cleanup` |
| 版本 | v1.0 |
| 档位 | medium，6 子项分批 PRD |
| 落盘路径 | `docs/prd/20260526_02_code-quality-debt-cleanup.md` |
| 改造策略 | fix — 纯代码质量改善，不变更业务行为 |

---

## 2. 待修复清单

### P3-1: 错误消息格式统一

**现状**: 三个模块使用三种不同错误响应格式：
- Auth：英文自然语言 `'Email or password does not match'`
- Space/Page：错误码字符串 `'SIDEBAR_CATEGORY_LIMIT_EXCEEDED'`
- Share：结构化对象 `{ code: 'SHARE_NOT_FOUND', message: '...' }`

**目标**: 统一为 `{ code: string, message: string }` 结构化格式，前端只需处理一种错误形状。

**影响文件**: `apps/server/src/core/auth/`, `apps/server/src/core/space/`, `apps/server/src/core/page/`, `apps/server/src/core/workspace/` 下的 controller 和 service 层 throw 语句。

**策略**: 
1. 定义统一错误码常量文件 `common/errors/error-codes.ts`
2. 创建 `AppException` 基类接受 `code + message + httpStatus`
3. 逐模块替换现有 throw 语句
4. 前端 error handling 适配新格式

---

### P3-2: Tiptap 扩展定义去重

**现状**: 客户端 `apps/client/src/features/editor/extensions/extensions.ts` 和服务端 `apps/server/src/collaboration/collaboration.util.ts` 各自维护几乎相同的 `tiptapExtensions` 数组。

**目标**: 将扩展定义提升到 `packages/editor-ext/src/lib/` 作为单一真相源，两端引用同一份配置。

**策略**:
1. 在 `packages/editor-ext/src/lib/extensions.ts` 导出 `getTiptapExtensions()`
2. 服务端 `collaboration.util.ts` 改为从 `@docmost/editor-ext` 导入
3. 客户端 `extensions.ts` 改为从 `@docmost/editor-ext` 导入
4. 验证两端构建通过

---

### P3-4: 审计表自动清理

**现状**: `audit` 表有 `workspaces.audit_retention_days` 配置字段，但实际清理依赖应用层 `AuditLogCleanupService` 定时任务。若该服务异常停止，审计表无限增长。

**目标**: 添加数据库层定时清理兜底，使用 PostgreSQL `pg_cron` 扩展（若可用）或确认应用层调度的可靠性。

**策略**:
1. 新增迁移：若 `pg_cron` 扩展已安装，创建定时清理 job
2. 若不可用，在 `AuditLogCleanupService` 添加健康检查日志 + 启动告警

---

### P3-6: @ts-ignore 清理

**现状**: 关键路径存在多处 `@ts-ignore`：
- `collaboration.gateway.ts:34,61,72` — Redis sync 扩展类型
- `collaboration.util.ts` — attachment node attrs 修改
- `page-editor.tsx` — 编辑器配置

**目标**: 消除关键路径的 `@ts-ignore`，用正确的类型断言或接口补全替代。

**策略**:
1. 为 Redis sync 扩展补充类型声明
2. `collaboration.util.ts` 使用 `(node.attrs as any)` 显式断言替代 `@ts-ignore`
3. 编辑器配置使用正确的泛型约束

---

### P3-10: 前端 Tree Model 不必要的重渲染

**现状**: `treeModel.update()` (位于 `apps/client/src/features/page/tree/model/tree-model.ts`) 即使 patch 无实际变化也返回新数组引用，导致 React 不必要的重渲染。

**目标**: patch 无变化时返回原引用，利用 React 的引用相等性优化。

**策略**:
1. `update` 方法在应用 patch 后做浅比较，若所有值不变则返回原 tree
2. 同理检查 `insert`/`remove`/`appendChildren` 的边界行为

---

### P3-14: 空 catch 块 + 日志上下文补全

**现状**: 
- 代码中存在空 catch 块（如 `jwt-auth.guard.ts` 的 cookie 解析）
- 关键日志缺少 workspaceId/userId/pageId 上下文

**目标**: 所有 catch 块至少记录 debug 日志；关键路径日志补充结构化上下文。

**策略**:
1. 扫描所有空 catch 块，添加 `logger.debug()` 或 `logger.warn()`
2. 为 persistence、auth、collab 模块的日志补充 `{ workspaceId, userId, pageId }` 上下文

---

## 3. 执行顺序

```
P3-1 (错误格式) → P3-2 (扩展去重) → P3-4 (审计清理) → P3-6 (ts-ignore) → P3-10 (tree优化) → P3-14 (日志)
```

顺序理由：P3-1 影响范围最大但最独立；P3-2 涉及共享包需优先保证构建；其余按文件耦合度递进。

---

## 4. 验收标准

- `npx nx run server:build` 通过
- `npx nx run client:build` 通过
- `npx nx run @docmost/editor-ext:build` 通过
- 无新增 TypeScript 错误
- 无回归：现有功能不受影响
