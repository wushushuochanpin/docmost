# PRD 包：Docmost 企业版能力合规替代

**成文日期**：2026-03-08 23:07:46 UTC+8
**最后修订**：2026-03-08 23:56:01 UTC+8

本文档为本专题 PRD 包入口。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：large
- package_path：docs/prd/20260308_05_ee-feature-replacement
- 判档依据：涉及开源许可边界、企业版功能替代、认证与审计安全、多阶段灰度发布，属于高合规与高可用风险改造

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260308_05_ee-feature-replacement
- 命名规则：YYYYMMDD_index_short-slug（short-slug 建议 2-5 词，长度 <= 32）

## 背景

1. 当前自托管实例已升级到 `v0.70.1`，设置页出现 `API keys`、`Security & SSO`、`API management`、`Audit log` 等企业版灰菜单，业务希望获得类似能力。
2. 当前仓库根许可为 `AGPL-3.0`，而 `apps/client/src/ee/` 明确标注受 `SuperChat Enterprise Edition license` 约束，不能把“直接复制企业版代码”当作默认方案。
3. 当前路线已确认：接受 AGPL 网络部署义务，在当前主仓内自研灰菜单对应能力，同时严格禁止复用 `ee` 目录代码。

## 阅读顺序

1. 00_现状审计.md
2. 01_产品方案_PRD.md
3. 08_专项方案.md
4. 02_技术方案_架构与接口.md
5. 03_数据模型与存储设计.md
6. 04_风控与安全策略.md
7. 05_时序与状态机.md
8. 06_实施计划_测试与回滚.md
9. 07_评审意见与回复.md
10. 10_Wave1_实施拆解.md
11. 11_Wave1_开发任务清单.md
12. 09_未来实现草案.md

## 关键决策

1. 不提供任何“规避 AGPL 或企业版许可义务”的实施建议；当前专题只讨论 AGPL 可接受前提下的合规自研路线。
2. 已确认采用“当前 AGPL 主仓内自研替代模块”路线：复用非 `ee` 的 OSS 壳层与上下文，不直接复制 `ee` 目录代码。
3. 每个线上部署版本都必须提供可访问的对应源码获取入口，并保留版本、提交号与源码归档映射。
4. 首期交付范围锁定为 `Token + Audit`；`OIDC` 放入下一阶段。
5. 源码获取入口锁定为“设置页入口 + /api/version.sourceUrl”，不在登录页额外暴露。
6. 设置页源码入口文案默认采用 `Source Code`；现有菜单中文名称保持当前信息架构不变。

## 非目标

1. 不在本专题中复刻计费、License 激活、Cloud 专属能力。
2. 不在本专题中输出可直接复制企业版源码的实现草案。
3. 不在本专题中把 `page-level permissions`、`attachment full-text search`、`Confluence/DOCX import` 一次性全部纳入首期交付。
