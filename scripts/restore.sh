#!/usr/bin/env bash
# SuperChat 完整还原：从 backup.sh 产生的目录还原
# 用法: ./scripts/restore.sh <备份目录路径>
# 例:   ./scripts/restore.sh ./backups/docmost_20260221_120000

set -e
BACKUP_DIR="$1"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "用法: $0 <备份目录>"
  echo "备份目录应包含 db.dump 以及可选的 storage/ 目录"
  exit 1
fi

echo "[restore] 从 $BACKUP_DIR 还原（将先停止 docmost 并清空 DB）"
read -p "确认继续? [y/N] " -n 1 -r; echo
if [[ ! $REPLY =~ ^[yY]$ ]]; then exit 1; fi

docker compose -f "$COMPOSE_FILE" stop docmost
docker compose -f "$COMPOSE_FILE" up -d db
sleep 3

# 1. 清空并还原 PostgreSQL
docker compose -f "$COMPOSE_FILE" exec -T db psql -U docmost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='docmost' AND pid<>pg_backend_pid();" 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" exec -T db psql -U docmost -d postgres -c "DROP DATABASE IF EXISTS docmost;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U docmost -d postgres -c "CREATE DATABASE docmost;"
docker compose -f "$COMPOSE_FILE" exec -T db pg_restore -U docmost -d docmost --no-owner --no-acl < "$BACKUP_DIR/db.dump"
echo "[restore] PostgreSQL 已还原"

# 2. 若有 storage 备份，覆盖到运行中容器的卷（需先启动 docmost 再 cp，或直接写 volume）
if [ -d "$BACKUP_DIR/storage" ]; then
  docker compose -f "$COMPOSE_FILE" up -d docmost
  sleep 2
  DOCMOST_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q docmost)
  if [ -n "$DOCMOST_CONTAINER" ]; then
    docker cp "$BACKUP_DIR/storage/." "$DOCMOST_CONTAINER:/app/data/storage/"
    echo "[restore] 存储卷已还原"
  else
    echo "[restore] 警告: 无法写入 storage，请手动将 $BACKUP_DIR/storage 内容复制到 docmost volume"
  fi
else
  docker compose -f "$COMPOSE_FILE" up -d docmost
fi

echo "[restore] 完成"
