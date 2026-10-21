---
file: docs/iterations/20261018_01_agent-document-mcp/public/client-compatibility.md
description: 真实 Codex 与独立 MCP SDK 客户端的支持范围及未验证边界。
created_at: 2026-10-19 14:23:27 Asia/Shanghai
updated_at: 2026-10-21 10:45:18 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认 PRD/SDD、当前 OAuth/MCP 代码和本地验收结果
applies_to: [test, server]
disclaimer: 文档可能更新，仅供参考；当前代码、产品与原始验收证据优先。未部署，文中 HOST 为占位地址，不是已开放服务。
---

# 客户端兼容矩阵

本地验证时间：2026-10-19T06:20:04.226Z。环境为 Node 22.23.3、隔离 PostgreSQL 16.14/Redis 7.4.4、完整编译应用和真实浏览器许可页面，未使用业务库或公网部署。

| 客户端 | 精确版本/协议 | 已验证 | 限制 |
|---|---|---|---|
| Codex app-server | codex-cli 0.163.0-alpha.10.2；Streamable HTTP；服务端实测协议头 2024-11-05、2025-06-18（包含发现/协商与工具阶段） | 发现、PKCE、浏览器许可、11 工具发现、文件夹/文档创建、编辑、同键重试、持久化查询、读回、关闭写入后读取保留、撤销后拒绝 | 使用 app-server 工具调用接口，无模型推理；临时配置，非永久桌面连接；公网和代理待测 |
| MCP TypeScript SDK 示例 | SDK 1.29.0；实际协商 MCP 2025-11-25 | 发现、PKCE、浏览器许可、11 工具发现、文件夹/文档创建、预览、编辑、创建/编辑同键重试、读回、结果查询、撤销及旧 access/refresh 拒绝 | 独立 SDK 客户端，不是第二个商业 Agent 产品；令牌仅在内存 |
| 原 API key 客户端 | 现有四工具合同 | P0/P1 回归中的原四工具兼容 | 不提供新增 OAuth 写工具 |
| 其他 Agent 产品/版本 | 未执行 | 无 | 不宣称兼容，不提供猜测配置 |

两种独立客户端实现已经完成本地流程，符合用户此前接受的本地客户端试用口径。只有 Codex 属于真实安装产品；不能把 SDK 示例称为已完成第二个产品试用。支持范围不等于所有 OAuth/MCP 特性：当前管理员预登记、不提供 DCR/metadata URL 登记、非 SSE 长连接服务。

## 实测中修复的接入细节

- Codex 避免手工重复 oauth_resource，由服务发现确定 resource；重复参数仍由服务端拒绝。
- SDK 通过 auth(provider, { serverUrl, scope }) 主动请求所需写 scope，避免仅继承最低 knowledge.read 挑战。授权浏览器 state 与 PKCE 由示例/SDK 分别校验。
- 回环授权完成后关闭监听及浏览器预连接 socket，避免示例已成功但进程不退出。没有以放宽 OAuth 校验解决兼容问题。
- 完整写入示例必须显式提供 --exercise-writes 和 --space，不在默认读取模式写入用户文档。

## 复现与证据

在已准备 P0 隔离工具链及完整构建的仓库，用 Node 22 设置 P2_ACCEPTANCE=true、P0_PG_BIN、P0_REDIS_BIN、P0_OAUTH_MODULE，运行 apps/server/test/agent-mcp-p0/run.mjs；P2_CLIENTS_ONLY=true 可只跑完整应用中的客户端/诊断路径。固定版本、环境和结果分别保存在 [Codex](../test/p2-codex-probe.json)、[SDK](../test/p2-sdk-probe.json)、[运行环境](../test/p2-runtime.json)、[完整测试](../test/p2-jest-results.json)。

部署后需重跑真实域名和代理路径，再发布对外支持声明。外部客户端版本升级、不同浏览器/操作系统及第二商业客户端仍需单独记录，不能据本机结果推断。

Codex 协议头由完整应用测试的独立 Node preload 观察器记录，只输出版本字符串，不记录请求体、Cookie 或 Authorization；多个阶段出现不同版本，不把最初探测头误写成唯一协商版本。观察器仅由隔离测试进程加载，不进入生产应用。


## 2026-10-21 富文档扩展复验

Node 22.16.0、同一 Codex 0.163.0-alpha.10.2 与 SDK 1.29.0 在隔离 PostgreSQL 16/Redis 7.4 上复验通过。工具数量扩展为 12；真实 Codex app-server 额外验证 upload_image 原始 GIF、content JSON 图片/图注/分割线/Mermaid 写入及结构化读回。浏览器单独验证表格和 Mermaid 修改、图注键盘编辑、GIF 原字节下载、刷新后的可编辑性。此条扩展上表的 2026-10-19 基线，生产连接及文章验收另行记录，不把本地通过写成已部署。
