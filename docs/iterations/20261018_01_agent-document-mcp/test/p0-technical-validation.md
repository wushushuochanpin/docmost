---
file: docs/iterations/20261018_01_agent-document-mcp/test/p0-technical-validation.md
description: P0技术验证结果、复跑方法与应用放行边界。
created_at: 2026-10-18 17:42:54 Asia/Shanghai
updated_at: 2026-10-19 10:26:14 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户确认的PRD及SDD、本轮本地P0探针与构建记录
applies_to: [server, test, implementation]
disclaimer: 文档可能更新，仅供参考；当前代码和真实测试结果优先。技术探针通过不等于应用集成或产品验收通过。
---

> 本文记录 T01 历史探针范围（47 项）；当前合并测试为 66 项，正式业务新增证据见 [业务接入报告](p0-business-integration.md)。

> 本文保留首轮技术探针的历史范围。当前运行器、结果文件和复现命令已扩展到真实 OAuth、Redis 双节点与浏览器，最新事实请读 [业务接入报告](p0-business-integration.md)。

# P0 技术验证

结论：核心机制技术探针通过，可以继续进行业务集成；应用写入放行仍关闭。本轮没有部署，没有读取项目.env或连接现有数据库，没有注册新业务路由、改变当前编辑器或安装生产运行依赖。代码基线38d26266，当前改动尚未提交；可复现文件摘要见[p0-artifacts.json](p0-artifacts.json)。

## 1. 结果与证据层级

[原始Jest结果](p0-jest-results.json)、[运行环境](p0-runtime.json)为机器证据。47项测试通过；Node22.23.3、PostgreSQL16.14，fsync与synchronous_commit开启；服务端Nest构建和新增领域原语的ESLint检查通过。每次执行创建全新的本地临时PG集群，结束停止并删除，只监听loopback。测试没有使用Redis；本轮证明PG权威锁与事务，不证明既有Redis路由的多节点集成。

| 验收 | 已验证的技术机制 | 层级 | 尚未证明的应用行为 |
|---|---|---|---|
| AC-01 | 真实OAuth5.3.1库S256、回调/resource/scope限制、授权码并发消费、过期、刷新轮换与重放族撤销 | L3+L4 | 登录/MFA、用户同意、发现HTTP/CORS/CSRF、第三方客户端及机密客户端认证 |
| AC-02 | grant用户/client/workspace身份、scope/空间/过期条件重检；令牌只存hash | L4 | 真实页面ACL、组继承、搜索摘要/附件/操作查询与RLS完整隔离 |
| AC-03 | 多PG连接人工与Agent争抢、两Agent互斥、多人工许可、旧owner阻断；实际Hocuspocus消息处理 | L4 | 浏览器交互、跨真实协作节点Redis转发、所有旧writer接入 |
| AC-04 | generation/revision与签名block_ref；候选计算后最终PG复检 | L2+L4 | 全部现有标题/正文/恢复入口自动推进revision |
| AC-05 | 20个同键并发登记、载荷冲突、响应丢失后原键重试；新建/编辑只一次效果 | L4 | 正式MCP DTO、保留期清理、每日配额和批量工具 |
| AC-06 | 内容/历史/operation/outbox同事务；目录元信息约束失败无半创建；提交后PG强制重启；beforeSync失败无apply/ack | L4 | 现有PageRepo同事务改造、生产HA故障切换与前端保存提示 |
| AC-07 | 真实子进程COMMIT前后SIGKILL，旧事务锁排除，租约失效fence、同操作恢复并重新允许人工许可 | L4 | 正式15秒HTTP pending、60秒告警、常驻worker调度与真实网络COMMIT响应丢失 |
| AC-08 | 独立Y.Doc候选替换，表格/附件/评论保护，整批失败不改live、限制输入与批次；pending/delete updates持久化 | L2+L4 | 完整Markdown解析及项目全部Tiptap扩展的文档样本矩阵 |
| AC-18 | before/after二进制快照同事务，重启可恢复，失败无孤立历史 | L4 | 网页历史可见性、归因、后续人工修改后的恢复确认 |

