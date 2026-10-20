#!/usr/bin/env bash
# Switch host Nginx to the healthy Kubernetes Service without restarting host services.
set -euo pipefail

repo_dir=${1:-/root/coderepository/docmost}
site=/etc/nginx/sites-enabled/book.superchat.help
backup="${site}.pre-k8s"
k8s_upstream=10.43.30.30:3000
compose_upstream=127.0.0.1:3000

cd "$repo_dir"
kubectl -n docmost rollout status deployment/docmost --timeout=5m
curl -fsS --max-time 15 "http://${k8s_upstream}/api/health" >/dev/null

cp -a "$site" "$backup"
restore() {
  rc=$?
  docker compose start docmost >/dev/null 2>&1 || true
  cp -a "$backup" "$site"
  nginx -t && systemctl reload nginx
  exit "$rc"
}
trap restore ERR

sed -i "s|proxy_pass http://${compose_upstream};|proxy_pass http://${k8s_upstream};|" "$site"
grep -q "proxy_pass http://${k8s_upstream};" "$site"
nginx -t
systemctl reload nginx
curl -fsS --max-time 20 https://book.superchat.help/api/health >/dev/null

# Retire only the old application container. PostgreSQL and Redis stay up.
docker compose stop docmost
curl -fsS --max-time 20 https://book.superchat.help/api/health >/dev/null
trap - ERR

echo "book.superchat.help now serves the Kubernetes deployment."
