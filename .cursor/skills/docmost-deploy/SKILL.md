---
name: docmost-deploy
description: docmost 生产部署闭环技能（提交→push→服务器拉取→重建镜像→重启→四道校验）。适用于把本地/分支改动发布到 book.superchat.help 生产容器的场景，特别是新增了文件、改了服务端路由、动了侧边栏等前端逻辑的改动。核心防坑：容器只挂数据卷、源码烤进镜像必须 docker compose build；服务器 main 可能存在本地未推送提交需先合并；重启瞬间旧 websocket 连接会中断（用户可能看到卡加载页）；ee submodule 未初始化会产生 MFA 警告（不影响登录）。
---

# docmost 生产部署闭环与验证

## 适用场景

本仓库（wushushuochanpin/docmost 分支）部署在远端服务器 43.134.45.185 的
Docker Compose 生产容器中，公网域名 `book.superchat.help`（旧域名 `doc.superchat.help`
301 跳转至此）。测试环境 `test-doc.superchat.help` 对应 `docmost-test:local` 容器
（端口 3020）。改完代码要发上线时，最常出的不是代码错，而是**部署没真正生效**
（页面能开但跑的是旧代码），或**部署瞬间把正在使用的人卡断**。

## 环境事实（已核实，勿臆测）

| 项 | 值 |
|---|---|
| 生产机 | 43.134.45.185（SSH 别名 `superchat-sg-prod` / `superchat-dev`，root，key `~/.ssh/superchat_dev_20260305.pem`，本机 SOCKS5 127.0.0.1:7897 可用时自动走代理） |
| 生产源码目录 | `/root/coderepository/docmost`（git 仓库，main；`/root/docmost` 不是 git 仓库，勿用） |
| 生产容器 | `docmost-docmost-1`（镜像 `docmost:local`，端口 127.0.0.1:3000） |
| 依赖容器 | `docmost-db-1`（postgres:16-alpine）、`docmost-redis-1`（redis:7.2-alpine） |
| 测试容器 | `test-doc-docmost-1`（镜像 `docmost-test:local`，端口 127.0.0.1:3020，compose 文件 `docker-compose.test.yml`） |
| 公网入口 | `book.superchat.help` → nginx → `http://127.0.0.1:3000`（生产）；`test-doc.superchat.help` → 3020（测试） |
| compose 文件 | `/root/coderepository/docmost/docker-compose.yml`（服务名 `docmost`） |
| 容器挂载 | 仅数据卷 `docmost_docmost/_data -> /app/data/storage`；**没有挂载源码** |
| 容器 CMD | `[pnpm start]`（无 `--reload`） |

**判据**：挂载里只有数据卷、没有源码目录 → 源码烤进镜像 → **必须 `docker compose build`**，
光 `git pull` 不会生效；CMD 无 `--reload` → 即使挂了源码也要重启容器。

## 第一步：改前先搞清楚分支拓扑（最重要，别直接动手）

本仓库多端协作（本地 Mac + 服务器直接改），服务器 main 经常有**未推送的本地提交**
和**未提交的工作区改动**，直接 pull/reset 会丢工作。动手前先查：

```bash
ssh superchat-sg-prod 'cd /root/coderepository/docmost && \
  git fetch origin && \
  echo "--- 本地独有（未推送）---" && git log --oneline origin/main..HEAD && \
  echo "--- 远端独有（未拉取）---" && git log --oneline HEAD..origin/main && \
  echo "--- 工作区改动 ---" && git status --short'
```

- 若服务器有 ` M ` 开头（已跟踪文件被改）→ **先与用户确认**再覆盖；
  `??`（未跟踪）不会被 pull 覆盖，可放心。
- 服务器本地提交（如历史中的 `855094d4 fix: restore sidebar tree behavior`）常与本仓库
  sidebar/页面服务同文件重叠——**不要 reset/force**，用本地合并演练（见下）。

## 第二步：本地提交并合并（含服务器未推送提交）

```bash
# 本地提交（本仓库根目录 /Users/zhangjunxu3/developer/docmost）
git add -A && git commit -m "<feat/fix>: ..."

# 若服务器有未推送提交：拉下来做无副作用合并演练
git fetch superchat-sg-prod:/root/coderepository/docmost main:refs/remotes/server-main
git merge --no-commit --no-ff server-main   # 看冲突
git diff --name-only --diff-filter=U        # 有冲突则逐个解决
git commit -m "Merge server-local fixes into main"
```

注意：HTTPS push 用 OAuth token 会因缺 `workflow` scope 被拒（无法更新
`.github/workflows/*.yml`）。**用 SSH 协议 push**：

```bash
git push git@github.com:wushushuochanpin/docmost.git main
# 或一次性：git remote set-url origin git@github.com:wushushuochanpin/docmost.git
```

## 第三步：部署前 dry-run（防覆盖服务器本地改动）

```bash
ssh superchat-sg-prod 'cd /root/coderepository/docmost && \
  git fetch origin && \
  echo "--- 待拉取提交 ---" && git log --oneline HEAD..origin/main && \
  echo "--- 待变更文件 ---" && git diff --stat HEAD origin/main && \
  echo "--- 会被覆盖的已跟踪改动 ---" && git status --short | grep -v "^??"'
```

若服务器有未提交工作区改动且用户要求保留 → **stash（含未跟踪）**：

```bash
ssh superchat-sg-prod 'cd /root/coderepository/docmost && \
  git stash push -u -m "wip: <说明> before deploy"'
```

