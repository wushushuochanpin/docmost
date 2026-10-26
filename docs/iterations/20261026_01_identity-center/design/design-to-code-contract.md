---
file: docs/iterations/20261026_01_identity-center/design/design-to-code-contract.md
description: 认证入口与绑定的组件、接口及验证映射。
created_at: 2026-10-26 16:17:30 Asia/Shanghai
updated_at: 2026-10-26 16:17:30 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户批准建议、前后端协作合同与当前实现
applies_to: [design, frontend]
disclaimer: 本文可更新且仅供参考，以当前代码、实际产品行为和来源系统为准。
---

# 设计到实现合同

authority_kind: target_stack；入口为既有 React 路由；reuse_level: adapt。用户已授权直接推进已接受方案；新增部分使用现有 Mantine Button、Alert、PasswordInput、Group、Stack，不引入视觉资产或依赖。中心页面是 provider-owned，既有登录页与账户页是产品拥有。

| 验收 | 实现 | 状态/交互来源 | 验证 |
| --- | --- | --- | --- |
| ID-UI-01/02/03 | features/identity/identity-login.tsx | status.enabled；明确用户点击；受控错误文案 | identity-components.test.tsx |
| ID-UI-02 | identity-bootstrap.ts、auth/auth-cookie-lock.ts | Web Locks同名锁；bootstrap.ready/authenticated | identity-bootstrap.test.ts |
| ID-UI-04/05/06 | identity-account.tsx | account.enabled/linked；本地密码验证；绑定返回 | identity-components.test.tsx |
| ID-UI-02/03 | identity-flow.ts | 受限returnTo与错误枚举 | identity-flow.test.ts |
| ID-UI-07/08 | auth/session-lifecycle.ts、lib/api-client.ts | 会话generation；cookie操作锁；失效状态 | api-client.session.test.ts |
| ID-UI-07 | user/user-provider.tsx、editor/page-editor.tsx | 失效事件同步断开socket；私有视图退出 | 静态检查；真实浏览器/服务器撤销待部署验证 |

接口合同新增 POST /api/identity/bootstrap → {ready,authenticated}。仅浏览器具备 Web Locks 时允许中心初始化，同名锁docmost:identity-bootstrap同时覆盖普通登录/退出等写Cookie操作。已经authenticated时直接前往受限本地落点。回调不写Cookie；identity_authenticated=1只是广播缓存失效提示，客户端移除此标记并仍执行/users/me鉴权。绑定保持原会话，identity_linked只在account.linked真实为true时显示成功。

所有错误使用本地映射文案；密码不写日志/URL/存储。状态不伪造，API权限控制仍在服务端。登录/绑定按钮黑色、4px圆角、无新增描边、键盘可操作；断行使用现有流式布局，密码字段420px最大宽度。

验证使用真实渲染的Mantine组件事件，不以直接调用提交函数代替点击。跨标签锁测试为受控串行模拟，不能宣称真实多标签浏览器验收。中心真实扫码、跨产品SSO、微信内H5及撤销传播延迟均需登记环境单独验收。

详见[交互合同](interaction-contract.md)和[状态清单](screen-state-inventory.md)。
