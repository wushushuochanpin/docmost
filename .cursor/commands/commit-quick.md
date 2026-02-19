# 快速生成 Commit、PR 描述并同步 GitHub

## Role
【高级研发工程师】

## Task
分析当前暂存区，生成提交信息与 PR 描述，并**同步到 GitHub**（提交并 push 当前分支）。

## 1. Commit Message
- 格式：`emoji + 类别 + 描述`（如 `✨ feat: 增加用户注册` / `🐛 fix: 修复登录超时`）
- 一句话概括

## 2. PR 描述（精简）
- 改动摘要（列表）
- 技术备注（配置/DB/API 变更加粗）
- Checklist：2～3 个自测要点

## 3. 同步到 GitHub（必须执行）
- `git add -A`（若未暂存；可排除 `.pnpm-store`、`.vscode` 等本地/缓存目录）
- `git commit -m "<生成的 Message>"`
- **`git push origin <当前分支>`**（提交后必须立即推送，确保远程同步；若推送失败需在回复中说明并给出手动推送命令）

## 使用说明
输入 `/commit-quick` 触发：分析暂存区 → 生成 Commit + PR 描述 → **提交并推送到 GitHub**（缺一不可）。
