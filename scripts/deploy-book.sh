#!/usr/bin/env bash
# Deploy docmost to book.superchat.help on superchat-dev (43.134.45.185).
# Runs server-side via GitHub Actions (scripts/deploy-book.sh piped to ssh bash -s),
# or manually:  ssh root@43.134.45.185 'bash -s' < scripts/deploy-book.sh
# Only rebuilds/updates the docmost app container. Never touches:
#   - docmost-db-1 (shared database) and docmost-redis-1
#   - shared nginx on this host
set -euo pipefail

cd /root/coderepository/docmost
echo "== repo =="
git fetch origin main
git checkout main
git pull --ff-only origin main
git log -1 --format='deploying %h %ci %s'

echo "== build & up =="
docker compose build docmost
docker compose up -d

echo "== health =="
code=""
for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
  if [ "$code" = "200" ]; then break; fi
  sleep 5
done
if [ "$code" != "200" ]; then
  echo "local health check failed: code=$code"
  exit 1
fi
echo "local health ok (http=$code)"
curl -sk -o /dev/null -w 'book public: %{http_code}\n' --max-time 15 https://book.superchat.help/
