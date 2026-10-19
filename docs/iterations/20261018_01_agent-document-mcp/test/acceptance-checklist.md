---
file: docs/iterations/20261018_01_agent-document-mcp/test/acceptance-checklist.md
description: P0/P1 本地验收通过清单；P2 与生产公开放行未完成。
created_at: 2026-10-18 16:28:41 Asia/Shanghai
updated_at: 2026-10-19 14:47:53 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: 用户于 2026-10-18 确认的需求边界、本次代码审阅、已引用 MCP 官方规范
applies_to: [test]
disclaimer: 本文可能更新，仅供参考；现状以当前代码、产品和源系统为准，拟议行为以正式评审后的需求为准，本文不代表功能已经实现。
---

# 验收检查表

依据[验收标准](../prd/acceptance-criteria.md)，P0 本地验收已通过，P1 本地验收通过，P2 保持未通过。证据与测试边界见 [业务接入报告](p0-business-integration.md) 和 [读取矩阵](p0-read-permission-matrix.md)。

- [x] AC-01 OAuth授权（P0）
- [x] AC-02 资源隔离（P0）
- [x] AC-03 人工互斥（P0）
- [x] AC-04 版本冲突（P0）
- [x] AC-05 幂等重试（P0）
- [x] AC-06 可靠提交（P0）
- [x] AC-07 超时恢复（P0）
- [x] AC-08 复杂内容保护（P0）
- [x] AC-09 目录创建（P1）
- [x] AC-10 工具完整性（P1）
- [x] AC-11 预览（P1）
- [x] AC-12 编辑分页（P1）
- [x] AC-13 连接管理（P1）
- [x] AC-14 菜单权限（P1）
- [x] AC-15 即时撤销（P1）
- [x] AC-16 审计归因（P1）
- [x] AC-17 限额边界（P1）
- [x] AC-18 恢复基线（P0）
- [x] AC-19 旧客户端与租约失效（P1）
- [x] AC-20 容量性能（P1）
- [ ] AC-21 客户端兼容（P2）
- [ ] AC-22 开发者接入（P2）
- [ ] AC-23 停用与运维（P2）
- [ ] AC-24 公开放行（P2）

本轮最终 9 组 118 项及 1 份 Schema 快照通过；证据见 [P1 报告](p1-business-integration.md)。未部署，P2 未放行。

P2 本地准备和部分验证已完成，但 AC-21～24 保持未勾选，部署和公开放行条件未满足。证据见 [P2 准备记录](p2-readiness.md)。

P2 留存清理与监控本地补充见 [验收记录](p2-retention-observability.md)。部署与公开放行仍未执行。
