---
file: docs/iterations/20261026_01_identity-center/prd/change-impact-assessment.md
description: 认证中心接入的change-impact-assessment记录。
created_at: 2026-10-26 16:06:07 Asia/Shanghai
updated_at: 2026-10-26 16:06:07 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户已接受建议、当前源码、认证中心接入指南与核实的协议源码
applies_to:
  - identity-center
disclaimer: 本文仅供参考并可能更新，以当前代码、实际配置和验证证据为准。
---

# 变更影响

分类：cross_surface_change / object_model_change。新增中心身份与本地用户的绑定关系、单次登录事务、随机浏览器会话。

| 区域 | 决策与影响 |
| --- | --- |
| 登录页 | modify；保留密码，灰度加入中心入口；显示过期/取消/未绑定/不可用状态 |
| 账户设置 | modify；显示绑定状态，验证密码后进入中心完成绑定 |
| 托管页 | provider-owned；不在本仓库重建 UI |
| 邀请 | unchanged 主流程；先现有邀请开户再主动绑定，无邮箱自动合并 |
| 本地权限 | unchanged；中心成功不授予工作区/空间/页面权限 |
| 会话 | modify；新增 opaque token，旧带 sessionId JWT 兼容边界以实现为准 |
| 实时链路 | modify；HTTP、Socket.IO、Hocuspocus 的撤销语义统一 |
| MCP | unchanged 授权模型；网页登录回流和禁用回归 |
| 数据 | add；身份唯一键、登录事务、会话 token hash 与中心元数据 |
| 返回导航 | modify；只允许服务端认可的同源路径，不接受任意 callback |
| 测试 | add；安全负例、并发、跨标签、中心故障、旧会话、备份恢复 |
| 旧SSO管理 | unchanged；不将缺少后端的 EE 配置页伪装为已可接入 |

不存在待用户再次批准的默认策略；生产 issuer/client/回调及真实供应商验收属于尚待取得的外部事实。
