#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") [--legacy] <target_path> [small|medium|large|auto]
  $(basename "$0") [--legacy] <target_path> [lite|standard|extended|auto]  # backward-compatible

Examples:
  $(basename "$0") docs/prd/20260217_01_order-rule-center medium
  $(basename "$0") --legacy docs/prd/20260217_01_order_rule_center.md small
  $(basename "$0") docs/prd/20260217_02_order-rule-center.md small
  $(basename "$0") docs/prd/20260217_02_order-rule-center.md lite
USAGE
}

legacy_mode=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --legacy)
      legacy_mode=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "[ERROR] unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

target="$1"
mode_input="${2:-auto}"
errors=0
warnings=0

err() {
  echo "[ERROR] $1" >&2
  errors=$((errors + 1))
}

warn() {
  echo "[WARN] $1" >&2
  warnings=$((warnings + 1))
}

report_naming_issue() {
  local msg="$1"
  if [[ "$legacy_mode" == "true" ]]; then
    warn "$msg (legacy mode tolerated)"
  else
    err "$msg"
  fi
}

is_under_docs_prd() {
  local path="$1"
  [[ "$path" == docs/prd* || "$path" == */docs/prd/* || "$path" == */docs/prd ]]
}

check_metadata() {
  local file="$1"

  if ! grep -Eq "\*\*(成文日期|最后修订|最后更新)\*\*：[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC\+8" "$file"; then
    err "$file missing timestamp with second precision (UTC+8)"
  fi

  if ! grep -Eq "请以实际代码与产品行为为准|谨慎参考|系统实现可能已发生变化" "$file"; then
    err "$file missing disclaimer/timeliness note"
  fi
}

check_slug_quality() {
  local name="$1"
  local slug="$name"
  slug="${slug#????????_}"
  slug="${slug#[0-9][0-9]_}"
  slug="${slug%.md}"

  if [[ ${#slug} -gt 32 ]]; then
    report_naming_issue "slug too long (>32): $slug"
  fi

  local words
  words="$(awk -F- '{print NF}' <<< "$slug")"
  if (( words < 2 || words > 5 )); then
    report_naming_issue "slug should contain 2-5 words: $slug"
  fi
}

check_core_sections() {
  local file="$1"
  local section="$2"
  if ! grep -Eq "$section" "$file"; then
    err "$file missing required section: $section"
  fi
}

check_small_content() {
  local file="$1"
  check_core_sections "$file" "文档档位与产物策略"
  check_core_sections "$file" "存储路径与命名规范"
  check_core_sections "$file" "现状审计（As-Is）|现状审计"
  check_core_sections "$file" "改造策略确认闸门"
  check_core_sections "$file" "能力复用与重复建设审查"
  if ! grep -Eq "影响矩阵|改造影响矩阵" "$file"; then
    err "$file missing impact matrix section"
  fi
  if ! grep -Eq "回滚" "$file"; then
    err "$file missing rollback keyword"
  fi
}

normalize_mode() {
  local input="$1"
  case "$input" in
    auto) echo "auto" ;;
    small|lite) echo "small" ;;
    medium|standard) echo "medium" ;;
    large|extended) echo "large" ;;
    *)
      return 1
      ;;
  esac
}

check_medium_content() {
  local dir="$1"
  check_small_content "$dir/01_产品方案_PRD.md"

  if ! grep -Eq "接口|契约|API" "$dir/02_技术方案_架构与接口.md"; then
    err "$dir/02_技术方案_架构与接口.md missing interface contract keywords"
  fi
  if ! grep -Eq "发布|灰度|回滚" "$dir/06_实施计划_测试与回滚.md"; then
    err "$dir/06_实施计划_测试与回滚.md missing release/rollback keywords"
  fi
}

