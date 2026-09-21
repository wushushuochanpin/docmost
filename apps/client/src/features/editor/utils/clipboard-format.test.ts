import { describe, expect, it } from "vitest";
import {
  formatCodeBlockAsMarkdown,
  normalizeMarkdownClipboard,
  normalizePlainTextClipboard,
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
