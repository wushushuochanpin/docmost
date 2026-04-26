# PRD 包：Move To Dialog — 目录定位移动

**成文日期**：2026-04-20 12:08:54 UTC+8
**最后修订**：2026-04-20 12:08:54 UTC+8

本文档为本专题 PRD 包入口。**阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。**

---

## 文档档位与产物策略

- tier：medium
- package_path：docs/prd/20260420_01_move-to-dialog
- 判档依据：需求涉及新 Modal 组件、最近访问状态管理、URL 解析、跨 Space 二次确认、后端已有接口的前端整合，以及与现有拖拽移动路径的共存关系，不适合单文件描述。

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260420_01_move-to-dialog
- 命名规则：YYYYMMDD_index_short-slug

## 背景

1. 系统现有"移动"入口（页面顶部菜单 Move）只支持将页面移动到另一个 Space，无法选择目标父级位置。
2. 侧边栏树支持拖拽调整父子关系，但拖拽操作在节点层级深、目标远离视口时极不友好。
3. 用户常见场景：把一个文档或文件夹整体移入另一个文件夹，需要精确选择目标位置而不是靠拖拽。
4. 后端已具备 `POST /pages/move`（支持 `parentPageId`）和 `POST /pages/move-to-space` 能力，前端缺少配套 UI。

## 阅读顺序

1. `00_现状审计.md`
2. `01_产品方案_PRD.md`
3. `02_技术方案_架构与接口.md`
4. `03_数据模型与存储设计.md`
5. `04_风控与安全策略.md`
6. `05_时序与状态机.md`
7. `06_实施计划_测试与回滚.md`

## 关键决策

1. 新增独立 `MoveToModal` 组件，与现有 `MovePageModal`（跨 Space 快速移动）并存，后续可合并。
2. 最近访问记录存储于 `localStorage`，按 workspace 维度隔离，不新增服务端接口，最多 10 条 FIFO。
3. URL 粘贴解析在前端完成，兼容 `/s/{space}/p/{title}-{slugId}` 与 `/p/{title}-{slugId}`，再调用现有 `POST /pages/info` 获取页面信息。
4. 跨 Space 移动时在同一 Modal 内追加二次确认，不弹第二个 Modal。
5. 搜索复用现有 `POST /search/suggest`（`includePages: true`），搜索结果通过 `POST /pages/info` 补齐 `nodeType / space / permissions`。
6. 本期后端最小扩展 `POST /pages/move`：允许 `position` 省略或为 `null`，服务端生成目标子树末尾位置；同时补充自身/后代 cycle guard。
7. 现有拖拽、批量移动、旧 `MovePageModal` 路径保留不变，`MoveToModal` 作为补充交互路径。

## 非目标

1. 本期不合并"移动到 Space"与"移动到父级"为同一 Modal（保留兼容期）。
2. 本期不支持批量多选后通过 MoveToModal 移动（批量已有独立的 batch-move 入口）。
3. 本期不在 Modal 内展示完整树形结构浏览器（Notion 树选择器）。
4. 本期不新增服务端"最近访问"接口。
5. 本期不做移动历史 / 撤销移动。
