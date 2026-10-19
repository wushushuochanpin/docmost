---
file: docs/iterations/20261018_01_agent-document-mcp/test/p1-codex-integration.md
description: 本机真实 Codex 的 OAuth 与 MCP 文档编辑试用记录。
created_at: 2026-10-19 11:18:28 Asia/Shanghai
updated_at: 2026-10-19 11:56:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 本机 Codex app-server、隔离完整应用测试及 p1-codex-probe.json
applies_to: [server, test, implementation]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本记录不代表完整 P1 验收或生产发布。
---

# 真实 Codex 接入验证

按用户要求，优先使用本机已安装的 Codex，替代仅由自写协议客户端模拟的试用。版本、执行时间与逐项结果见 [机器报告](p1-codex-probe.json) 和 [测试结果](p1-codex-jest-results.json)。

## 接入方式与边界

- 启动完整编译应用，使用独立临时 PostgreSQL、Redis、浏览器测试账号和测试文档，不连接业务数据。
- 通过真实会话下的客户端登记接口注册 public OAuth client。用 Codex 生成的回调路径登记，固定本地回调端口。
- 将 MCP 地址和预登记 client_id 注入真实 Codex app-server 的临时运行配置；不覆盖桌面已有 MCP 配置。
- Codex 执行服务发现、PKCE、回调接收、令牌交换和 MCP HTTP 传输。浏览器完成真实登录及空间、编辑权限许可。
- 工具调用经 Codex 自身的 `mcpServer/tool/call` 接口；本次没有模型推理，没有验证模型自主规划任务的能力，也没有把 MCP 热加载进当前对话。
- 结束后退出测试 Codex 并清理本次登录、隔离应用及数据库。因此这不是留在桌面设置中的长期连接，不能把临时地址作为日常入口。

## 验证步骤

1. 服务发现、OAuth 浏览器授权及工具发现。
2. `get_page` 读取既有文档。
3. `get_edit_context` 获取版本与编辑上下文。
4. `edit_page` 追加测试内容，确认返回 `committed`。
5. 使用同一幂等键重复请求，确认返回相同 operation_id。
6. `fetch` 读回新增内容。
7. `get_operation` 确认持久化状态。

## 实际遇到的兼容性问题

首次同时设置 `oauth_resource` 并使用服务端资源元数据，Codex 生成了重复的 `resource` 参数，服务端正确拒绝。移除手工 `oauth_resource`，由 Codex 自动发现资源后通过；不修改服务端的资源绑定或重复参数校验。

独立启动的 app-server 未继承桌面插件 MCP 的完整配置，仅覆盖其 enabled 会产生缺少 transport 的配置错误。测试将已有 MCP 的基本 transport 与禁用设置一起传入，只对本次子进程生效。

## 尚未覆盖

本次验证真实 Codex 的授权和读写兼容性；P1 工具、管理界面、配额及性能已另由完整回归验证，见 [P1 报告](p1-business-integration.md)。第二个真实产品客户端、模型自主规划及长期连接试用尚未执行。未部署、未发布。

## 复现

在 P0 隔离工具环境中设置 `P1_CODEX_PROBE=true` 运行 `apps/server/test/agent-mcp-p0/run.mjs`，可通过 `P1_CODEX_BIN` 指定 Codex 可执行文件。沿用 P0 的 `P0_PG_BIN`、`P0_REDIS_BIN`、`P0_OAUTH_MODULE` 配置及 Node.js 22。该模式只运行完整应用中的 Codex 探针，并输出独立 P1 报告，不覆盖 P0 验收结果。
