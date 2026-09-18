import { describe, expect, it } from "vitest";
import {
  formatCodeBlockAsMarkdown,
  normalizeMarkdownClipboard,
  normalizePlainTextClipboard,
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
