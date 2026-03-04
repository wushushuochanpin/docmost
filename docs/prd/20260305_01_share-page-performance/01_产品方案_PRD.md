# 01 产品方案 PRD：share-page-performance

**成文日期**：2026-03-05
**最后修订**：2026-03-05

本文档用于定义产品目标、范围与验收标准。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：medium
- 交付模式：package_dir
- 判档依据：分享页首屏性能优化，涉及前端 Chunk 与请求链路，可选后端接口合并，回归范围覆盖分享全链路。

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260305_01_share-page-performance
- 命名规则：YYYYMMDD_index_short-slug

## 背景与目标

### 背景问题

1. 分享页在移动端（微信内置浏览器、H5）打开缓慢，生产构建较开发模式快，但仍明显慢于可接受体感。
2. 用户从分享链接进入时长时间白屏或空白，影响阅读与传播意愿。
3. 根因归纳：单入口全量依赖、ShareShell 过重、只读编辑器与编辑态共用重型扩展、请求链长且无首屏骨架。

### 目标指标（可观测）

| 指标 ID | 指标名称 | 口径 | 目标值 | 观测方式 |
| --- | --- | --- | --- | --- |
| G1 | 分享页首屏可交互时间（TTI） | 从导航开始到主内容可滚动/可读 | 移动端 P75 较优化前下降 ≥ 30% | 本地/实验室 Lighthouse 或 RUM |
| G2 | 首屏体感 | 用户可见非空白内容时间 | 1s 内出现 skeleton 或首屏内容 | 人工/录屏验收 |
| G3 | 功能回归 | 分享页功能与权限 | 与优化前一致，无破坏 | 功能用例 + 回归清单 |

## 系统用户与角色

| 角色 | 目标 | 相关页面 |
| --- | --- | --- |
| 外部访问者（匿名/已验密码） | 通过分享链接快速打开并阅读页面 | 分享页、密码门禁页、错误态页 |
| 产品/运营 | 分享链接在微信等场景下打开速度可接受 | 同上 |

## 典型用户故事与验收

| 故事 ID | 用户故事 | 页面/链路 | 验收用例 |
| --- | --- | --- | --- |
| US-001 | 作为外部访问者，我打开分享链接后能较快看到内容或加载占位，而不是长时间白屏。 | 分享页首屏 | ACC-001, ACC-002 |
| US-002 | 作为外部访问者，我打开的分享页功能与权限与优化前一致（只读、密码门禁、多页树等）。 | 分享页全链路 | ACC-003 |

## 现状审计（As-Is）

### 现有加载与入口

1. 单入口：所有页面共用 `main.tsx`，分享路由 `/share/*` 与主站共用同一 SPA 入口。
2. 首屏同步加载：Mantine 全量 CSS、i18n、PostHog、React Query、主题、BrowserRouter、全局 Provider，然后才进入 App 路由。
3. 分享路由：`ShareLayout`（lazy）→ `ShareShell` + `SharedPage`（lazy）；ShareShell 内同步拉取侧栏树、TOC、ShareSearchSpotlight、主题切换等。

### 现有请求链

1. `/share/:shareId`：ShareRedirect → `useGetShareByIdQuery` → navigate 到 `/share/:shareId/p/:pageSlug`。
2. SharedPage：`useGetShareByIdQuery`、`useSharePageQuery`（依赖 pageId/shareId/accessToken）。
3. ShareShell：`useGetSharedPageTreeQuery`（shareId + accessToken）。
4. 无接口预取或合并，存在多轮往返与重复/串行请求。

### 现有只读编辑器

1. ReadonlyPageEditor 使用与编辑态高度一致的 `mainExtensions`（含协作、评论、Drawio、Excalidraw、表格拖拽、Mention、SlashCommand 等），首屏 JS 体积大。
2. TipTap 需解析整篇 content，大文档在弱设备上解析耗时明显。

### 现有 Loading 表现

1. SharedPage 在 `isLoading` 时 `return <></>`，用户长时间看到白屏或 #app-loading。

## 改造策略确认闸门

- current_stage：production（分享页已有真实流量）
- strategy：hybrid（在现有单入口与 ShareLayout 上做按需加载与拆包，不强制独立 SPA 入口；可选后端接口合并）
- 决策理由：最小侵入、可灰度、可回滚；优先首屏体感与减重，再考虑独立入口与接口合并。

## 能力复用与重复建设审查

- existing_scan：现有分享域（ShareLayout、SharedPage、share-query、ReadonlyPageEditor）全部复用并扩展，不新建平行“轻量分享”产品。
- build_vs_reuse：extend
- consolidation_plan：通过按需加载、只读专用扩展子集、可选合并接口减少请求与首屏体积。

## 目标方案（To-Be）

### 功能与体验总览

1. **首屏体感**：分享页在数据加载中展示 skeleton（标题条 + 正文占位块），1s 内可见，替代白屏。
2. **只读编辑器减重**：为“仅展示”场景提供只读扩展子集（文档结构、标题、段落、列表、表格、图片、链接、代码块等），协作/评论/Drawio/Excalidraw/Mention 等改为按需或从首包剔除，并独立 Chunk。
3. **ShareShell 按需**：侧栏树、TOC、ShareSearchSpotlight 按需加载（如单页分享不拉树、树与搜索 lazy + Suspense）。
4. **请求优化（可选）**：后端支持时，一次接口返回 share 元信息 + 当前页内容（或树节点列表），减少往返；前端在拿到 shareId 后并行预取当前页与树。
5. **可选：分享轻量入口**：`/share/*` 使用独立 entry 仅挂载分享所需最小 Provider 与路由，不加载 PostHog、主站设置等（需构建多 entry 与部署约定）。

### 非功能要求

1. 不改变分享链接 URL 形态与 SEO 行为（除首屏加载方式外）。
2. 与现有 share-link-password-expiry、公开/受限模式完全兼容。
3. 回归：公开分享、受限分享（密码+过期）、多页树、TOC、分享内搜索、主题切换均保持可用。

## 验收标准（摘要）

- ACC-001：移动端（或 4G 模拟）打开分享链接，1s 内出现 skeleton 或首屏内容。
- ACC-002：同一环境 TTI（或 FCP）较优化前有可量化的下降（建议 P75 降 ≥30%）。
- ACC-003：分享页所有既有功能与权限行为与优化前一致，见 06 实施计划中的测试矩阵与回归清单。

## 修改日志

- 2026-03-05：初稿，基于分享页性能根因分析与优化建议整理。
