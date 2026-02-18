#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") <feature_name> [small|medium|large] [docs_prd_path]
  $(basename "$0") <feature_name> [lite|standard|extended] [docs_prd_path]  # backward-compatible

Examples:
  $(basename "$0") order_rule_center medium docs/prd
  $(basename "$0") post_dev_summary small
  $(basename "$0") post_dev_summary lite
USAGE
}

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage
  exit 1
fi

feature_raw="$1"
mode_input="${2:-medium}"
root="${3:-docs/prd}"

normalize_mode() {
  local input="$1"
  case "$input" in
    small|lite) echo "small" ;;
    medium|standard) echo "medium" ;;
    large|extended) echo "large" ;;
    *)
      return 1
      ;;
  esac
}

if ! mode="$(normalize_mode "$mode_input")"; then
  echo "error: mode must be small|medium|large (or lite|standard|extended)" >&2
  exit 1
fi

layout_mode="$mode"
case "$mode" in
  small) layout_mode="lite" ;;
  medium) layout_mode="standard" ;;
  large) layout_mode="extended" ;;
esac

if [[ ! "$root" =~ ^docs/prd(/.*)?$ ]]; then
  echo "error: docs_prd_path must be under docs/prd: $root" >&2
  exit 1
fi

mkdir -p "$root"

slug="$(
  echo "$feature_raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[[:space:]_]+/-/g; s/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//'
)"
if [[ -z "$slug" ]]; then
  echo "error: feature_name is empty after normalization" >&2
  exit 1
fi

if (( ${#slug} > 32 )); then
  echo "error: slug too long (>32): $slug" >&2
  exit 1
fi

slug_words="$(awk -F- '{print NF}' <<< "$slug")"
if (( slug_words < 2 || slug_words > 5 )); then
  echo "warning: slug is recommended to contain 2-5 words: $slug" >&2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prefix="$("$script_dir/next_prd_index.sh" "$root")"
now="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S UTC+8')"

write_header() {
  local path="$1"
  local title="$2"
  local purpose="$3"
  cat > "$path" <<EOF_MD
# $title

**成文日期**：$now
**最后修订**：$now

本文档用于$purpose。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---
EOF_MD
}

append_core_prd_sections() {
  local path="$1"
  local tier="$2"
  local package_name="$3"
  cat >> "$path" <<EOF_MD

## 文档档位与产物策略

- tier：$tier
- 交付模式：$( [[ "$tier" == "small" ]] && echo "single_file" || echo "package_dir" )
- 判档依据：[待补充]

## 存储路径与命名规范

- root_path：$root
- package_name：$package_name
- 命名规则：YYYYMMDD_index_short-slug（short-slug 建议 2-5 词，长度 <= 32）

## 背景与目标

- [ ] 背景问题
- [ ] 目标指标

## 现状审计（As-Is）

- [ ] 现有页面/交互盘点
- [ ] 现有接口盘点
- [ ] 现有数据表盘点
- [ ] 现有权限与埋点盘点

## 改造策略确认闸门

- current_stage：pre_production / production（待确认）
- strategy：replace / migrate / hybrid（待确认）
- user_confirmation：pending / confirmed
- 决策理由与回退约束：[待补充]

## 能力复用与重复建设审查

- existing_scan：[待补充]
- build_vs_reuse：reuse / extend / new_build（待确认）
- non_reuse_reason（若 new_build 必填）：[待补充]
- consolidation_plan：[待补充]

## 改造影响矩阵与灰度切换

- [ ] impact_matrix（至少覆盖页面/接口/数据/权限）
- [ ] 灰度策略（维度、节奏、监控）
- [ ] 回滚策略（触发条件、步骤、时长）

## 验收标准

- [ ] 功能验收
- [ ] 接口验收
- [ ] 回归验收

## 修改日志

- $now：初始化文档骨架
EOF_MD
}

write_topic_md() {
  local path="$1"
  local title="$2"
  local purpose="$3"
  write_header "$path" "$title" "$purpose"
  cat >> "$path" <<'EOF_MD'

## 待补充

- [ ] 补充核心内容
EOF_MD
}

if [[ "$layout_mode" == "lite" ]]; then
  file_path="$root/${prefix}_${slug}.md"
  write_header "$file_path" "PRD：$feature_raw" "记录本次需求或开发交付"
  append_core_prd_sections "$file_path" "small" "${prefix}_${slug}.md"
  echo "$file_path"
  exit 0
fi

dir_path="$root/${prefix}_${slug}"
mkdir -p "$dir_path"

cat > "$dir_path/README.md" <<EOF_README
# PRD 包：$feature_raw

**成文日期**：$now
**最后修订**：$now

本文档为本专题 PRD 包入口。阅读时当前系统实现可能已发生变化，请以实际代码与产品行为为准，谨慎参考。

---

## 文档档位与产物策略

- tier：$mode
- package_path：$dir_path
- 判档依据：[待补充]

## 存储路径与命名规范

- root_path：$root
- package_name：${prefix}_${slug}
- 命名规则：YYYYMMDD_index_short-slug（short-slug 建议 2-5 词，长度 <= 32）

## 背景

1. [待补充]

## 阅读顺序

1. 01_产品方案_PRD.md
2. 02_技术方案_架构与接口.md
3. 03_数据模型与存储设计.md
4. 04_风控与安全策略.md
5. 05_时序与状态机.md
6. 06_实施计划_测试与回滚.md
$( [[ "$layout_mode" == "extended" ]] && printf '7. 00_现状审计.md\n8. 07_评审意见与回复.md\n9. 08_专项方案.md\n10. 09_未来实现草案.md\n' )

## 关键决策

1. [待补充]

## 非目标

1. [待补充]
EOF_README

write_header "$dir_path/01_产品方案_PRD.md" "01 产品方案 PRD：$feature_raw" "定义产品目标、范围与验收标准"
append_core_prd_sections "$dir_path/01_产品方案_PRD.md" "$mode" "${prefix}_${slug}"
write_topic_md "$dir_path/02_技术方案_架构与接口.md" "02 技术方案：架构与接口" "定义技术架构、接口契约与兼容策略"
write_topic_md "$dir_path/03_数据模型与存储设计.md" "03 数据模型与存储设计" "定义核心实体、字段与存储策略"
write_topic_md "$dir_path/04_风控与安全策略.md" "04 风控与安全策略" "定义权限、限流、审计与安全策略"
write_topic_md "$dir_path/05_时序与状态机.md" "05 时序与状态机" "定义时序流程与状态流转规则"
write_topic_md "$dir_path/06_实施计划_测试与回滚.md" "06 实施计划、测试与回滚" "定义实施阶段、测试矩阵与回滚方案"

if [[ "$layout_mode" == "extended" ]]; then
  write_topic_md "$dir_path/00_现状审计.md" "00 现状审计" "记录当前实现、问题与影响面"
  write_topic_md "$dir_path/07_评审意见与回复.md" "07 评审意见与回复" "记录评审问题、回复与采纳状态"
  write_topic_md "$dir_path/08_专项方案.md" "08 专项方案" "记录专项方案与验收要求"
  write_topic_md "$dir_path/09_未来实现草案.md" "09 未来实现草案" "记录后续阶段规划与边界"
fi

echo "$dir_path"
