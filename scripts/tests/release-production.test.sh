#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_CALLS"
if [[ "$*" == *"commits/main"* ]]; then
  echo "$MOCK_REMOTE_SHA"
elif [[ "$*" == *"actions/workflows/deploy.yml/runs"* ]]; then
  echo 12345
fi
MOCK
chmod +x "$tmp/gh"
export PATH="$tmp:$PATH" MOCK_CALLS="$tmp/calls"
sha=0123456789abcdef0123456789abcdef01234567
export MOCK_REMOTE_SHA=$sha
"$root/scripts/release-production.sh" "$sha" > "$tmp/output"
grep -q 'actions/runs/12345' "$tmp/output"
grep -q 'workflow run deploy.yml' "$MOCK_CALLS"
grep -q 'run watch 12345' "$MOCK_CALLS"
: > "$MOCK_CALLS"
export MOCK_REMOTE_SHA=ffffffffffffffffffffffffffffffffffffffff
if "$root/scripts/release-production.sh" "$sha" > "$tmp/output" 2>&1; then
  echo 'SHA mismatch unexpectedly succeeded' >&2; exit 1
fi
if grep -q 'workflow run' "$MOCK_CALLS"; then
  echo 'SHA mismatch dispatched a release' >&2; exit 1
fi
if "$root/scripts/release-production.sh" invalid > "$tmp/output" 2>&1; then
  echo 'Invalid SHA unexpectedly succeeded' >&2; exit 1
fi
echo 'Production release launcher tests passed'