check_large_content() {
  local dir="$1"
  check_medium_content "$dir"
  if ! grep -Eq "现状|问题|影响面" "$dir/00_现状审计.md"; then
    err "$dir/00_现状审计.md missing audit keywords"
  fi
  if ! grep -Eq "评审|采纳|风险" "$dir/07_评审意见与回复.md"; then
    err "$dir/07_评审意见与回复.md missing review/governance keywords"
  fi
  if ! grep -Eq "未来|阶段|风险" "$dir/09_未来实现草案.md"; then
    err "$dir/09_未来实现草案.md missing future plan keywords"
  fi
}

if ! mode="$(normalize_mode "$mode_input")"; then
  err "mode must be auto|small|medium|large (or lite|standard|extended)"
  exit 1
fi

if [[ ! -e "$target" ]]; then
  err "path not found: $target"
  exit 1
fi

if ! is_under_docs_prd "$target"; then
  err "target must be under docs/prd: $target"
  exit 1
fi

strict_file_regex='^[0-9]{8}_[0-9]{2,}_[a-z0-9-]{1,32}\.md$'
strict_dir_regex='^[0-9]{8}_[0-9]{2,}_[a-z0-9-]{1,32}$'

if [[ -f "$target" ]]; then
  if [[ "$mode" == "auto" ]]; then
    mode="small"
  fi
  if [[ "$mode" != "small" ]]; then
    err "file target only supports small/lite mode"
  fi

  file_name="$(basename "$target")"
  if [[ ! "$file_name" =~ $strict_file_regex ]]; then
    report_naming_issue "invalid small(lite) filename: $file_name (must be YYYYMMDD_index_short-slug.md)"
  fi
  check_slug_quality "$file_name"

  check_metadata "$target"
  check_small_content "$target"

  if (( errors > 0 )); then
    exit 1
  fi

  echo "[OK] small(lite) package validation passed: $target"
  if (( warnings > 0 )); then
    echo "[WARN] naming warnings: $warnings" >&2
  fi
  exit 0
fi

if [[ -d "$target" ]]; then
  if [[ "$mode" == "auto" ]]; then
    mode="medium"
  fi

  if [[ "$mode" != "medium" && "$mode" != "large" ]]; then
    err "directory target only supports medium|large (or standard|extended) mode"
    exit 1
  fi

  dir_name="$(basename "$target")"
  if [[ ! "$dir_name" =~ $strict_dir_regex ]]; then
    report_naming_issue "invalid directory name: $dir_name (must be YYYYMMDD_index_short-slug)"
  fi
  check_slug_quality "$dir_name"

  standard_required=(
    "README.md"
    "01_产品方案_PRD.md"
    "02_技术方案_架构与接口.md"
    "03_数据模型与存储设计.md"
    "04_风控与安全策略.md"
    "05_时序与状态机.md"
    "06_实施计划_测试与回滚.md"
  )

  extended_required=(
    "00_现状审计.md"
    "07_评审意见与回复.md"
    "08_专项方案.md"
    "09_未来实现草案.md"
  )

  for f in "${standard_required[@]}"; do
    [[ -f "$target/$f" ]] || err "missing file: $target/$f"
  done

  if [[ "$mode" == "large" ]]; then
    for f in "${extended_required[@]}"; do
      [[ -f "$target/$f" ]] || err "missing extended file: $target/$f"
    done
  fi

  if [[ -f "$target/README.md" ]] && ! grep -q "阅读顺序" "$target/README.md"; then
    err "$target/README.md missing 阅读顺序 section"
  fi

  while IFS= read -r md_file; do
    check_metadata "$md_file"
  done < <(find "$target" -maxdepth 1 -type f -name "*.md" | sort)

  if [[ "$mode" == "medium" ]]; then
    check_medium_content "$target"
  fi
  if [[ "$mode" == "large" ]]; then
    check_large_content "$target"
  fi

  if (( errors > 0 )); then
    exit 1
  fi

  if [[ "$mode" == "medium" ]]; then
    echo "[OK] medium(standard) package validation passed: $target"
  else
    echo "[OK] large(extended) package validation passed: $target"
  fi
  if (( warnings > 0 )); then
    echo "[WARN] naming warnings: $warnings" >&2
  fi
  exit 0
fi

err "unsupported target type: $target"
exit 1
