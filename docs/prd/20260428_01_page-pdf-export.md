# 页面 PDF 导出 PRD

**成文日期**：2026-04-28 22:40:24 UTC+0800
**最后修订**：2026-04-28 23:35:00 UTC+0800

**阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。**

---

## 1. 背景与问题

原页面菜单"打印 PDF"调用 `window.print()`，中文内容在浏览器打印预览中大量丢失。

**Phase 1（已完成）**：落地服务端 Puppeteer PDF 导出，解决中文乱码问题，用户可通过"导出 → PDF"下载文件。

**Phase 2（本次）**：提供可视化打印预览页，用户在下载前可调整页边距、纸张大小、方向，预览满意后直接调用浏览器打印（可选打印机或"另存为 PDF"）。

---

## 2. As-Is 现状（Phase 1 完成后）

- `POST /api/pages/export/pdf`：服务端 Puppeteer 生成 PDF，返回文件流。固定 A4、固定页边距，不可预览调整。
- 菜单"打印"：仍调用 `window.print()`，页面样式不适合打印，字体依赖系统。
- 用户诉求：希望打印前能看到效果，并能调整页边距。

---

## 3. 目标与范围

### 3.1 Phase 2 目标

- 新增打印预览页，登录用户可在页面菜单"打印"处直接进入。
- 预览页支持调整：页边距（三档预设 + 自定义）、纸张大小（A4 / Letter / A3）、方向（纵向 / 横向）。
- 使用 `@font-face` 显式加载 Noto Sans SC，彻底解决浏览器打印中文乱码。
- 用户点击"打印"后浏览器弹出打印对话框（可打实体机，也可"另存为 PDF"）。
- 保留 Phase 1 服务端 PDF 下载入口，两条路径并存。

### 3.2 本期不做

- 不做页眉页脚内容自定义。
- 不做封面、目录。
- 不做批量/空间级打印。
- 不做打印预览分页精确计算（依赖浏览器分页）。

---

## 4. 复用与新建结论

| 类型 | 内容 |
|---|---|
| reuse | `pageAccessService.validateCanView` 权限校验 |
| reuse | `ShareStaticRendererService` 渲染正文 HTML |
| reuse | `PdfExportService.hydrateDocumentHtml` 图片内联、URL 补全 |
| extend | 新增 `GET /api/pages/:pageId/print` 接口返回渲染后 HTML |
| new_build | 前端打印预览页路由 `/print/:pageId` + 工具栏组件 |

---

## 5. 用户故事

1. 作为文档查看者，我希望点击"打印"后看到排版预览，确认中文显示正常再打印。
2. 作为用户，我希望能调小页边距让内容更紧凑，或选 A3 打印大表格。
3. 作为用户，我既可以打到实体打印机，也可以选"另存为 PDF"保存到本地。

---

## 6. 信息架构与路由

### 新增前端路由

```
/print/:pageId
```

- 登录态访问，无权限返回 403 提示。
- 在新标签页打开（`target="_blank"`）。
- 打开后隐藏应用导航栏，只显示打印预览工具栏 + 内容。

### 新增后端接口

```
GET /api/pages/:pageId/print
```

响应：

```json
{
  "title": "页面标题",
  "bodyHtml": "<article>...</article>"
}
```

- 权限：需登录且有页面查看权限。
- `bodyHtml` 已完成图片内联（base64）、相对 URL 转绝对 URL。

### 菜单入口变更

- 页面菜单"打印" → `window.open('/print/:pageId', '_blank')` 替换原 `window.print()`。

---

## 7. 功能操作说明

### 7.1 打印预览

- 入口：页面右上角菜单 → **打印**。
- 前置条件：用户已登录，有页面查看权限。
- 操作步骤：
  1. 新标签页打开预览页，顶部显示工具栏，下方显示内容预览（白色 A4 纸张样式）。
  2. 工具栏可选：纸张（A4 / Letter / A3）、方向（纵向 / 横向）、页边距（窄 10mm / 标准 20mm / 宽 30mm / 自定义）。
  3. 调整时内容区实时更新。
  4. 点击"打印"按钮，浏览器弹出打印对话框。
