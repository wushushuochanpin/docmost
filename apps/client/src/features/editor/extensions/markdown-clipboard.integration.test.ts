import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Slice, DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { createTestEditor } from "../utils/paste-test-utils";
import {
  GEMINI_CLIPBOARD_FIXTURE,
  GEMINI_RICH_TEXT_FIXTURE,
} from "../utils/__fixtures__/gemini-clipboard";

type PastePayload = {
  html?: string;
  text?: string;
  vscode?: string;
  shiftKey?: boolean;
};

/**
 * Drives the real MarkdownClipboard extension through its ProseMirror
 * handlePaste prop with a synthetic clipboard event — the same entry point
 * the browser paste event hits. Returns true when the extension handled the
 * paste (i.e. the default ProseMirror path was bypassed).
 */
function simulatePaste(editor: Editor, payload: PastePayload): boolean {
  const event = {
    clipboardData: {
      getData: (type: string) => {
        switch (type) {
          case "text/html":
            return payload.html ?? "";
          case "text/plain":
            return payload.text ?? "";
          case "vscode-editor-data":
            return payload.vscode ?? "";
          default:
            return "";
        }
      },
    },
    shiftKey: payload.shiftKey ?? false,
    preventDefault() {},
  } as unknown as ClipboardEvent;

  const input = (editor.view as any).input;
  const prevShift = input?.shiftKey;
  if (input) input.shiftKey = payload.shiftKey ?? false;

  try {
    let handled = false;
    editor.view.someProp("handlePaste", (fn) => {
      handled = fn(editor.view, event, Slice.empty) || handled;
      return handled;
    });
    return handled;
  } finally {
    if (input) input.shiftKey = prevShift;
  }
}

function paragraphs(editor: Editor): string[] {
  return (editor.getJSON().content ?? [])
    .filter((n: any) => n.type === "paragraph")
    .map((n: any) => (n.content ?? []).map((c: any) => c.text ?? "").join(""));
}

/** Two-paragraph doc; cursor sits between the two blocks (depth 0). */
function editorBetweenBlocks(): Editor {
  const editor = createTestEditor("<p>before</p><p>after</p>");
  // A collapsed selection at a depth-0 block boundary is legitimate for
  // replaceRange but makes TextSelection.create log a benign warning.
  const error = console.error;
  const warn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    editor.commands.setTextSelection({ from: 8, to: 8 });
  } finally {
    console.error = error;
    console.warn = warn;
  }
  return editor;
}

/** "before after" doc; cursor between the words (mid-paragraph, depth 1). */
function editorMidParagraph(): Editor {
  const editor = createTestEditor("<p>before after</p>");
  editor.commands.setTextSelection({ from: 8, to: 8 });
  return editor;
}

function nodeTypes(editor: Editor): string[] {
  return (editor.getJSON().content ?? []).map((n: any) => n.type);
}

