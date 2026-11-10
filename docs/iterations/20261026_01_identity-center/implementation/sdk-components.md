---
file: docs/iterations/20261026_01_identity-center/implementation/sdk-components.md
description: Book 统一身份 SDK 的 Cookie 会话与 React 适配边界。
created_at: 2026-11-10 Asia/Shanghai
updated_at: 2026-11-10 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: SDK 发布制品、Book 身份代码与本地测试
applies_to: [implementation, security, identity]
disclaimer: 本文记录实现与验证范围；生产状态以实际镜像和现场验收为准。
---

# 身份 SDK 适配

Book 固定同一次构建的 `identity-server`、`identity-web` 和 `identity-react`，具体不可变版本、源码提交与摘要见 `vendor/identity-sdk/identity-sdk-provenance.json`。构建前脚本校验三包身份、内容、相互依赖及服务端锁定依赖；镜像安装后继续核验重新认证入口和 `undici` 版本。

服务端 SDK 处理重新认证参数与认证时间检查；Book 继续负责 OIDC 事务、账号绑定、邀请、工作区权限、HttpOnly Cookie 和本地会话。Web SDK 协调 Cookie 初始化和导航，Book 注入跨标签页锁、初始化请求和安全返回路径；SDK 不读取或保存凭据。React SDK 负责按钮交互状态与并发点击去重，Book 注入实际操作、错误文案和 Mantine 外观。原有本地账号入口、数据清理、协同连接及会话隔离保持产品侧职责。

不能把 SDK 的 token 版完整登录组件直接替换 Book 的 Cookie 登录流程；账号关联仍需本地证明，不按邮箱、手机号或昵称自动合并。升级需核验登录、失败重试、多标签页、切换账号、已绑定及未绑定身份、受保护 API 和文档协同；真实微信扫码须另行验收。
