#!/usr/bin/env bash
# Check for missing i18n translation keys.
# Usage: bash scripts/check-i18n-keys.sh [--strict]
#   --strict  Exit with non-zero if any key is missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MISSING=0

echo "==> Checking i18n translation key coverage..."

python3 "$ROOT/scripts/check-i18n-keys.py" "$ROOT" "$@"
