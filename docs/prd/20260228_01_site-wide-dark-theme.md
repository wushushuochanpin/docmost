# PRD：全站深色/浅色主题

**成文日期**：2026-02-28 02:00:00 UTC+8  
**最后修订**：2026-02-28 12:00:00 UTC+8  

本文档用于记录本次需求或开发交付。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：small
- 交付模式：single_file
- 判档依据：仅前端样式与 CSS 变量改造，无接口/数据表/权限变更，单团队、低风险、可快速回滚。

## 存储路径与命名规范

- root_path：docs/prd
- package_name：20260228_01_site-wide-dark-theme.md
- 命名规则：YYYYMMDD_index_short-slug（short-slug 建议 2-5 词，长度 <= 32）

## 背景与目标

### 背景问题

- 产品已有主题切换能力（顶部菜单 / 账户偏好中可选择 Light/Dark/System），且 Mantine 已将 `data-mantine-color-scheme` 与 CSS 变量注入到 `:root`，机制上为全站级。
- 实际观感上“只有编辑页在切换”：编辑区使用 Mantine 的 `light-dark()` 与 `@mixin dark` 随主题变化；其余页面（壳、侧栏、设置、按钮、输入框等）使用自定义 token（`--ui-bg-surface`、`--ui-text-primary`、`--ui-border-default` 等），这些 token 在 `mantineCssResolver` 中仅定义了浅色值，`dark` 分支为空，导致深色模式下仍为浅色。

### 目标指标

- 浅色：全站统一浅色（白/浅灰底、深色字、浅色边框）；可选「柔和浅色」变体（更柔背景）。
- 深色：全站多种色系可选：默认黑灰（IDE 风）、蓝灰（Slack/GitHub 风）、暖灰/琥珀（护眼）、绿色终端风；与编辑区视觉一致。
- 切换入口与持久化：顶部菜单 Theme、账户偏好中提供「主题 + 色系」联合选项（Light / Light (Soft) / Dark / Dark (Gray) / Dark (Blue) / Dark (Warm) / Dark (Green) / System），偏好持久化到 localStorage（Mantine 存 colorScheme，应用存 app-palette）。

## 现状审计（As-Is）

- 现有页面/交互：ThemeToggle、TopMenu 子菜单「Theme」、AccountTheme（账户偏好）均调用 `setColorScheme(light|dark|auto)`；编辑页内样式通过 `light-dark()` / `@mixin dark` 已随主题变化。
- 现有接口/数据表/权限：无；主题为纯前端状态，无后端接口与数据表变更。
- 现有样式与变量：
  - [apps/client/src/theme.ts](apps/client/src/theme.ts)：`mantineCssResolver` 的 `variables` 中定义全部 `--ui-*`（仅浅色值），`light` 中覆盖 `--mantine-color-body` 等，`dark: {}` 为空。
  - [apps/client/src/styles/ui-refresh.css](apps/client/src/styles/ui-refresh.css)：`:root { color-scheme: light; }` 写死；body 及全局组件使用 `var(--ui-bg-surface)`、`var(--ui-text-primary)`、`var(--ui-border-default)` 等。
  - 侧栏、Header、设置、按钮、输入框、Modal、Menu 等均通过上述 token 消费颜色。

## 改造策略确认闸门

- current_stage：pre_production
- strategy：migrate（在现有 resolver 上扩展 dark 分支，不删除既有 light 定义）
- user_confirmation：confirmed
- 决策理由与回退约束：无破坏式变更；回滚即恢复 `dark: {}` 为空并移除 color-scheme 覆盖即可。

## 能力复用与重复建设审查

- existing_scan：已有 Mantine 主题机制、ThemeToggle/AccountTheme 入口、全站使用的 `--ui-*` token 体系。
- build_vs_reuse：extend
- consolidation_plan：在既有 token 上增加深色取值，不新增平行主题系统。

## 设计理念与决策记录

- 设计目标：全站视觉随主题一致切换；不改变交互与入口。
- 方案对比：A）仅改 body 背景与字体颜色 → 侧栏/卡片/输入框仍用原变量，会仍为浅色，不一致；B）在 `mantineCssResolver` 的 `dark` 中补全同一套 `--ui-*` → 全站消费同一 token，一处改全站生效。
- 决策：采用 B；并让 `color-scheme` 随主题切换（深色时设为 dark），使浏览器原生控件（滚动条、表单控件）一致。