describe("Gemini clipboard fixtures (fixed samples)", () => {
  it("Gemini Copy button payload: blank-line noise removed, structure kept", () => {
    const editor = editorBetweenBlocks();

    expect(
      simulatePaste(editor, {
        html: GEMINI_CLIPBOARD_FIXTURE.textHtml,
        text: GEMINI_CLIPBOARD_FIXTURE.textPlain,
      }),
    ).toBe(true);

    const doc = editor.getJSON() as any;

    // Heading, paragraph, tight ordered list, code block, tail paragraph —
    // no stray blank paragraphs and no top-level whitespace text.
    expect(doc.content.map((n: any) => n.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "orderedList",
      "codeBlock",
      "paragraph",
      "paragraph",
    ]);
    expect(paragraphs(editor)).toEqual(["before", "从 Gemini 复制内容粘贴后会出现多余空行。", "结尾段落。", "after"]);
    // Ordered list is tight: three items, one paragraph each, no gaps.
    const list = doc.content.find((n: any) => n.type === "orderedList");
    expect(list.content).toHaveLength(3);
    expect(list.content.every((li: any) => li.content?.length === 1)).toBe(true);
    expect(list.content.map((li: any) => li.content[0].content[0].text)).toEqual([
      "第一项",
      "第二项",
      "第三项",
    ]);
    // Code block keeps its intentional inner blank line.
    const code = doc.content.find((n: any) => n.type === "codeBlock");
    expect(code.content[0].text).toBe("const a = 1;\n\nconst b = 2;\n");
  });

  it("Gemini rich-text selection payload: <br> runs collapse, loose <li><p> kept", () => {
    const editor = editorBetweenBlocks();

    simulatePaste(editor, {
      html: GEMINI_RICH_TEXT_FIXTURE.textHtml,
      text: GEMINI_RICH_TEXT_FIXTURE.textPlain,
    });

    const doc = editor.getJSON() as any;
    // "第一行<br><br><br>第二行" collapses to a single <br> inside one paragraph.
    const first = doc.content[1];
    expect(first.content.map((n: any) => n.type)).toEqual([
      "text",
      "hardBreak",
      "text",
    ]);
    // Loose list items keep their paragraph boundaries (no li>p unwrap).
    const list = doc.content.find((n: any) => n.type === "bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content[0].content[0].type).toBe("paragraph");
    expect(list.content[0].content[0].content[0].text).toBe("甲");
    expect(list.content[1].content[0].content[0].text).toBe("乙");
  });
});

describe("paste integration matrix", () => {
  it("removes empty paragraphs (space / NBSP / newline placeholders)", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: "<p>a</p><p> </p><p>&nbsp;</p><p>\n</p><p>b</p>",
      text: "a\nb",
    });
    expect(paragraphs(editor)).toEqual(["before", "a", "b", "after"]);
  });

  it("collapses consecutive <br> on mid-paragraph paste", () => {
    const editor = editorMidParagraph();
    simulatePaste(editor, { html: "<p>x<br><br><br>y</p>", text: "x\n\n\ny" });
    const doc = editor.getJSON() as any;
    const content = doc.content[0].content;
    expect(content.map((n: any) => n.type)).toEqual([
      "text",
      "hardBreak",
      "text",
    ]);
    expect(content.map((n: any) => n.text ?? "")).toEqual(["before x", "", "yafter"]);
  });

  it("handles nested lists without losing hierarchy", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: "<ol><li>one<ul><li>nested</li></ul></li><li>two</li></ol>",
      text: "1. one\n   - nested\n2. two",
    });
    const doc = editor.getJSON() as any;
    const list = doc.content.find((n: any) => n.type === "orderedList");
    expect(list.content).toHaveLength(2);
    expect(list.content[0].content[1].type).toBe("bulletList");
    expect(list.content[0].content[1].content[0].content[0].content[0].text).toBe(
      "nested",
    );
    expect(list.content[1].content[0].content[0].text).toBe("two");
  });

  it("cleans blockquote interiors and drops fully empty quotes", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: "<blockquote><p>q1</p><p> </p><p>q2</p></blockquote><blockquote><p></p></blockquote>",
      text: "> q1\n>\n> q2\n>\n>",
    });
    const doc = editor.getJSON() as any;
    const quotes = doc.content.filter((n: any) => n.type === "blockquote");
    expect(quotes).toHaveLength(1);
    expect(quotes[0].content.map((n: any) => n.content[0].text)).toEqual([
      "q1",
      "q2",
    ]);
  });

  it("keeps empty table cells as valid placeholders", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: "<table><tr><td></td><td>x</td></tr></table>",
      text: "",
    });
    const doc = editor.getJSON() as any;
    const table = doc.content.find((n: any) => n.type === "table");
    const row = table.content[0];
    expect(row.content).toHaveLength(2);
    expect(row.content[0].content[0].type).toBe("paragraph");
  });

  it("pastes a Gemini-style loose GFM table as one full table (blank lines inside the table do not split it)", () => {
    // Gemini's Copy button emits markdown with blank lines inside tables
    // (after the delimiter row and between body rows), just like its known
    // loose-list behavior. marked would terminate the table at the first
    // blank line, turning the header into a lone 1-row table and dropping the
    // body rows into literal-text paragraphs ("第一行识别为表格了，另外几行成文本了").
    const markdown = [
      "| 维度组合 | 全天指标：健康 (≥88%) | 全天指标：偏低 (83%∼88%) | 全天指标：崩塌 (<83%) |",
      "| --- | --- | --- | --- |",
      "",
      "| 时段指标：健康 (≥85%) | 🟢 正常态（各指标均达标，无告警） | 🟡 黄色预警（全天拖后腿，触发基础关注） | 🟠 橙色预警（全天严重失守，拉响警报） |",
      "",
      "| 时段指标：偏低 (80%∼85%) | 🟡 黄色预警（时段开始恶化，局部告警） | 🟠 橙色预警（双指标同时偏低，升级应对） | 🔴 红色预警（历史与当下双双崩塌） |",
      "",
      "| 时段指标：崩塌 (<80%) | 🟠 橙色预警（时段突发恶劣，立即介入） | 🔴 红色预警（现场爆仓，全员升级） | 🔴 红色预警（系统性瘫痪，最高级别） |",
    ].join("\n");
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: `<pre style="white-space:pre-wrap">${markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
      text: markdown,
    });
    const doc = editor.getJSON() as any;
    const table = doc.content.find((n: any) => n.type === "table");
    expect(table).toBeTruthy();
    // Header row + 3 body rows, 4 cells each — no stray pipe-text paragraphs.
    expect(table.content).toHaveLength(4);
    expect(table.content.every((row: any) => row.content.length === 4)).toBe(true);
    expect(table.content[0].content[0].content[0].content[0].text).toBe("维度组合");
    expect(table.content[1].content[0].content[0].content[0].text).toBe(
      "时段指标：健康 (≥85%)",
    );
    expect(table.content[1].content[1].content[0].content[0].text).toBe(
      "🟢 正常态（各指标均达标，无告警）",
    );
    expect(table.content[3].content[3].content[0].content[0].text).toBe(
      "🔴 红色预警（系统性瘫痪，最高级别）",
    );
    // No literal pipe paragraphs leaked out of the table body.
    expect(
      doc.content.some(
        (n: any) => n.type === "paragraph" && /^\s*\|/.test(n.content?.[0]?.text ?? ""),
      ),
    ).toBe(false);
  });

  it("pastes a Gemini multi-line-cell table (pipe-less continuation lines merged into cells)", () => {
    // Gemini's Copy button emits multi-line table cells as:
    //   | row | title1 | title2 | title3 |
    //   desc1 | desc2 | desc3 |
    // The continuation line has NO leading pipe, so marked treats it as a
    // paragraph. The pre-processor merges it back into the preceding row's
    // cells (joined with <br>), producing a proper multi-line-cell table.
    const markdown = [
      "| 维度组合 | 全天指标：健康 (≥88%) | 全天指标：偏低 (83%∼88%) | 全天指标：崩塌 (<83%) |",
      "| --- | --- | --- | --- |",
      "| 时段指标：健康 (≥85%) | 🟢 正常态 | 🟡 黄色预警 | 🟠 橙色预警 |",
      "（各指标均达标，无告警） | （全天拖后腿，触发基础关注） | （全天严重失守，拉响警报） |",
      "| 时段指标：偏低 (80%∼85%) | 🟡 黄色预警 | 🟠 橙色预警 | 🔴 红色预警 |",
      "（时段开始恶化，局部告警） | （双指标同时偏低，升级应对） | （历史与当下双双崩塌） |",
      "| 时段指标：崩塌 (<80%) | 🟠 橙色预警 | 🔴 红色预警 | 🔴 红色预警 |",
      "（时段突发恶劣，立即介入） | （现场爆仓，全员升级） | （系统性瘫痪，最高级别） |",
    ].join("\n");
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: `<pre style="white-space:pre-wrap">${markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
      text: markdown,
    });
    const doc = editor.getJSON() as any;
    const table = doc.content.find((n: any) => n.type === "table");
    expect(table).toBeTruthy();
    // Header + 3 body rows, 4 cells each.
    expect(table.content).toHaveLength(4);
    expect(table.content.every((row: any) => row.content.length === 4)).toBe(true);
    // Row 1 cell 2 should contain both title and description (merged).
    const cellText = (cell: any) =>
      (cell.content ?? [])
        .map((p: any) => (p.content ?? []).map((s: any) => s.text ?? "").join(""))
        .join("");
    expect(cellText(table.content[1].content[1])).toContain("🟢 正常态");
    expect(cellText(table.content[1].content[1])).toContain("（各指标均达标，无告警）");
    expect(cellText(table.content[3].content[3])).toContain("🔴 红色预警");
    expect(cellText(table.content[3].content[3])).toContain("（系统性瘫痪，最高级别）");
    // No stray pipe paragraphs.
    expect(
      doc.content.some(
        (n: any) => n.type === "paragraph" && /^\s*\|/.test(n.content?.[0]?.text ?? ""),
      ),
    ).toBe(false);
  });

  it("keeps image / formula blocks (non-text content is valid)", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, {
      html: '<p><img src="https://example.com/a.png"></p><div data-type="mathBlock" data-katex="true">x^2</div>',
      text: "",
    });
    expect(nodeTypes(editor)).toEqual([
      "paragraph",
      "image",
      "mathBlock",
      "paragraph",
    ]);
  });

  it("parses Markdown correctly then cleans (fenced code preserved)", () => {
    const editor = editorBetweenBlocks();
    const markdown = [
      "## 标题",
      "",
      "",
      "段落一。",
      "",
      "```ts",
      "const a = 1;",
      "",
      "const b = 2;",
      "```",
      "",
      "段落二。",
      "",
      "",
    ].join("\n");
    simulatePaste(editor, { text: markdown });
    expect(nodeTypes(editor)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "codeBlock",
      "paragraph",
      "paragraph",
    ]);
    expect(paragraphs(editor)).toEqual(["before", "段落一。", "段落二。", "after"]);
    const code: any = (editor.getJSON() as any).content.find(
      (n: any) => n.type === "codeBlock",
    );
    expect(code.content[0].text).toBe("const a = 1;\n\nconst b = 2;\n");
  });

  it("folds blank lines in plain-text pastes", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, { text: "a\n\n\n\nb" });
    expect(paragraphs(editor)).toEqual(["before", "a", "b", "after"]);
  });

  it("plain-text without formatting (shift+paste) defers to the default path", () => {
    const editor = editorBetweenBlocks();
    const handled = simulatePaste(editor, {
      text: "a\n\nb",
      shiftKey: true,
    });
    expect(handled).toBe(false);
  });

  it("the default path (transformPasted) applies the same cleanup", () => {
    const editor = createTestEditor("<p>start</p>");
    const body = new window.DOMParser().parseFromString(
      "<p>a</p><p> </p><p>b</p>",
      "text/html",
    ).body;
    const slice = PMDOMParser.fromSchema(editor.schema).parseSlice(body, {
      preserveWhitespace: true,
    });
    let transformed: Slice | null = null;
    editor.view.someProp("transformPasted", (fn) => {
      transformed = fn(slice, editor.view);
      return true;
    });
    expect(transformed).not.toBeNull();
    const json = transformed!.toJSON() as any;
    expect(json.content.map((n: any) => n.content?.[0]?.text ?? "")).toEqual([
      "a",
      "b",
    ]);
  });

  it("no phantom blanks at a realistic cursor (start of following paragraph)", () => {
    const editor = createTestEditor("<p>before</p><p>after</p>");
    editor.commands.setTextSelection({ from: 9, to: 9 });
    simulatePaste(editor, { html: "<p>a</p><p>b</p><p> </p>", text: "a\nb" });
    const doc = editor.getJSON() as any;
    // Removing the trailing phantom paragraph closes the slice, so the
    // insertion is a clean block insert — no empty paragraph, no edge merge.
    expect(
      doc.content.some(
        (n: any) => n.type === "paragraph" && !n.content?.length,
      ),
    ).toBe(false);
    expect(paragraphs(editor)).toEqual(["before", "a", "b", "after"]);
  });

  it("preserves code block blank lines when pasting plain code text", () => {
    const editor = editorBetweenBlocks();
    const code = "```ts\nconst a = 1;\n\n\nconst b = 2;\n```";
    simulatePaste(editor, { text: code });
    const doc = editor.getJSON() as any;
    const block = doc.content.find((n: any) => n.type === "codeBlock");
    expect(block.content[0].text).toBe("const a = 1;\n\n\nconst b = 2;\n");
  });
});