- 异常：
  - 页面不存在：显示 404 提示。
  - 无权限：显示 403 提示。
  - 内容加载失败：显示错误提示，提供重试按钮。

---

## 8. 技术方案

### 8.1 后端

- 新增 `PrintController`（或在 `ExportController` 增加路由），`GET /api/pages/:pageId/print`。
- 复用 `PdfExportService` 的 `renderAllSegments` + `hydrateDocumentHtml`，返回 `{ title, bodyHtml }` JSON。
- 权限沿用 `pageAccessService.validateCanView`。

### 8.2 前端预览页

- React 路由 `/print/:pageId`，组件 `PrintPreviewPage`。
- 页面挂载后请求 `/api/pages/:pageId/print`，将 `bodyHtml` 注入预览区域（`dangerouslySetInnerHTML`）。
- 工具栏状态（paperSize / orientation / margins）保存在组件 state，用 `useEffect` 同步更新 `<style id="print-page-style">` 中的 `@page` 规则：

```css
@page {
  size: A4 portrait;
  margin: 20mm 20mm 20mm 20mm;
}
```

### 8.3 字体加载

- 在预览页 `<head>` 中通过 `@font-face` 加载 Noto Sans SC（Google Fonts CDN 或本地 `/fonts/` 路径）。
- `@media print` 中同样声明字体，确保打印时生效。
- 代码字体加载 Noto Sans Mono CJK SC 或 JetBrains Mono。

### 8.4 预览样式

- 内容区域用 `box-shadow` 模拟纸张，居中展示。
- 工具栏 `position: sticky; top: 0` 始终可见，`@media print` 时隐藏。
- 纸张宽度根据所选 size + orientation 动态计算：

| 纸张 | 纵向宽度 | 横向宽度 |
|---|---|---|
| A4 | 210mm | 297mm |
| Letter | 216mm | 279mm |
| A3 | 297mm | 420mm |

---

## 9. 数据与接口

### 9.1 接口

**GET /api/pages/:pageId/print**

Headers: `Authorization: Bearer <token>` / Cookie

响应 200：

```json
{
  "title": "string",
  "bodyHtml": "string"
}
```

---

## 10. 风险与回滚

### 10.1 风险

- Google Fonts CDN 在某些网络环境下不可访问 → 兜底：字体文件本地化到 `/public/fonts/`。
- `dangerouslySetInnerHTML` 注入 bodyHtml → 服务端已通过 `ShareStaticRendererService` 净化，风险可控。
- 部分复杂节点（交互块）在静态 HTML 中降级展示 → 与 Phase 1 一致，可接受。

### 10.2 回滚

- 预览路由和接口均为增量，失败时菜单"打印"可回退至 `window.print()`。
- 不影响 Phase 1 服务端 PDF 下载路径。

---

## 11. 验收标准

1. 点击页面菜单"打印"，新标签页打开预览页，内容正确加载。
2. 工具栏切换纸张/方向/页边距，预览区域实时更新。
3. 中文正文、标题、代码在预览页显示正常，无乱码。
4. 点击"打印"弹出浏览器打印对话框，选"另存为 PDF"后文件中文正常。
5. 无权限时预览页显示 403 提示，不暴露内容。
6. Phase 1 的"导出 → PDF"下载路径不受影响。

---

## 12. 实施顺序

1. 后端新增 `GET /api/pages/:pageId/print` 接口（复用现有 HTML 渲染逻辑）。
2. 前端新增 `/print/:pageId` 路由与 `PrintPreviewPage` 组件（工具栏 + 内容区）。
3. 字体文件本地化到 `/public/fonts/`，在预览页加载。
4. 页面菜单"打印"改为新标签页打开预览。
5. 联调验证，补充 `@media print` 样式细节。

---

## 附：Phase 1 已完成内容（供参考）

| 项目 | 状态 |
|---|---|
| `POST /api/pages/export/pdf` 服务端 PDF 下载 | ✅ |
| PdfExportService（Puppeteer + A4 模板 + CJK 字体 fallback） | ✅ |
| ExportModal 增加 PDF 选项（page 类型） | ✅ |
| Dockerfile 安装 chromium + fonts-noto-cjk | ✅ |
| 权限校验 + 审计日志 `format: pdf` | ✅ |
