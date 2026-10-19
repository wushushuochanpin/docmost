---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/data-model.md
description: 授权、文档门闩、操作持久化的数据模型与约束。
created_at: 2026-10-18 16:56:10 Asia/Shanghai
updated_at: 2026-10-18 16:56:10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 数据模型

本节为拟议逻辑模型，不是已执行DDL。UUID由服务生成；时间为PG timestamptz；revision/epoch/seq为bigint，JSON输出十进制字符串。所有租约比较使用数据库时间。现有pages、page_history保持兼容。

| 表 | 必需字段与约束 | 索引及清理 |
|---|---|---|
| agent_clients | id, name, type(public/confidential), redirect_uris, secret_hash(nullable), status, version, created_by | client_id唯一；停用不删除关联审计 |
| agent_auth_requests | id, client_id, redirect_uri, challenge, resource, requested_scopes, state密文, browser_session_hash, expires_at, decision | id唯一；10分钟失效，24小时清理；绑定会话后不可换用户 |
| agent_grants | id, workspace_id,user_id,client_id,scopes,status,version,expires_at,revoked_at | 用户/工作区/status；有效期绝对时间，不能靠刷新延长 |
| agent_grant_spaces | grant_id,workspace_id,space_id | grant/space唯一；同工作区复合外键；空间删除即失权 |
| agent_codes | code_hash,request_id,grant_id,redirect_uri,challenge,resource,expires_at,consumed_at,response_ciphertext | hash唯一；60秒有效；已消费标记保留至少24小时 |
| agent_token_families | id,grant_id,status,last_rotated_at | grant索引；重放撤销整族 |
| agent_tokens | token_hash,kind(access/refresh),family_id,grant_id,resource,expires_at,consumed_at,replaced_by | hash唯一；refresh重放记录保留到族绝对过期后安全清理 |
| workspace_security_versions | workspace_id,epoch,agent_enabled,policy_version | workspace唯一；ACL修改与最终提交的串行化锁 |
| document_gates | workspace_id,page_id,mode,owner_id,owner_epoch,owner_until,edit_epoch,active_operation_id,agent_fence,agent_until,generation,revision,checkpoint_seq,journal_seq | workspace/page唯一；mode与operation一致性check；到期恢复扫描索引 |
| document_human_permits | workspace_id,page_id,user_id,session_id,client_id,edit_epoch,expires_at | 会话/客户端/页面唯一；page/expires_at索引；只在gate锁内增删 |
| document_updates | workspace_id,page_id,seq,revision,update_bytes,owner_epoch,actor_id,received_at,update_hash,client_update_id,client_session_id | page/seq唯一；另有session/client_update_id唯一持久化去重记录（checkpoint后保留至会话绝对失效+24小时）；按page顺序重放；只删除已checkpoint覆盖且过备份安全窗口的记录 |
| agent_operations | id,workspace_id,user_id,client_id,grant_id,tool,idempotency_key,request_hash,payload_ciphertext,status,phase,attempt_epoch,worker_until,page_id,result,error,created_at,committed_at | 幂等复合唯一；pending/worker_until索引；结果30天，tombstone至少180天 |
| agent_history_snapshots | id,operation_id,page_id,side(before/after),generation,revision,ydoc_bytes,history_id | operation/side唯一；与历史恢复记录同周期，默认至少180天 |
| agent_outbox | id,operation_id,kind,payload,created_at,next_attempt_at,attempts | operation/kind唯一；未完成重试索引，内容不放令牌 |
| agent_outbox_deliveries | event_id,consumer,delivered_at | event/consumer唯一；与outbox同步保留 |
| agent_quota_buckets | workspace_id,subject_type,subject_id,bucket_kind,bucket_start,used,reserved | 五元组合唯一；PG条件更新防并发穿透 |
| agent_quota_reservations | operation_id,bucket_id,amount,state | operation/bucket唯一；终态转换只能一次 |

## 事务与安全

所有新业务表带workspace_id；全局client和令牌定位例外必须通过窄接口，不得成为任意跨租户查询通道。令牌hash定位只返回grant/workspace引用，之后进入设置了SET LOCAL租户上下文的事务。新表RLS缺上下文即拒绝；不可照搬允许NULL租户的旧策略。异步worker从操作主键定位后重建用户授权，不能信任队列携带的权限。

锁序固定：client → workspace_security_versions → grant → quota buckets（排序）→ document_gates（页面ID排序）→ operation → pages。读授权锁使用FOR SHARE，撤销/缩权/ACL变更用FOR UPDATE。禁止事务内HTTP、Markdown解析、Yjs候选生成。代码库所有涉及同一资源的路径均须遵守该锁序。

业务外键禁止级联删除审计和幂等墓碑。用户注销后按隐私策略脱敏actor显示字段，保留效果唯一性所需hash。敏感payload用应用密钥加密并标key_version，密钥通过部署秘密配置；hash使用SHA-256，随机高熵token不需可逆存储。client secret使用scrypt并支持轮换双槽短期交叠。日志不记录原文、code、token、Cookie或完整请求体。

新增page同时创建gate、node meta、初始binary和操作结果；任何失败整体回滚。初始generation随机UUID、revision=1；旧页回填从1开始，不将updatedAt推导为revision。数据库恢复必须更换generation，防旧version_token碰撞。旧二进制NULL或无法解析的页进入人工修复列表，不能自动以content覆盖。
