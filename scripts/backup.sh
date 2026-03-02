#!/usr/bin/env bash
# SuperChat 完整备份：PostgreSQL + docmost 存储卷
# 用法: ./scripts/backup.sh [输出目录，默认 ./backups]
# 还原见同目录 restore.sh 或下方注释

set -e
OUT_DIR="${1:-./backups}"
STAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# 从 docker-compose 同目录执行
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p "$OUT_DIR"
BACKUP_DIR="$OUT_DIR/docmost_$STAMP"
mkdir -p "$BACKUP_DIR"

echo "[backup] 开始备份 -> $BACKUP_DIR"

# 1. PostgreSQL（逻辑备份，可跨版本还原）
DB_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)
if [ -z "$DB_CONTAINER" ]; then
  echo "[backup] 启动 db 容器..."
  docker compose -f "$COMPOSE_FILE" up -d db
  sleep 3
  DB_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q db)
fi
docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U docmost -Fc docmost > "$BACKUP_DIR/db.dump"
echo "[backup] PostgreSQL -> $BACKUP_DIR/db.dump"

# 2. docmost 存储卷（上传文件等）：用 compose 跑的临时容器打包
DOCMOST_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q docmost 2>/dev/null || true)
if [ -n "$DOCMOST_CONTAINER" ]; then
  docker cp "$DOCMOST_CONTAINER:/app/data/storage" "$BACKUP_DIR/storage" 2>/dev/null || true
fi
if [ ! -d "$BACKUP_DIR/storage" ]; then
  # 无运行中 docmost 时，用同名 volume 挂载到临时容器
  VOLUME_NAME=$(docker volume ls -q --filter name=docmost | head -1)
  if [ -n "$VOLUME_NAME" ]; then
    TMP_ID=$(docker run -d --rm -v "${VOLUME_NAME}:/data:ro" alpine sleep 60)
    docker cp "$TMP_ID:/data" "$BACKUP_DIR/storage"
    docker rm -f "$TMP_ID" 2>/dev/null || true
  fi
fi
[ -d "$BACKUP_DIR/storage" ] && echo "[backup] 存储卷 -> $BACKUP_DIR/storage" || echo "[backup] 警告: 未备份到 storage，请检查 volume"

echo "[backup] 完成: $BACKUP_DIR"
echo "---"
echo "下载到本地: scp -r user@此机:$(realpath "$BACKUP_DIR") ./"
echo "上传腾讯 COS: 打包后 coscmd upload -r $BACKUP_DIR cos://bucket/backups/ 或控制台/API 上传"
