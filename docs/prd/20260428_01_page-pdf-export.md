# 页面 PDF 导出 MVP PRD

**成文日期**：2026-04-28 22:40:24 UTC+0800
**最后修订**：2026-04-28 22:40:24 UTC+0800

**阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。**

---

## 1. 背景与问题

当前页面右上角的 `Print PDF` 实际调用浏览器 `window.print()`，导出质量受用户本机浏览器、字体、打印驱动影响。已出现中文内容在打印预览中丢失、仅剩数字和项目符号的故障，且页面版式本身也不适合作为正式 PDF 文档。

本需求目标不是继续修补浏览器打印，而是落地一条服务端可控、可复现、可测试的页面级 PDF 导出链路。

## 2. As-Is 现状审计

- 前端打印入口：页面头部菜单直接调用 `window.print()`。
- 现有导出能力：`/api/pages/export`、`/api/spaces/export` 支持 `markdown/html` 压缩包导出。
- 现有可复用能力：
  - `ExportModule`：已有权限校验、二进制下载响应、审计打点。
  - `ShareStaticRendererService`：可将页面内容渲染为稳定的静态 HTML。
  - `DomainService / EnvironmentService`：可生成工作区绝对 URL，用于补齐资源链接。
- 当前缺口：
  - 没有服务端 PDF 生成器。
  - 没有专用的 PDF 排版模板。
  - 前端导出弹窗没有 `PDF` 选项。

## 3. 目标与范围

### 3.1 本期目标

- 为单个页面提供服务端直接生成的 PDF 文件下载能力。
- 保证中文文本在默认 Docker 部署中可稳定导出。
- 生成结果不依赖用户本机浏览器字体和打印机驱动。
- 保持现有 `markdown/html` 导出能力不受影响。

### 3.2 本期不做

- 不做空间级 PDF 导出。
- 不做批量页面合并导出 PDF。
- 不做封面、目录、页眉页脚模板自定义。
- 不做异步任务化、缓存复用、对象存储落盘。
- 不移除现有浏览器打印入口，只降级为兼容能力。

## 4. 复用与新建结论

- `existing_scan`：
  - 复用 `ExportController` / `ExportService` 的权限校验与下载响应模式。
  - 复用 `ShareStaticRendererService` 作为正文 HTML 来源。
  - 复用客户端 `ExportModal` 和 `page-service.ts` 下载能力。
- `reuse / extend / new_build` 结论：
  - `reuse`：权限、审计、下载响应、静态 HTML 渲染。
  - `extend`：现有 `ExportModule` 增加 `PDF` 页面导出分支。
  - `new_build`：新增 PDF 渲染服务与专用模板。

## 5. 用户故事

1. 作为普通页面查看者，只要我有页面查看权限，我可以下载该页面的 PDF 文件。
2. 作为文档维护者，我希望导出的 PDF 中文正常、分页稳定、样式简洁可读。
3. 作为运维/开发，我希望在 Docker 环境中重建后能稳定复现同样的导出结果。

## 6. 信息架构与路由

- 不新增前端页面 route。
- 保留现有导出弹窗，页面类型新增 `PDF` 格式选项。
- 新增后端接口：
  - `POST /api/pages/export/pdf`

`page_boundary_decisions`：

- 页面导出 UI 仍在现有 `ExportModal` 内，不拆新弹窗。
- PDF 仅对 `type=page` 可选；`type=space` 不展示该格式。

## 7. 功能操作说明

### 7.1 页面导出 PDF

- 入口：页面右上角 `Export`。
- 前置条件：用户已登录，且拥有该页面查看权限。
- 操作步骤：
  1. 打开导出弹窗。
  2. 选择 `PDF`。
  3. 点击 `Export`。
  4. 浏览器收到服务端返回的 PDF Blob 并触发下载。
- 异常：
  - 页面不存在：返回 404。
  - 无权限：返回 403/业务拒绝。
  - Chromium 不可用或 PDF 生成失败：返回 500，并输出明确日志。

## 8. 技术方案

### 8.1 服务端生成策略

- 引入 `puppeteer-core` 作为 Node 侧调用层。
- Docker 镜像安装系统 `chromium`，运行时由服务端拉起 headless Chromium。
- 服务端直接构建 HTML 字符串并 `page.setContent(...)`，随后调用 `page.pdf(...)` 生成文件。

### 8.2 HTML 来源

- 正文内容来自 `ShareStaticRendererService.render(content)`。
- 页面标题由服务端追加到模板中。
- 页面内相对资源 URL 在渲染前转换为绝对 URL。

### 8.3 PDF 模板

- 本期使用服务端内置的简洁打印模板：
  - A4 纸张
  - 固定页边距
  - 中文正文/代码字体 fallback
  - 标题、段落、列表、表格、代码块基础样式
- 样式目标是“稳定可读”，不是复刻当前前端交互页面外观。

### 8.4 权限与审计

- 复用现有页面查看权限校验。
- 新增页面 PDF 导出审计事件，沿用 `page.exported`，在 metadata 中记录 `format: pdf`。

## 9. 数据与接口

### 9.1 接口

- `POST /api/pages/export/pdf`

请求体：

```json
{
  "pageId": "uuid"
}
```

响应：

- `200 application/pdf`
- `Content-Disposition: attachment; filename="页面标题.pdf"`

## 10. 风险与回滚

### 10.1 风险

- Docker 镜像体积上升：新增 Chromium。
- 个别复杂节点（如交互块、子页面块）在 PDF 中可能降级展示。
- 远程附件资源若鉴权或地址转换不完整，可能出现图片缺失。

### 10.2 回滚

- 服务端接口和前端选项均为增量能力，失败时可只隐藏 `PDF` 选项并保留旧导出方式。
- 不改动现有 `markdown/html` 导出接口语义。

## 11. 验收标准

1. 页面导出弹窗在 `type=page` 下可选择 `PDF`，在 `type=space` 下不可选择。
2. 调用 `POST /api/pages/export/pdf` 可下载单个 PDF 文件，不是 zip。
3. 中文标题、正文、列表在默认 Docker 部署中显示正常，不出现整段丢字。
4. 代码块、表格、图片在常见内容下可读，不出现严重重叠或空白页。
5. 现有 `markdown/html` 页面导出与空间导出能力保持可用。

## 12. 实施顺序

1. 后端新增 PDF DTO、接口、服务实现。
2. 服务端接入 Chromium 与 HTML 模板。
3. 前端导出弹窗增加 `PDF` 选项与下载调用。
4. Docker 镜像补齐运行依赖并验证。
