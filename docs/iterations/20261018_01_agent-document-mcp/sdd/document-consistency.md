---
file: docs/iterations/20261018_01_agent-document-mcp/sdd/document-consistency.md
description: 文档级互斥、owner fencing、Yjs持久化日志和版本校验的实现设计。
created_at: 2026-10-18 16:51:24 Asia/Shanghai
updated_at: 2026-10-18 16:51:24 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 已确认PRD、用户选择独立实现、本地38d26266代码审阅、引用的公开标准
applies_to: [sdd]
disclaimer: 文档可能更新，仅供参考；当前代码、产品和源系统事实优先。本文为待工程评审的设计，不代表已实现或已验证。
---

# 文档一致性与互斥

## 1. 两类epoch与一份权威状态

doc_gate每(workspace,page)一行：mode=open/agent/recovering；owner_id、owner_epoch、owner_until；edit_epoch；active_operation_id、agent_fence、agent_until；generation、revision、checkpoint_seq、journal_seq。所有时限用PG clock_timestamp()，所有资格比较在FOR UPDATE锁内。无有效owner时只有取得新owner_epoch的服务可执行协作命令。

owner_epoch是协作节点代际，解决Redis锁失效/进程暂停后的旧owner；edit_epoch是浏览器许可代际，在Agent取得资格或异常恢复时递增；agent_fence是操作尝试代际。三者不得互相代用。generation是文档恢复/重建代际，解决备份回退造成revision重复。

权威内容 = pages.ydoc(checkpoint_seq) + doc_updates中seq>checkpoint_seq的Yjs二进制delta。所有读取、导出、历史恢复、备份与协作加载都必须通过DocumentStateReader或先强制checkpoint。不能把pages.content当作最新事实，也不能让旧onStore覆盖新journal。

这是一套Yjs持久化实现，不是新增协作引擎。扩大到人工入站是为了防止“人已退出但最后一批修改仍只在内存”时Agent读取旧数据库并覆盖。

## 2. 人工许可和Agent资格

人工许可human_permits按workspace/page/user/session/client存储，含opaque permit id、edit_epoch、expiry；允许多个用户人工许可并存。旧单用户租约仍负责同一人的多设备接管，新增门闩负责跨全部用户的Agent排他。

### 获取人工编辑资格

在doc_gate事务中：验证用户会话/ACL、mode=open、owner健康；插入permit，expiry=DB now+30秒，心跳每10秒续期。只读查看不创建permit。获取后前端先追平权威版本再开放编辑。心跳、重连和写入都比较edit_epoch；过期许可不能原地续活，须重新获取。

显式退出先等待已发送更新的持久化确认，再释放permit；服务端持锁删除permit。延迟到达的旧更新找不到permit即拒绝，客户端保留本地恢复草稿。不依赖网络连接数判断有人编辑。

### Agent获取资格

1. 短事务锁doc_gate；mode必须open，owner有效；清理过期permit并检查所有用户的未过期permit，不只检查授权用户。
2. 有人工permit则立即DOCUMENT_BUSY，回退1000–3000ms建议等待；不排后台等待队列。
3. 无人工许可时设置mode=agent、operation id、agent_fence+1、edit_epoch+1、agent_until=now+30秒；原子提交。Agent心跳每5秒续期，只允许当前fence及operation续期。
4. 其后新人工acquire被拒，现有过期浏览器消息因epoch不匹配被拒；read-only可查看。
5. 同文档其他Agent也拒绝。任务超15秒HTTP返回pending；60秒仍未决进入recovering，不盲目释放。

仅锁Redis不足：TTL失效后旧worker仍可能执行。最终PG事务必须核验owner_epoch、agent_fence、mode、operation id、有效期，任一不符全部回滚。

## 3. 人工Yjs入站落盘

适配已安装Hocuspocus 4.0.0的beforeSync：SyncStep1是读取不落盘；SyncStep2和Update携带变更，必须先持久化。文档级进程内串行队列覆盖所有连接及direct命令，不能只信库内“每连接串行”。

1. beforeSync拿到payload，提交给DocumentCoordinator.ingestHumanUpdate。校验payload大小、许可、session、ACL、owner。
2. 基于已持久化序列的隔离Y.Doc应用payload，校验结构；收集实际新增二进制状态，包括pending structs/delete sets。仅在确认二进制状态完全无新增时判定重复no-op，不以JSON相同或没有update事件判定；仍核验许可。
3. PG短事务取workspace安全共享锁、doc_gate排他锁，核验owner、permit epoch/expiry和base revision；写journal、递增journal_seq及revision，记录actor。事务提交失败时不改live doc、不返回同步成功。
4. commit确认后，在同一进程文档队列中把已持久化的原始payload（含pending依赖）应用到live doc，origin标durable-human且带seq；随后beforeSync返回。Hocuspocus默认再次应用同一payload应为Yjs幂等no-op，此行为必须用固定4.0.0版本回归验证，不能直接假定。
5. 若原始payload包含未解析依赖的pending structs，持久化原始二进制并按seq重放，不能只保存可见JSON；候选重建必须覆盖pending/delete信息。结构校验拒绝不可信超大/非法更新；被接受的依赖更新后续仍须合法permit。

