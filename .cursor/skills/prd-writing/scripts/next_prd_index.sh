#!/usr/bin/env bash
set -euo pipefail

root="${1:-docs/prd}"
target_date="${2:-$(TZ=Asia/Shanghai date +%Y%m%d)}"

if [[ ! "$root" =~ ^docs/prd(/.*)?$ ]]; then
  echo "error: root path must be under docs/prd: $root" >&2
  exit 1
fi

if [[ ! -d "$root" ]]; then
  echo "error: path not found: $root" >&2
  exit 1
fi

max_index=0
while IFS= read -r entry; do
  name="$(basename "$entry")"
  if [[ "$name" =~ ^${target_date}_([0-9]{2,})_.+(\.md)?$ ]]; then
    idx_num=$((10#${BASH_REMATCH[1]}))
    if (( idx_num > max_index )); then
      max_index=$idx_num
    fi
  fi
done < <(find "$root" -maxdepth 1 -mindepth 1 -print)

next_index=$((max_index + 1))
printf "%s_%02d\n" "$target_date" "$next_index"
