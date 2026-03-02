# PRD 包：Mermaid 图表遮罩预览、缩放与下载

**成文日期**：2026-02-28 15:07:59 UTC+8
**最后修订**：2026-02-28 15:07:59 UTC+8

本文档为本专题 PRD 包入口。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：medium
- package_path：docs/prd/20260228_02_mermaid-preview-zoom-download
- 判档依据：仅涉及前端编辑器能力增强，无后端接口与数据迁移，但涉及交互、手势和下载能力，需要产品+前端+测试协作验证

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260228_02_mermaid-preview-zoom-download
- 命名规则：YYYYMMDD_index_short-slug

## 需求摘要（已确认）

1. Mermaid 图在文档中支持单击打开遮罩预览。
2. 预览态支持放大缩小，且支持 Mac 触控板捏合手势。
3. 放大后支持拖拽平移。
4. 支持下载为图片格式，包含 PNG 与 SVG。
5. 关闭预览支持 Esc、点击遮罩、右上角关闭按钮。

## 阅读顺序

1. 01_产品方案_PRD.md
2. 02_技术方案_架构与接口.md
3. 03_数据模型与存储设计.md
4. 04_风控与安全策略.md
5. 05_时序与状态机.md
6. 06_实施计划_测试与回滚.md

## 关键决策

1. 复用现有 `mermaid-view.tsx` 渲染链路，不新增后端接口。
2. 复用 Mantine Modal，不引入重型 lightbox 依赖。
3. 缩放与平移采用前端轻量 transform 状态机实现（`scale + translate`）。
4. 触控板缩放同时支持 `wheel + ctrlKey` 与 Safari `gesture*` 事件。
5. 下载能力在前端本地转换实现：SVG 直接下载，PNG 通过 canvas 转换。

## 非目标

1. 本期不实现旋转、批量导出、裁剪和标注。
2. 本期不改造 Draw.io / Excalidraw 预览交互。
3. 本期不新增服务端导出接口。
