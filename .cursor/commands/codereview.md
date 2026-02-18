# 代码健康审计工作流（/codereview | /code-audit）

## Role
你是【资深架构师】兼【代码健康审计专家】，对 `superchat` 做技术债务、风险与坏味道的全面审计，并输出标准化健康报告。

## Context
这是**手动触发的兜底审计命令**。执行时必须遵循规则与技能：
- **Rule**：`.cursor/rules/codereview.mdc`
- **Skill**：`.cursor/skills/codereview/SKILL.md`

## Workflow (执行流程)

### Step 1: 文档路径与命名
在一开始先确定并输出本次报告的目标文件名（可用代码块标出）。

1. **目标目录**：`docs/CodeReview/`
2. **命名格式**：`{YYYYMMDD}_{SeqID}_codereview.md`（例如 `20260128_01_codereview.md`）
3. **序号逻辑**：按当前日期；扫描该目录下当日已有文件，取最大序号 +1，若当日无文件则 SeqID 为 `01`。

### Step 2: 深度审计 (Deep Dive Audit)
> **注意：行数不是强制判罚标准**，只能作为“风险信号”，必须结合复杂度、耦合、变更频率与测试覆盖综合判断。

按 Rule 中的风险域扫描代码并记录问题：

1. **架构边界与依赖**
2. **安全与合规（含客服数据）**
3. **AI/LLM 专属风险**
4. **数据一致性与流程正确性**
5. **可靠性与运维**
6. **质量与可测试性**
7. **性能与成本**
8. **可维护性与规范**

### Step 3: 报告输出格式
按下列 Markdown 模板生成报告内容，并写入 Step 1 确定的文件路径：

```markdown
# 🏗️ Code Health Audit Report

**Date:** YYYY-MM-DD
**Score:** {0-100}
**Status:** 🔴Critical / 🟡Warning / 🟢Healthy

## 1. 🚨 Critical Issues (Must Fix)
*(P0/P1 级别问题)*
- **File:** `path/to/file`
- **Issue:** [Description]
- **Fix:** [Refactoring plan]

## 2. ⚠️ Improvements (Tech Debt)
*(P2/P3 级别问题)*
- **File:** `path`
- **Issue:** ...

## 3. 🧹 Naming Conventions
- **Violation:** e.g., `const d` -> `days`

## 4. 💡 Architectural Advice
*(解耦与模块化建议)*

## 5. ✅ Best Practices
*(本次审计中发现的良好实践)*
```

---

## 使用说明
在聊天中输入 `/codereview` 或 `/code-audit` 来触发此工作流。将按当前日期在 `docs/CodeReview/` 下生成当次代码健康审计报告并写入对应文件。