实现验证门槛：正确区分sync payload、duplicate/no-op、delete set和依赖更新；onChange不递归写journal；beforeSync抛错后不被库继续apply；两连接交错无丢失。若这些条件在4.0.0不能成立，停止切流并修订adapter，禁止偷偷升级协作栈或fork库绕过评审。

## 4. Agent候选提交

取得资格后，从PG一致性快照读取checkpoint+journal和标题。构造临时Y.Doc，不连接任何客户端；所有operations先校验，再在候选上有序执行。替换仅针对revision绑定的顶层支持区块；嵌套内容作为整块保护。先记录原始区块位置，按稳定引用解析；同批重复replace同一block拒绝，避免位置漂移；append/prepend按输入顺序处理。

生成delta、最终二进制、JSON及text；比较非目标区块结构/标记保留，保护节点不允许替换。Y.Doc.transaction发生异常不会自动回滚，因此必须丢弃整个候选，不能拿live doc做试验。

最终事务完成授权重检、fence重检、expected_revision比较，并原子保存新checkpoint、物化content、history、operation和outbox，详见幂等文件。commit后先将差量同步live doc，再释放Agent资格；若同步失败，operation仍committed但mode=recovering，重载后才开放人工编辑。用户看到成功表示已可靠保存，实时广播暂迟不改写提交结果。

## 5. owner切换与陈旧写阻断

Redis锁改为ownerId+epoch+随机claim token；续期和释放Lua只在value匹配时执行。PG owner租期15秒、每5秒续期；PG才是最终权威。新owner仅在PG锁内确认旧租期过期后增加owner_epoch，重建DB状态并建立新路由。PG不可用时不允许新owner或写入，现有页面保留只读/本地草稿。

旧owner晚到store、旧customEvent、旧人工permit均因epoch/fence或revision不符失败。所有onStore与internal direct调用都必须经过该检查，不能只保护MCP。已提交但尚未广播的delta通过journal/outbox追平；已加载的live doc发现自己owner过期立即关闭连接并废弃，不尝试将旧全量snapshot写回。

网络分区可能短暂显示旧内容，不得以旧显示确认新提交。路由转发校验owner epoch，客户端遇代际变化先保存本地草稿再重连权威状态；不能自动把草稿全文覆盖回来。稳定连接的普通保存ack不重建编辑器；只在已确认会话失效的恢复流程重建provider/state。

## 6. revision与区块引用

revision为PG bigint，用JSON十进制字符串传输（避免JS精度丢失）。每个实际正文二进制变更、标题变更以及恢复推进revision；no-op返回原revision和changed=false。checkpoint压缩不推进业务revision。不可只比较JSON：删除集或Yjs内部变化即使当前呈现相同也须落盘。

编辑token：`rev1.base64url({workspace,page,generation,revision,schemaVersion,contentHash}).HMAC`，HMAC用独立版本化密钥；contentHash=SHA256(规范化Tiptap JSON+标题)。revision承担顺序保证，hash用于快照一致性诊断，不能替代revision。备份恢复切换generation，所有旧token失效。

block_ref：HMAC签名{page,generation,revision,topLevelIndex,nodeType,blockHash}；expected_block_hash必须相等；不接受标题模糊匹配或自造offset。按固定schemaVersion解析。分页cursor绑定同一revision和下一index，最多100块/64KiB响应；途中revision变化返回REVISION_CONFLICT，无拼接不同版本。

get_edit_context可在人工编辑时读取当前已持久化版本，不承诺覆盖客户端尚未提交的键入；Agent执行时仍将被有效permit挡住。preview不拿长期Agent资格，固定版本做隔离演算，不保存、不占日写额度；正式提交重新核验。

## 7. 入口完整性与权限变更

必须盘点并接入：WebSocket、页面update、历史恢复、评论mark、转引维护、导入覆盖、内置AI、附件关联节点、删除/移动/复制创建。内部服务无法提供用户permit的命令使用受控system principal，通过文档门闩排他执行并审计，不允许通用skipGuard。

ACL变化与写入锁顺序见permission-security。父目录删除/移动与create同样锁父门闩及pages行；创建前后检查space与folder类型，父节点受保护时拒绝。批量移动/删除按page ID排序拿锁，遇Agent占用整批拒绝，不能部分越过。

## 8. 人工保存确认

Yjs sync完成或WebSocket发送成功不等于保存成功。新增协作stateless消息durable_ack，包含client_update_id、generation、edit_epoch、journal_seq、revision；客户端更新包用稳定随机client_update_id关联，服务端在PG提交后发送ack。重发同ID必须核对payload hash，同ID不同内容拒绝；journal保留相应去重映射直到该会话重放窗口结束，checkpoint清理不能提前删除。原始Yjs消息与关联ID必须作为同一入站信封解析，不通过易错的“下一条消息ID”旁路配对。

客户端只有收到匹配的durable_ack才清除该更新的未保存标记；后续输入保留未保存状态。ack丢失以同ID及原payload重发；owner切换后先查已保存序列，epoch变化不得盲目发送旧草稿。协议信封在现有Hocuspocus/WebSocket适配层实现，仍使用同一Yjs引擎；其可行性纳入T01验证。服务端不支持此协议时客户端不可获得新人工许可。
