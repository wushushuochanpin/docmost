---
file: docs/iterations/20261018_01_agent-document-mcp/test/p0-read-permission-matrix.md
description: OAuth 读取权限矩阵、零泄露断言及测试边界。
created_at: 2026-10-19 10:52:42 Asia/Shanghai
updated_at: 2026-10-19 10:52:42 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: oauth-business.spec.ts 的真实 OAuth 与 MCP HTTP 回归、p0-jest-results.json
applies_to: [test, server]
disclaimer: 本文可能更新，仅供参考；当前代码和实际运行结果优先，不代表生产公开放行。
---

# P0 读取权限矩阵

实现：`apps/server/test/agent-mcp-p0/oauth-business.spec.ts` 的 `complete OAuth read-surface permission matrix`。18 个身份/授权状态分别执行 11 种读取请求与操作结果查询，另执行附件读取正向对照和 scope 写入边界检查。结果见 [原始运行记录](p0-jest-results.json)。

| 场景 | 搜索/目录 | 正文/附件 | 既有操作结果 | 写入边界 |
|---|---|---|---|---|
| writer | 可见 | 可见 | 本人结果可见 | pages.edit 不允许 pages.create / folders.create |
| create_only | 可见 | 可见 | 本人结果可见 | pages.create 可新建；编辑/目录创建拒绝 |
| reader | 可见 | 可见 | 本人结果可见 | 真实空间只读权限拒绝编辑 |
| group_reader | 可见 | 可见 | 本人结果可见 | 页面组只读权限拒绝编辑 |
| page_other_user | 过滤或拒绝 | 拒绝 | 脱敏 | 页面仅授权另一用户 |
| other_user | 过滤或拒绝 | 拒绝 | 拒绝他人的操作 | 独立用户、会话、OAuth 授权 |
| ancestor_denied | 过滤或拒绝 | 拒绝 | 脱敏 | 祖先不可遍历 |
| group_removed | 过滤或拒绝 | 拒绝 | 脱敏 | 移出页面授权组立即生效 |
| membership_removed | 过滤或拒绝 | 拒绝 | 脱敏 | 移出空间立即生效 |
| space_not_selected | 过滤或拒绝 | 拒绝 | 脱敏 | 用户未授权该空间 |
| foreign_workspace | 过滤或拒绝 | 拒绝 | 不返回页面 ID/结果 | 显式查询另一工作区已有资源 |
| deleted_page | 过滤或拒绝 | 拒绝 | 脱敏 | 已删除页面 |
| user_disabled | 拒绝 | 拒绝 | 拒绝 | 用户停用 |
| grant_expired | 拒绝 | 拒绝 | 拒绝 | 授权过期 |
| token_expired | 拒绝 | 拒绝 | 拒绝 | access token 过期 |
| grant_revoked | 拒绝 | 拒绝 | 拒绝 | 授权撤销 |
| empty_scope | 拒绝 | 拒绝 | 拒绝 | 空 scope 无读取/编辑权限 |
| client_disabled | 拒绝 | 拒绝 | 拒绝 | 第三方应用停用 |

读取组合：全文搜索、按空间列目录、按父页面列目录、fetch 的 none/metadata/url/inline 四种附件模式、get_page 的 slug_id 与 URL 两种入口、包含子页面的递归 fetch、按父页面范围搜索。操作查询单独核对当前 ACL 与拥有者；失去页面权限后可返回不含结果的状态，但不能返回页面 ID 或原始结果。

每个拒绝组合都断言响应不包含私密标题、正文、附件文件名或图片 base64；搜索/目录不出现目标页面。递归读取保留合法父页时必须过滤私密子页。正向对照先验证附件实际能读取，再撤权并断言附件存储读取方法从未被调用，避免“附件本来就不可用”的假通过。

测试使用真实 PostgreSQL、正式 OAuth 授权/令牌服务、MCP 控制器/guard/gateway/retrieval 和真实 ACL 查询。该矩阵使用最小业务表夹具；图片的外部存储读流替换为固定测试字节，不访问业务存储。完整生产表、密码登录、真实授权页、完整 PageEditor 和历史面板由 `full-app.spec.ts` 独立覆盖；不把两个层次混为一个端到端夹具。
