# 提交所有分支更改、合并到主分支并同步 GitHub

## Role
【高级研发工程师 / Git 工作流】

## Task
1. 检查各分支未提交更改；2. 为有改动的分支生成 Commit 并提交；3. 合并到 main/master；4. **同步到 GitHub**（push main 及必要分支）。

## Workflow（精简）

### Step 1: 检查状态
- `git branch -a`、`git status`
- 各分支未提交/未推送情况

### Step 2: 提交当前分支
- 分析 `git diff`，生成 Commit Message（emoji+类别 或 Conventional Commits）
- `git add -A` → `git commit -m "..."` → `git push origin <当前分支>`

### Step 3: 其他有改动的分支
- `git checkout <branch>` → 同 Step 2 提交 → `git push origin <branch>`

### Step 4: 合并到主分支
- `git checkout main` → `git pull origin main`
- `git merge <branch>`（逐个），解决冲突后 `git add`、`git commit`

### Step 5: 同步到 GitHub
- `git push origin main`

## 使用说明
输入 `/commit-all-and-merge` 触发：检查 → 各分支提交并 push → 合并到 main → push main 到 GitHub。
