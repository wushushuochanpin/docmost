---
file: docs/iterations/20261026_01_identity-center/implementation/login-performance-20261113.md
description: 认证中心登录链路的浏览器与服务端耗时埋点候选。
created_at: 2026-11-13 Asia/Shanghai
updated_at: 2026-11-13 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 2026-11-13 用户登录缓慢反馈与当前 main 源码
applies_to: [identity-center, observability]
status: draft_unverified_not_deployed
disclaimer: 仅供参考；运行测试、构建和部署未完成。
---

# Docmost 登录耗时诊断

本次只增加分段诊断，保持现有认证/授权、超时、兑换次数、回调顺序及在线撤销检查。

- 浏览器 sessionStorage 的 docmost.identity.timings.v1 保存最多 64 条固定阶段、时间戳、耗时、成功/失败；包含 Cookie 锁等待、bootstrap、点击到发起导航。它不包含后续顶层导航时延，不包含身份信息/URL/凭据；存储失败不会阻断登录。
- bootstrap/start/link_start/callback 返回 Server-Timing 和随机 X-Identity-Request-Id。总耗时是控制器内操作，不含前置 guard、Nginx 排队、传输。
- 服务端 identity_login_timing 记录总耗时和 discovery、hosted_create/complete、token_exchange、session_verify、introspection、userinfo、account_headers、account_body 等阶段。
- AsyncLocalStorage 隔离同时进行的登录；核验嵌套在回调里时共享该诊断编号；回调外核验自建编号。已有 discovery 缓存和在途检查合并保留。
- centerRequestIds 仅接受中心响应中的 UUID，连接中心 hosted_login_timing 日志。编号不来自 OAuth state/短链接/令牌。
- 三项远程核验本来已并行，不能将子耗时简单相加；失败汇总可能早于其他并行调用结束，不改变 Promise.all 的原有失败时机。
- token_exchange 包含 OIDC 库完成授权码兑换和必要的密钥获取/验证；此版不单独拆 JWKS。userinfo/introspection 计时包含对应库调用，account_headers 与 account_body 分开。

## 使用

部署通过验证的候选后，从正常 Docmost 登录入口发起新事务，用浏览器 Network（Preserve log）对照 Server-Timing 与两端随机诊断编号。分别记录点击到中心可操作、扫码确认到产品可操作，扫码人的等待单列。
浏览器前置等待可在回到 Docmost 后读取：

```js
JSON.parse(sessionStorage.getItem("docmost.identity.timings.v1") || "[]")
```

中心配套候选提供 window.__idcLoginDiagnostics()；其采样/优化说明位于 company-identity-center 同日期实施文档。没有收集用户输入、身份、正文或完整 URL，没有新增第三方遥测服务。

## 验证状态

本机执行环境 unavailable，未运行测试、未构建、未部署。待恢复执行：

```sh
pnpm --filter server test --runInBand identity.timing.spec.ts identity.provider.spec.ts identity.service.spec.ts identity.controller.spec.ts
pnpm --filter client test src/features/identity/identity-bootstrap.test.ts src/features/identity/identity-service.test.ts
pnpm --filter client build
pnpm run server:build
```

新增测试检查并发隔离、结果/异常原样返回、凭据不进入日志、日志/响应头写入失败不干扰认证。不得把静态审阅或测试文件存在当作已通过。回退仅撤回本候选代码；无数据迁移。
