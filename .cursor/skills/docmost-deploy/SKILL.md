---
name: docmost-deploy
description: Docmost 生产交付与故障恢复，覆盖不可变镜像、Kubernetes 滚动发布、运行身份核对和 Compose 旧环境回退。用于发布或排查 book.superchat.help；不要恢复服务器拉源码构建路径。
---

# Docmost 生产部署

生产应用运行在 `xenzify-dev` 的 K3s `docmost` namespace。GitHub Actions 的
`Deploy to book.superchat.help` 是唯一常规发布入口：ARC Runner 构建当前 `main`
提交的 amd64 镜像，推送 GHCR，以 digest 应用
`deploy/k8s/production/runtime.yaml`，等待 rollout 并校验内部和公网健康状态。

## 不变量

- 不在生产服务器拉源码、构建镜像或执行 `docker compose up` 发布应用。
- 运行镜像必须使用 `ghcr.io/wushushuochanpin/docmost@sha256:...`，不能只使用可变 tag。
- Runner 仅通过 `arc-systems/docmost-deployer` 获得 `docmost` namespace 权限。
- Pod 不挂 Kubernetes API token；应用 Secret 只存在于集群，不进入 Git。
- PostgreSQL 和 Redis 暂时保留为宿主机 Compose 依赖。它们只绑定节点私网地址，
  通过 `docmost-postgres` 和 `docmost-redis` Service 供 Pod 使用。
- Nginx 固定代理 `10.43.30.30:3000`；发布不得重启宿主机、Nginx、数据库或 Redis。
- 数据卷是 Retain 策略的 `docmost-storage` PV，路径 `/var/lib/docmost/storage`。

## 交付顺序

1. 检查本地/远端分支、候选 SHA 和工作区归属。
2. 运行受影响测试、`python3 scripts/check-ci-runner-policy.py`、
   `python3 scripts/check-k8s-deployment.py`、工作流 lint 和构建门禁。
3. 通过分支、PR 和保护规则合并到 `main`；不要直接部署功能分支。
4. 等待合并 SHA 对应的 `Deploy to book.superchat.help` 完成。
5. 核对 Deployment 注解 `docmost.dev/source-sha`、运行 image digest、Pod Ready、
   `/api/health`、公网首页以及本次改动的真实用户路径。

部署 job 在 apply 后失败会恢复此前的 Deployment image。数据库 migration 仍是前向
变更，回退代码前必须确认 schema 兼容，不能把 rollout undo 当成数据回滚。

## 一次性基础设施

只有首次迁移或灾后重建才运行 `scripts/bootstrap-docmost-k8s.sh`。它会创建 namespace、
Retain PV/PVC、最小 RBAC、依赖 Service，迁移本地存储，并为现有 Postgres/Redis 添加
节点私网端口。正常发布不得重复运行它。

`scripts/cutover-docmost-k8s.sh` 只用于首次从 Compose 应用切换到 K8s。它先验证 K8s
服务，再原子更新 Nginx、校验公网，最后只停止旧应用容器。失败时恢复 Nginx 配置。

## 诊断与恢复

- 查看状态：`kubectl -n docmost get deploy,pods,svc,pvc -o wide`
- 查看日志：`kubectl -n docmost logs deployment/docmost --tail=200`
- 查看身份：`kubectl -n docmost get deployment docmost -o jsonpath='{.metadata.annotations.docmost\\.dev/source-sha}{" "}{.spec.template.spec.containers[0].image}{"\\n"}'`
- 回退镜像：使用上一条已验收 digest 执行 `kubectl -n docmost set image deployment/docmost docmost=<image@digest>`，等待 rollout 并重新验收。
- 集群路径不可恢复时，先启动旧 `docmost` Compose 容器，再把 Nginx upstream 恢复为
  `127.0.0.1:3000`，执行 `nginx -t`、reload 和公网 smoke。不要重启整台服务器。