部署完成后恢复：`git stash pop`（若与拉取内容同文件冲突，先人工处理）。

## 第四步：拉取 + 重建 + 重启

```bash
ssh superchat-sg-prod 'cd /root/coderepository/docmost && \
  git pull --ff-only origin main && \
  docker compose build docmost && \
  docker compose up -d docmost'
```

- Dockerfile 是 `COPY . .` 多阶段构建：改动源码后相关层会失效重建，
  前面的 apt/依赖层走缓存，通常几分钟内完成，**不需要 `--no-cache`**。
- 构建耗时较长，用 `nohup ... > /tmp/docmost-build.log 2>&1 &` 后台跑并轮询日志。
- ⚠️ 重建重启瞬间（容器停止→启动约 6-10 秒窗口），所有在用的 websocket/collab
  连接会断（nginx error.log 出现 `recv failed (104)`），**正在编辑的用户会看到
  卡在 "Loading Xenzify..." 加载页**，属预期现象；服务恢复后刷新即可，
  不要因此误判部署失败。如需避免可挑低峰期发布。

## 第五步：四道部署后校验（缺一不可）

### 1. 镜像内容核查 —— 新增文件最容易被吃掉

镜像只拷编译产物（`/app/apps/server/dist`、`/app/apps/client/dist`），**源码不在镜像里**。
检查编译产物而非源码路径：

```bash
ssh superchat-sg-prod 'docker run --rm docmost:local sh -c \
  "grep -rl \"<新路由>\" /app/apps/server/dist/core/ | head -3; \
   grep -rl \"<新文案>\" /app/apps/client/dist/assets/ | head -3"'
```

### 2. 数据库 schema 核查（仅当动了 schema 时）

```bash
ssh superchat-sg-prod 'docker exec docmost-db-1 psql -U docmost -d docmost -c \
  "\dt" | grep <新表>'
```

### 3. 路由存在性 —— 用 HTTP 状态码，别用 Python 内省

```bash
ssh superchat-sg-prod 'curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST http://127.0.0.1:3000/api/<新端点> -H "Content-Type: application/json" -d "{}"'
```

| 状态码 | 含义 |
|---|---|
| 401 | 路由存在，未登录（docmost 正常预期） |
| 404 | **路由真没了**（部署失败） |
| 405 | 路由存在，HTTP 方法不匹配 |

成对探测最稳：**新端点应 401/405 + 对照既有端点也应 401**。

### 4. 用户真正看到的层 —— 前端资源与运行时

```bash
# 前端资源完整性：index.html 引用的 asset 逐一探测
ssh superchat-sg-prod 'for a in $(docker exec docmost-docmost-1 sh -c \
  "grep -oE \"assets/[a-zA-Z0-9-]+\.(js|css)\" /app/apps/client/dist/index.html | sort -u"); \
  do echo "$(curl -sS -o /dev/null -w %{http_code} -k https://book.superchat.help/$a) $a"; done'

# 服务端日志无新增 error
docker logs docmost-docmost-1 --since 3m 2>&1 | grep -iE '"level":"error"' | head -5

# 前端能否渲染（用容器自带 chromium 无头跑）
docker exec docmost-docmost-1 sh -c \
  'timeout 45 chromium --headless --no-sandbox --disable-gpu --dump-dom \
   --virtual-time-budget=15000 http://127.0.0.1:3000/ 2>/dev/null | grep -oE "<title>[^<]*</title>"'
```

## 已知坑（预存状态，勿误判为本次部署问题）

1. **ee submodule 未初始化**：`apps/server/src/ee` 是 git submodule
   （`https://github.com/docmost/ee`，commit `9e5f64d9`），本地与服务器均未 `git submodule
   update --init`，目录为空 → dist 中无 `ee/mfa` 模块 → 登录时日志报
   `MFA module failed to load: Cannot find module './../../ee/mfa/services/mfa.service'`。
   **这是 try/catch 包裹的警告**（`MFA enforcement may be bypassed if workspace.enforceMfa is set`），
   且当前 `workspaces.enforce_mfa = false`，**不影响登录**。若以后启用 enforceMfa，
   需先 init submodule 并重建镜像。
2. **翻译文件（translation.json）键序是 crowdin 任意序**：不能用 json.dump 整体重写
   （会产生 2200+ 行噪音 diff）。正确做法：`git checkout HEAD --` 恢复后，
   用字符串 replace 在锚点（如 `  "Pinned": "Pinned",`）后**最小插入**，
   插入后用 `python3 -c "import json; json.load(open(...))"` 校验。
3. **本仓库需要先构建 `packages/editor-ext`（tsc --build）**，否则两端 tsc
   都报 `@docmost/editor-ext` 找不到（既有错误）。构建后服务端 `tsc --noEmit`、
   客户端 `tsc`、`vite build` 才是干净的验证链。
4. **验证是否引入测试失败**：不要 stash 自己工作区，用干净副本对比：
   `git worktree add /tmp/<项目>-baseline HEAD --detach`，在 baseline 跑同一测试，
   基线也失败 = 与改动无关，然后 `git worktree remove ... --force`。

## 回滚

- 代码回滚：本地 `git revert <提交>` 或 `git reset --hard <上一个好提交>` 后重新
  走第二～五步（push → 服务器 pull → 重建 → 校验）。
- 数据不受影响：数据库/文件存储都在命名卷（`docmost_docmost`、`db_data`、`redis_data`），
  重建镜像不丢数据。
- 备份脚本：仓库 `scripts/backup.sh` / `scripts/restore.sh`（服务器 `/root/backups`）。
