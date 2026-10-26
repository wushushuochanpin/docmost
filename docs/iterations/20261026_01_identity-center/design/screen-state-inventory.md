---
file: docs/iterations/20261026_01_identity-center/design/screen-state-inventory.md
description: 认证接入界面与状态清单。
created_at: 2026-10-26 16:17:30 Asia/Shanghai
updated_at: 2026-10-26 16:17:30 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户批准建议、前后端协作合同与当前实现
applies_to: [design, frontend]
disclaimer: 本文可更新且仅供参考，以当前代码、实际产品行为和来源系统为准。
---

# 界面与状态

| 页面 | 状态 | 数据来源 | 用户动作/退出 |
| --- | --- | --- | --- |
| /login | 身份功能读取中/关闭 | GET identity/status | 原有本地登录继续；不闪现新入口 |
| /login | 身份功能可用 | status.enabled | 点击中心登录→跨标签锁内bootstrap→同源start |
| /login | 正在准备 | POST identity/bootstrap | 提交按钮loading，防重复；失败可重试 |
| /login | 不支持安全准备/准备失败 | Web Locks可用性或请求失败 | 更新浏览器、重试或原有账号登录 |
| /login | 认证失败/未绑定/需额外验证 | 回调受控identity_error枚举 | 重新开始或本地登录；未绑定明确邀请与绑定指引 |
| /settings/account/profile | 加载/关闭 | GET identity/account | 不展示未确认状态 |
| /settings/account/profile | 读取失败 | account请求失败 | 重试；不推断绑定成功 |
| /settings/account/profile | 未绑定 | account.linked=false | 展开密码验证 |
| /settings/account/profile | 输入/提交 | 临时内存password | 验证并继续；取消清空；提交防重复 |
| /settings/account/profile | 验证失败/回调失败 | 服务端状态或错误枚举 | 内联帮助；清空密码后重试 |
| /settings/account/profile | 已绑定/绑定成功 | account.linked=true；回调标记仅提示 | 查看；不提供解绑操作 |
| 私有页面 | 退出中/失败 | 客户端失效状态+注销响应 | 停止实时连接、旧请求；可重试退出 |
| 私有页面 | 其他标签更换账号 | storage generation事件 | 清私有状态；前往登录重取服务端真相 |
| 中心托管页 | 提供方拥有 | 产品仅创建事务并导航 | 由中心处理认证，产品只处理回流 |

2个产品业务页面、1个全局会话隔离视图、1个提供方占位；表中14类状态包含相同结构文案变体。核心动作均有成功、失败、取消或明确终止路径，未增加中心二维码/密码UI。

详见[交互合同](interaction-contract.md)。
