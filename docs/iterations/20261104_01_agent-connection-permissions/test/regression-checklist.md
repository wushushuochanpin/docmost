---
file: docs/iterations/20261104_01_agent-connection-permissions/test/regression-checklist.md
description: 回归检查与本次结果
created_at: 2026-11-04 14:39:39 Asia/Shanghai
updated_at: 2026-11-04 15:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 本次候选工作树与隔离测试
applies_to: [agent, mcp, permissions]
disclaimer: 历史通过不代替本次候选；豆包真实客户端仍未验证。
---

# 回归

| 项 | 本次结果 |
|---|---|
| 旧 API token 及非 MCP 调用 | `connection-permissions.spec.ts` 验证 legacy 类型、`/api` 路径仍可认证、MCP 仍只读；通过 |
| OAuth 已授权客户端 | `oauth-business.spec.ts` 全矩阵、刷新/重放/撤销、管理；通过 |
| 手工预登记 Codex | 真实 Codex P2：PKCE、发现、创建/编辑/读回、禁写、撤销；通过（[报告](codex-p2-probe.json)） |
| 浏览器人工协作 | `full-app.spec.ts` 真实登录、编辑器、协作 peer、历史冲突/恢复、移动端、导入、MCP 令牌设置页；通过 |
| 原始只读工具 | `search` / `fetch` / `get_page` / `list_pages` / `list_spaces` 在 legacy 与 OAuth 路径回归；通过 |
| 权限/空间删除 | OAuth 权限矩阵、ACL/空间/成员/组变更、最终提交屏障；通过 |
| 现有备份与恢复 | PostgreSQL 16 + Redis 真实 worker 队列、归档、全新恢复两 workspace + Y.Doc；通过 |
| 迁移 | 69 个迁移全链、顺序检查；通过 |

未执行：业务库迁移、部署、灰度、生产备份 job、真实豆包客户端。
