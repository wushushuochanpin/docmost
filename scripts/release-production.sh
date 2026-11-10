#!/usr/bin/env bash
# Dispatch the existing guarded production workflow and follow this exact run.
set -euo pipefail
repo="wushushuochanpin/docmost"
workflow="deploy.yml"
if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <full-main-commit-sha>" >&2
  exit 2
fi
expected_sha=$1
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
remote_sha=$(gh api "repos/$repo/commits/main" --jq .sha)
if [ "$remote_sha" != "$expected_sha" ]; then
  echo "main is $remote_sha, not $expected_sha; refusing to deploy" >&2
  exit 1
fi
request_id="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 8)"
echo "Dispatching production release for $expected_sha (request $request_id)"
if ! gh workflow run "$workflow" --repo "$repo" --ref main -f "expected_sha=$expected_sha" -f "request_id=$request_id"; then
  echo "Dispatch may have failed; check Actions for request $request_id before retrying." >&2
  exit 1
fi
for attempt in $(seq 1 30); do
  run_id=$(gh api "repos/$repo/actions/workflows/$workflow/runs?event=workflow_dispatch&per_page=100" \
    --jq ".workflow_runs[] | select(.display_title == \"Manual release $request_id\" and .head_sha == \"$expected_sha\") | .id" | head -n 1)
  if [ -n "$run_id" ]; then
    echo "Release run: https://github.com/$repo/actions/runs/$run_id"
    exec gh run watch "$run_id" --repo "$repo" --exit-status
  fi
  sleep 2
done
echo "Dispatch accepted but run not found. Check Actions before retrying (request $request_id)." >&2
exit 1