describe("undo and post-paste manual blank lines", () => {
  it("undo reverts the pasted content", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, { html: "<p>x</p>", text: "x" });
    expect(paragraphs(editor)).toEqual(["before", "x", "after"]);
    expect(editor.commands.undo()).toBe(true);
    expect(paragraphs(editor)).toEqual(["before", "after"]);
  });

  it("manual blank lines added after paste survive reload and are never swept", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, { html: "<p>a</p>", text: "a" });
    expect(paragraphs(editor)).toEqual(["before", "a", "after"]);

    // User manually adds a blank paragraph right after the pasted content.
    editor.commands.setTextSelection({ from: 11, to: 11 });
    editor.commands.insertContent({ type: "paragraph" });
    expect(paragraphs(editor)).toEqual(["before", "a", "", "after"]);

    // Load / refresh roundtrip (setContent is the load path): the manual
    // blank line must survive — cleanup only ever runs on paste slices.
    const snapshot = JSON.stringify(editor.getJSON());
    editor.commands.setContent(JSON.parse(snapshot));
    expect(paragraphs(editor)).toEqual(["before", "a", "", "after"]);
  });

  it("a second paste does not re-introduce or strip manual blank lines", () => {
    const editor = editorBetweenBlocks();
    simulatePaste(editor, { html: "<p>a</p>", text: "a" });
    expect(paragraphs(editor)).toEqual(["before", "a", "after"]);

    // Manual blank line stays between "a" and "after".
    editor.commands.setTextSelection({ from: 11, to: 11 });
    editor.commands.insertContent({ type: "paragraph" });
    expect(paragraphs(editor)).toEqual(["before", "a", "", "after"]);

    // Paste again at the end — only the new pasted slice is cleaned.
    editor.commands.setTextSelection({
      from: editor.state.doc.content.size,
      to: editor.state.doc.content.size,
    });
    simulatePaste(editor, { html: "<p>b</p><p> </p>", text: "b" });
    expect(paragraphs(editor)).toEqual(["before", "a", "", "after", "b"]);
  });
});