本表是技术验证覆盖，不将PRD产品AC检查框勾为全部通过。P0应用集成门槛仍需完成最右列中属于P0的要求后才能放行；不能直接以本轮47项测试宣布公开功能可用。

## 2. 代码组织

- `apps/server/src/core/document-command/document-candidate.ts`：首个可复用领域原语，只接受已验证内部纯文本区块命令；绑定版本/区块，隔离Y.Doc，不连接Nest路由。公开Markdown工具适配层尚未实现。
- `apps/server/test/agent-mcp-p0/store.ts`、`schema.sql`：真实PG事务探针；表为精简fixture，并非生产迁移或可直接注册的repository。
- `oauth-probe.ts`：真实库和PG model，用户身份与应用登记来自测试fixture；不是正式OAuth入口。
- `hocuspocus.spec.ts`：实际4.0.0 MessageReceiver/Document的协议处理；crossws网络监听器使用仓库既有stub，未声称WebSocket端到端通过。
- `worker.ts`：独立Node进程执行相同Store提交逻辑，被SIGKILL注入崩溃。
- `run.mjs`：新建、运行、停止、清理临时PG，禁止读取或传入业务数据库地址；最多运行120秒。

PG probe使用已安装postgres3.4.8；其TransactionSql类型丢失可调用签名，因此仅在探针中做类型窄桥接，实际query仍使用同一事务连接。生产集成沿用Kysely，不照搬测试型any或精简权限模型。

## 3. 复跑

使用Node22和PostgreSQL16，项目既有依赖已按pnpm10.4.0安装。OAuth5.3.1仅安装在独立工具目录，P0_OAUTH_MODULE指向其绝对目录；P0_PG_BIN指向initdb/pg_ctl/postgres所在目录。不要提供DATABASE_URL，不要加载.env。

```sh
P0_PG_BIN=/absolute/path/to/postgres16/bin \
P0_OAUTH_MODULE=/absolute/path/to/tools/node_modules/@node-oauth/oauth2-server \
pnpm --filter server test:agent-mcp-p0
```

本机使用独立下载的Node22.23.3；直接以该Node运行`apps/server/test/agent-mcp-p0/run.mjs`等价于上面的script。测试工具版本记录在[toolchain.json](../../../../apps/server/test/agent-mcp-p0/toolchain.json)。macOS ARM64使用@embedded-postgres/darwin-arm64@16.14.0-beta.17提供真实PG16.14二进制，包的beta标记属于分发包装；安装时忽略脚本，检查后手动执行包内hydrate-symlinks.js恢复动态库链接。其他平台使用可信的同版本PG本地工具，不要求安装此平台包。

测试首次出现过PG保留字字段命名、postgres事务类型声明和OAuth Request表单元数据问题，均已修复。PG restart的子进程日志现单独重定向，避免管道被数据库进程继承导致测试悬挂。最终证据只对应修复后完整通过的运行。

## 4. 已落实的技术结论

1. Hocuspocus4的beforeSync异常能够阻止默认apply与ack；成功路径先PG提交再apply，默认第二次apply是幂等的。接收器外层需文档级队列，不能只依赖连接队列。
2. 原始Yjs update必须保存pending structs和delete set；JSON相同不证明二进制没有变化。相同update重发不推进revision；相同update_id不同payload拒绝。
3. OAuth库5.3.1可在Node22工作，但不能替代resource、grant和事务设计。拒绝错误必须有选择地保留授权码消费/刷新族撤销，存储异常则回滚。
4. COMMIT未知时必须获得同一门闩/operation锁后再裁定；PG已提交、未发回响应和live同步失败不能改标失败。
5. 当前jsonToNode包含剥离未知节点的容错路径，正式Agent适配器必须使用严格schema校验并保留非目标节点，不能直接复用该容错转换。

## 5. 下一施工切片

按[T02–T04](../implementation/task-breakdown.md)接入真实Kysely模型、所有writer/ACL事务锁、OAuth发现及会话授权，再联调公开工具。前端仍需已评审的可执行原型。维持默认关闭，不部署。完整应用门槛没有因技术探针通过而取消。
