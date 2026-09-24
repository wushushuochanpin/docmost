import { describe, expect, it } from "vitest";
import {
  formatCodeBlockAsMarkdown,
  normalizeMarkdownClipboard,
  normalizePlainTextClipboard,
  repairMarkdownTables,
  tightenListBlankLines,
} from "./clipboard-format";

describe("normalizePlainTextClipboard", () => {
  it("collapses excessive blank lines", () => {
    expect(normalizePlainTextClipboard("\n\nA\n\n\n\nB\n\n")).toBe("A\n\nB");
  });
});

describe("normalizeMarkdownClipboard", () => {
  it("collapses excessive blank lines outside fenced code blocks", () => {
    const markdown = [
      "# Title",
      "",
      "",
      "Paragraph",
      "",
      "",
      "```ts",
      "const a = 1;",
      "",
      "",
      "const b = 2;",
      "```",
      "",
      "",
      "Tail",
    ].join("\n");

    expect(normalizeMarkdownClipboard(markdown)).toBe(
      [
        "# Title",
        "",
        "Paragraph",
        "",
        "```ts",
        "const a = 1;",
        "",
        "",
        "const b = 2;",
        "```",
        "",
        "Tail",
      ].join("\n"),
    );
  });
});

describe("formatCodeBlockAsMarkdown", () => {
  it("wraps code with a language fence", () => {
    expect(formatCodeBlockAsMarkdown("const a = 1;", "ts")).toBe(
      "```ts\nconst a = 1;\n```",
    );
  });

  it("uses a longer fence when the content contains backticks", () => {
    expect(formatCodeBlockAsMarkdown("```markdown\nvalue\n```", "markdown")).toBe(
      "````markdown\n```markdown\nvalue\n```\n````",
    );
  });
});

describe("tightenListBlankLines", () => {
  it("drops blank lines between consecutive ordered list items", () => {
    const markdown = [
      "Intro paragraph",
      "",
      "1. first item",
      "",
      "2. second item",
      "",
      "3. third item",
      "",
      "Tail paragraph",
    ].join("\n");

    expect(tightenListBlankLines(markdown)).toBe(
      [
        "Intro paragraph",
        "",
        "1. first item",
        "2. second item",
        "3. third item",
        "",
        "Tail paragraph",
      ].join("\n"),
    );
  });

  it("drops blank lines between bullet items too", () => {
    const markdown = ["- a", "", "- b", "", "- c"].join("\n");
    expect(tightenListBlankLines(markdown)).toBe("- a\n- b\n- c");
  });

  it("keeps the blank line before the first list item", () => {
    const markdown = ["Intro", "", "1. one", "2. two"].join("\n");
    expect(tightenListBlankLines(markdown)).toBe("Intro\n\n1. one\n2. two");
  });

  it("preserves blank lines inside fenced code blocks", () => {
    const markdown = [
      "1. one",
      "",
      "2. two",
      "",
      "```ts",
      "const a = 1;",
      "",
      "",
      "const b = 2;",
      "```",
      "",
      "3. three",
    ].join("\n");

    expect(tightenListBlankLines(markdown)).toBe(
      [
        "1. one",
        "2. two",
        "",
        "```ts",
        "const a = 1;",
        "",
        "",
        "const b = 2;",
        "```",
        "",
        "3. three",
      ].join("\n"),
    );
  });
});

describe("repairMarkdownTables", () => {
  it("drops the blank line between the delimiter row and the body", () => {
    const markdown = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "",
      "| 1 | 2 | 3 |",
      "| 4 | 5 | 6 |",
    ].join("\n");

    expect(repairMarkdownTables(markdown)).toBe(
      [
        "| A | B | C |",
        "| --- | --- | --- |",
        "| 1 | 2 | 3 |",
        "| 4 | 5 | 6 |",
      ].join("\n"),
    );
  });

  it("drops blank lines between body rows (Gemini loose tables)", () => {
    const markdown = [
      "| 维度组合 | 全天指标：健康 (≥88%) |",
      "| --- | --- |",
      "",
      "| 时段指标：健康 (≥85%) | 🟢 正常态 |",
      "",
      "| 时段指标：偏低 (80%∼85%) | 🟡 黄色预警 |",
    ].join("\n");

    expect(repairMarkdownTables(markdown)).toBe(
      [
        "| 维度组合 | 全天指标：健康 (≥88%) |",
        "| --- | --- |",
        "| 时段指标：健康 (≥85%) | 🟢 正常态 |",
        "| 时段指标：偏低 (80%∼85%) | 🟡 黄色预警 |",
      ].join("\n"),
    );
  });

  it("merges pipe-less continuation lines back into the preceding row (multi-line cells)", () => {
    const markdown = [
      "| 维度组合 | 健康 (≥88%) | 偏低 (83%∼88%) | 崩塌 (<83%) |",
      "| --- | --- | --- | --- |",
      "| 时段健康 (≥85%) | 🟢 正常态 | 🟡 黄色预警 | 🟠 橙色预警 |",
      "（各指标均达标） | （全天拖后腿） | （全天严重失守） |",
    ].join("\n");

    expect(repairMarkdownTables(markdown)).toBe(
      [
        "| 维度组合 | 健康 (≥88%) | 偏低 (83%∼88%) | 崩塌 (<83%) |",
        "| --- | --- | --- | --- |",
        "| 时段健康 (≥85%) | 🟢 正常态<br>（各指标均达标） | 🟡 黄色预警<br>（全天拖后腿） | 🟠 橙色预警<br>（全天严重失守） |",
      ].join("\n"),
    );
  });

  it("merges continuation lines when there are blank lines between them", () => {
    const markdown = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "| row1 | title1 | title2 |",
      "",
      "desc1 | desc2 |",
      "",
      "| row2 | title3 | title4 |",
    ].join("\n");

    expect(repairMarkdownTables(markdown)).toBe(
      [
        "| A | B | C |",
        "| --- | --- | --- |",
        "| row1 | title1<br>desc1 | title2<br>desc2 |",
        "| row2 | title3 | title4 |",
      ].join("\n"),
    );
  });

  it("leaves already-tight WorkBuddy-style tables untouched", () => {
    const markdown = [
      "| 层面 | 叫法 | 出处 |",
      "| --- | --- | --- |",
      "| 圆角做法 | 部分圆角 | SwiftUI |",
      "| 画线方式 | 开放路径 | 描边 |",
    ].join("\n");
    expect(repairMarkdownTables(markdown)).toBe(markdown);
  });

  it("keeps the blank line that separates the table from following text", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "Tail paragraph",
      "",
      "More text",
    ].join("\n");

    expect(repairMarkdownTables(markdown)).toBe(markdown);
  });

  it("preserves blank lines inside fenced code blocks", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "",
      "```ts",
      "const a = 1;",
      "",
      "",
      "const b = 2;",
      "```",
      "",
      "tail paragraph",
    ].join("\n");

    expect(repairMarkdownTables(markdown)).toBe(markdown);
  });

  it("does not treat non-table content as a table", () => {
    const markdown = ["Intro", "", "not | a | table", "", "---", "", "tail"].join(
      "\n",
    );
    expect(repairMarkdownTables(markdown)).toBe(markdown);
  });
});
