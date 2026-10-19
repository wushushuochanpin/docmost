---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/permission-security.md
description: 授权边界、并发权限撤销与安全测试设计。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-18 16:56:10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 权限与安全

最终权限是用户当前workspace成员资格、space/page ACL、grant显式空间白名单、grant scopes、client状态、workspace策略的交集。grant不授予用户本身没有的权限。create_page/create_folder检查目标space创建权限及parent ACL；edit/metadata检查页面写权限。操作结果查询既校验操作归属，也校验当前内容读权。

提交事务对workspace_security_versions取共享锁后读取ACL；所有成员移除、角色变更、组成员变更、空间/页面限制、父级权限继承变化、页面移动/删除/恢复都必须先取该行排他锁再修改。涉及跨空间/多页面按统一锁序；不能只在MCP路径补锁。撤销或禁用事务与提交串行，先获得锁并提交的一方定义先后：撤销确认后不得出现基于旧授权的新提交；此前已经提交的效果不自动撤回。

scope不能来自模型提示、请求正文actor字段或工具描述。禁止token透传给内部API、禁止以管理员身份代执行。浏览器Cookie和旧API key不能进入Agent写认证。工具返回的文档内容是用户数据，不能被解释为扩大权限的指令。第三方client名称及URL必须转义，授权页显示真实站点、空间和写权限，默认不选写权限。

授权请求绑定登录会话、nonce及CSRF；redirect严格白名单，不允许通配、片段、开放跳转。state原样返回但不记录日志。发现文档只使用受信任部署issuer，不能根据未经校验Host/X-Forwarded-Host生成。token endpoint限速，错误不泄漏code是否存在；secret不进前端持久存储。refresh重放撤销族，审计记录原因。

跨租户负例必须覆盖工具、分页游标、block_ref、version_token、operation_id、history、outbox和后台任务。日志只放operation_id、grant_id、user_id、workspace_id、错误码和耗时；正文与凭证使用默认脱敏。数据库、备份和内部传输遵守现有加密配置，应用payload密钥轮换有旧key读取窗口。

来源约束：独立实现依据公开MCP/OAuth规范与本项目合法使用的社区代码；不复制apps/client/src/ee等商业授权代码，不访问未获授权的私有后端，不绕过付费校验。公开可见性不构成生产使用许可。上游许可证条款参考[Docmost Enterprise Edition License](https://docmost.com/enterprise-edition-license)；若未来希望复用某段商业实现，应先取得覆盖该用途的书面授权并单独评审。
