---
file: docs/iterations/20261018_01_agent-document-mcp/test/deployment-legacy-regression.md
description: 首次部署中发现的旧协作文档 JSON 回退覆盖与重复正文回归证据。
created_at: 2026-10-19 15:28:00 Asia/Shanghai
updated_at: 2026-10-19 15:28:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 当前代码、隔离浏览器及 PostgreSQL 回归、部署备份比对
applies_to: [test, operations, release]
disclaimer: 文档可能更新，仅供参考；当前代码、产品行为与原始证据优先。
---

# 协作加载期间禁止 JSON 回退写入

首次发布已部署 MCP 代码和五项迁移，但生产数据库账号仍为 superuser，因此 DOCUMENT_COMMAND、OAuth、Agent 留存及遥测开关保持关闭，不绕过数据库角色检查。本次部署不等于公开 MCP 放行。

## 问题与根因

线上页面验收发现一篇文章正文重复两遍。数据库二进制含 84 个节点，两个 42 节点分组结构完全一致，文本是部署前备份的两倍。旧 Y.Doc 节点身份全部被重新生成。

旧文档在协作尚未连接时允许进入 LocalFallbackPageEditor。该编辑器正常化初始 JSON（包括属性和节点 ID），卸载时将正常化差异当作用户修改，调用 pages/update 重建 Y.Doc。重新生成的结构身份与 IndexedDB 旧缓存合并会重复正文。之前端到端用例开启 DOCUMENT_COMMAND，未覆盖本次生产采用的开关关闭路径。

只在显式关闭协作时启用本地 JSON 编辑器。启用协作但连接尚未完成时保留预览，由 Y.Doc 路径获得编辑权；不改变已建立协作编辑器的身份。

## 回归证据

`P2_LEGACY=true` 使用全新本地 PostgreSQL 16、隔离 Redis、完整 Nest 应用、真实无头 Chrome，DOCUMENT_COMMAND=false。

- 阻断 websocket，打开旧文档、等待、离开页面；断言零正文 REST 写入、数据库 Y.Doc 字节不变。
- 恢复 websocket，两次打开文档；验证可编辑、无页面加载失败，已存二进制与原始缓存合并仍只有一份正文。
- 修改前测试失败，捕获两次无人编辑的 pages/update 正文覆盖。
- 修改后测试通过；报告见 p2-legacy-jest-results.json 和 p2-legacy-runtime.json。
- 客户端与服务端构建、ProseMirror 单例及实时部署检查通过。全套 MCP 回归另外运行。

## 定向修复与边界

服务器部署前备份位于 `/root/backups/docmost_20261019_145423`，保留全库及附件；定向修复另存完整修复前行和二进制，不修改其他文档或删除历史。

修复需先验证：两个节点分组完全相同、二进制与 JSON 一致、单份文字与备份一致；导入备份旧结构身份，在当前 Y.Doc 中仅删除重复节点并保留墓碑，再验证当前缓存与备份缓存重放均不产生重复。写入前短暂停止本应用以排除内存旧文档覆盖；行锁、预演 hash 和精确旧二进制比较共同防止覆盖并发修改。同事务更新 Y.Doc、物化 JSON 和搜索正文，并读回验证。任一前置不符即终止。

预演通过不代表已执行；最终执行结果、发布 SHA 和线上复验记录以 PR 部署记录及服务器 repair-applied.json 为准。未知的其他旧浏览器缓存仍需观察；不能声称任意历史缓存已被验证。