## 改造影响矩阵与灰度切换

| impact_id | 现状行为 | 目标行为 | 影响对象 | 风险等级 | 回滚动作 |
|-----------|----------|----------|----------|----------|----------|
| IM-001 | 深色模式下除编辑区外仍为浅色 | 深色模式下全站使用深色 token | 所有使用 `--ui-*` 的页面与组件 | low | 恢复 theme.ts 中 dark 为空、移除 ui-refresh 中 dark color-scheme |
| IM-002 | `:root` 固定 color-scheme: light | 深色时 color-scheme: dark | 浏览器原生控件（滚动条、表单等） | low | 同上 |

- 灰度策略：前端发版即可生效，无需后端/功能开关；用户已选主题由 localStorage 持久化。
- 回滚策略：还原 theme.ts / ui-refresh.css 变更并重新发版；无数据迁移，回滚时长取决于发布流程。

## 实施要点（开发清单）

1. **theme.ts**（已完成）：在 `mantineCssResolver` 的 `dark` 中补全默认黑灰 token；`light` 保持现状。
2. **ui-refresh.css**（已完成）：`:root { color-scheme: light; }`；`[data-mantine-color-scheme="dark"] { color-scheme: dark; }`。
3. **多色系扩展**：
   - **palette 状态**：新增 `app-palette` localStorage 与 React 状态，取值 `default` | `soft` | `blue-gray` | `warm` | `green`。`default` 时不设置 `data-app-palette`（沿用 resolver 的 light/dark）；其它值时在 `:root` 上设置 `data-app-palette="<value>"`。
   - **theme-palettes.css**（或并入 ui-refresh）：用选择器 `[data-mantine-color-scheme="light"][data-app-palette="soft"]` 与 `[data-mantine-color-scheme="dark"][data-app-palette="blue-gray"]` 等，对各色系覆盖同一套 `--ui-*` 与 `--mantine-color-body`、`--mantine-color-default-border`。色值见下表示例。
   - **入口**：Theme 子菜单与账户偏好「主题」由 3 项改为 7 项：Light、Light (Soft)、Dark、Dark (Gray)、Dark (Blue)、Dark (Warm)、Dark (Green)、System。选择时同时设置 Mantine `colorScheme` 与 `app-palette`；System 对应 colorScheme=auto、palette=default。
4. **色系 token 示例**（仅作参考，以实际实现为准）：
   - **Light (Soft)**：bg #f8fafc / #f1f5f9 / #e2e8f0；text #0f172a / #475569 / #64748b；border 同色阶。
   - **Dark (Gray)**：沿用 theme.ts 现有 dark（#1e1e1e 等）。
   - **Dark (Blue)**：bg #1a1d23 / #22262e / #2c313a；text #e6edf3 / #8b949e / #6e7681；border #30363d / #424a53。
   - **Dark (Warm)**：bg #1c1917 / #292524 / #44403c；text #fafaf9 / #a8a29e / #78716c；border #3f3f46 / #52525b。
   - **Dark (Green)**：bg 保持 #1e1e1e / #252526；text #c6e2c6 或 #9ece6a；border #4a5d4a / #6b7c6b。
5. 禁止在本次范围内在组件内写死色值；已使用 `var(--ui-*)` 的无需改动。

## 验收标准

- 功能验收：在 Light / Light (Soft) / Dark / Dark (Gray/Blue/Warm/Green) / System 下，全站背景/文字/边框与所选主题+色系一致；深色多种色系可区分；柔和浅色与默认浅色可区分。
- 回归验收：默认 Light、默认 Dark 与改造前一致；切换主题与色系无控制台报错；主题+色系偏好刷新后保持。

## 修改日志

- 2026-02-28 UTC+8：初始化文档骨架并补全 PRD 正文（背景、As-Is、影响矩阵、实施要点、验收标准）。
- 2026-02-28 12:00:00 UTC+8：扩展多色系（柔和浅色、蓝灰/暖/绿深色）；补充实施要点与色系 token 示例、验收标准。
