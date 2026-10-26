---
file: docs/iterations/20261026_01_identity-center/release/live-onboarding.md
description: Docmost 真实认证中心登记、运行配置与跳转修复记录。
created_at: 2026-10-26 23:31:00 Asia/Shanghai
updated_at: 2026-10-26 23:31:00 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户接入授权、实际认证中心登记、Kubernetes Secret 和真实 HTTP 验证
applies_to: [identity-center, production]
disclaimer: 以实际发布版本、运行配置和验收结果为准，不以本文替代真实用户扫码与绑定证据。
---

# 真实接入配置

用户在首次功能发布后明确要求继续实际接入。登记独立应用 `app-docmost`、client `docmost-book`，issuer 为当前统一中心 `https://idc-dev.superchat.help`，精确回调为 `https://book.superchat.help/api/identity/callback`，托管 surface 为 `web`，重启入口为 `/login`。仅认证，不配置中心角色或管理授权。

应用 Secret 为 `docmost/docmost-env`；客户端秘密在中心侧的受限文件 `/opt/company-identity-center/pilot/conf/docmost-client-secret` 留存。独立会话加密密钥只存 Kubernetes Secret。凭据位置已登记到项目和用户级索引；任何密钥值均不进入代码或本文。灰度工作区为既有 `superchat`，用户、账号映射和空间权限未自动变更。

登记前备份：`xenzify-dev:/opt/company-identity-center/pilot/backups/docmost-onboard-20261026T152228Z`。原有 9 个应用和 5 份托管策略保持原值。配置替换一度因属主变成 root 导致读取失败，现恢复为服务账号 996:988、权限 600，托管服务已恢复；后续替换必须保留文件属主与模式。

实际中心检查通过：issuer discovery、精确回调、托管事务创建、客户端鉴权、无效令牌拒绝。生产配置已启用，浏览器账户设置可见“鲜知认证中心 / 绑定账号”。个人身份映射仍须用户验证本地密码并完成中心认证，不允许按邮箱自动关联。

# HTTP 跳转修复

线上 `/api/identity/start` 曾返回 `200 + Location`，导致浏览器无法跳转；回调存在同样边界。Nest 预设状态 200，而 Fastify `redirect(url)` 沿用已设置状态。改为四个分支显式 `code(302).redirect(...)`。

实际 Fastify inject 回归模拟 Nest 预设 200，修复前两个用例失败（实际 200、期望 302）；修复后 9 项控制器测试通过，覆盖登录与回调的成功、失败分支。此记录不能替代修复镜像上线后的真实跳转和个人绑定验收。

# 发布耗时边界

前次发布运行 40338197247 的缓存导出耗时 658.1 秒。缓存导出调整为 `mode=min,timeout=2m,ignore-error=true`；镜像推送失败、备份回归失败、迁移失败和上线校验失败仍阻断发布。保留原缓存读取和共享 ARC 路由，不运行额外全量 CI。
