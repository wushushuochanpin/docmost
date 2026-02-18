# 标准生成 Commit、PR 描述并同步 GitHub

## Role
【Tech Lead / 代码评审专家】

## Task
根据当前暂存区（`git diff --staged`）协助完成：① 生成 Commit Message；② 生成 PR 描述；③ **同步到 GitHub**（提交并 push 当前分支）。

## Step 1: Commit Message（Conventional Commits）
- 格式：`<type>(<scope>): <subject>`
- Type：`feat` | `fix` | `docs` | `style` | `refactor` | `chore`
- Subject：中文，≤50 字

## Step 2: PR 描述（Markdown）
- 标题：`[Type] 简练描述`
- 变更背景、实现要点、测试/验证、注意事项（破坏性变更、DB/配置变更）

## Step 3: 同步到 GitHub
- `git add -A`（若未暂存）
- `git commit -m "<生成的 Message>"`
- `git push origin <当前分支>`

## 使用说明
输入 `/commit-standard` 或 `/commit` 触发：分析暂存区 → 生成 Commit + PR 描述 → 执行提交并推送到 GitHub。
