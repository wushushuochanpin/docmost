---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/migration.md
description: 迁移、旧客户端阻断与安全回退方案。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-18 16:56:10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 迁移与兼容

1. M01：追加OAuth/operations/quota/outbox表及索引；默认全部写开关关闭。
2. M02：追加gate/permit/journal/binary history及必要snapshot_revision；不覆盖旧ydoc。
3. M03：补充新表RLS、约束和清理索引，演练完整备份恢复。

以上是迁移批次名，施工时才分配晚于base最新迁移的唯一YYYYMMDDTHHMMSS文件名。不可修改或重命名已合并迁移。大表索引并发创建与迁移事务边界单独处理，backfill分批可重入，不持有全表长事务。

工作区接入前短暂停止该工作区写入，排空现有Hocuspocus保存，读出binary验证schema，再建gate/checkpoint/revision；缺binary或解析失败停止该工作区接入。所有普通REST、协作、历史恢复、导入和后台写入口必须已经改为统一writer与fence校验，才可启用Agent写。只读MCP保持兼容。不能在旧worker仍可写的混合部署里开启互斥保障。

浏览器通过capabilities获得permit_protocol_version。未支持新版许可的旧客户端显示需刷新并保持本地草稿；服务端beforeSync拒绝其写消息。设置为warn-only或关闭旧editor-session功能不豁免新gate。离线重连必须取得新epoch，旧update不得自动重放。节点滚动更新期间先保持Agent写关闭，完成全量新版本与会话排空后再开。

备份必须同时包含pages.ydoc、document_updates、gate checkpoint_seq、operations、history和outbox的一致PG快照。恢复演练重放journal验证内容hash；恢复实例更换generation、撤销恢复点后的令牌/操作执行资格，且不直接对公网开放恢复出来的旧grant。

回退顺序：关闭新授权/新Agent写→查询并排空操作→对每页完成checkpoint→停止协作写并排空连接→校验无journal尾、无recovering→备份→才允许退回不理解journal的旧程序。未满足条件时只能回退到仍支持新持久化协议的兼容版本。保持新表与幂等墓碑，不执行破坏性down migration。若恢复期间存在未知提交，先查明事实，不能用部署回退替代数据恢复。
