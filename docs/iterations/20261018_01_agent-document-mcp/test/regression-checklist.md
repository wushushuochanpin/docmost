---
file: docs/iterations/20261018_01_agent-document-mcp/test/regression-checklist.md
description: 既有功能回归范围输入。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-18 16:28:41 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [test]
disclaimer: 本文可能更新，仅供参考；现状以当前代码、产品和源系统为准，拟议行为以正式评审后的需求为准，本文不代表功能已经实现。
---

# 回归输入

status: not_executed，等待实现后执行；以下尚未执行。

- [ ] 现有四个只读工具的参数、默认行为及权限。
- [ ] 根目录只能建文件夹、文件父节点合法、侧栏自动展示。
- [ ] 浏览器人工间正常协作、编辑器实例稳定、实时状态持久化。
- [ ] 受限页面、撤销会话、API Token原有能力无意外扩大。
- [ ] 历史、审计、搜索索引及通知行为可追溯。
- [ ] 改编辑器/打包时执行ProseMirror guard和client build，打开真实文档验证。
- [ ] 改创建链路时执行AGENTS规定的树模型/创建payload测试及client/server build。
- [ ] 改部署/会话时执行realtime deployment guard；测试Redis独立。
- [ ] 新迁移追加且执行migration order guard。
