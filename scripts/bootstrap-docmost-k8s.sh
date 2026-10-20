#!/usr/bin/env bash
# One-time production bootstrap. Run on xenzify-dev from the repository root.
set -euo pipefail

repo_dir=${1:-/root/coderepository/docmost}
node_ip=${DOCMOST_NODE_IP:-10.3.0.16}
source_storage=/var/lib/docker/volumes/docmost_docmost/_data
target_storage=/var/lib/docmost/storage

cd "$repo_dir"
test -f .env
test -f deploy/k8s/production/bootstrap.yaml
test "$node_ip" = "10.3.0.16"
command -v kubectl >/dev/null
command -v docker >/dev/null
command -v rsync >/dev/null

kubectl apply --dry-run=client \
  -f deploy/k8s/production/bootstrap.yaml >/dev/null

install -d -m 0750 -o 1000 -g 1000 "$target_storage"
if test -d "$source_storage"; then
  rsync -a --numeric-ids "$source_storage/" "$target_storage/"
fi

if grep -q '^DOCMOST_NODE_IP=' .env; then
  sed -i "s/^DOCMOST_NODE_IP=.*/DOCMOST_NODE_IP=$node_ip/" .env
else
  printf '\nDOCMOST_NODE_IP=%s\n' "$node_ip" >> .env
fi

# Recreate only the stateful dependency containers to add private-node port
# bindings. This does not stop the existing Docmost application container.
docker compose up -d --no-deps db redis

kubectl apply -f deploy/k8s/production/bootstrap.yaml

secret_env=$(mktemp)
cleanup() { rm -f "$secret_env"; }
trap cleanup EXIT
umask 077
sed \
  -e 's/@db:5432/@docmost-postgres:5432/' \
  -e 's|redis://redis:6379|redis://docmost-redis:6379|' \
  -e '/^DOCMOST_NODE_IP=/d' \
  .env > "$secret_env"
kubectl -n docmost create secret generic docmost-env \
  --from-env-file="$secret_env" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n arc-systems patch runnerdeployment docmost-runner --type merge \
  -p '{"spec":{"template":{"spec":{"serviceAccountName":"docmost-deployer"}}}}'

kubectl auth can-i patch deployments.apps -n docmost \
  --as=system:serviceaccount:arc-systems:docmost-deployer | grep -qx yes
kubectl auth can-i create secrets -n docmost \
  --as=system:serviceaccount:arc-systems:docmost-deployer | grep -qx yes

echo "Docmost Kubernetes prerequisites are ready."
