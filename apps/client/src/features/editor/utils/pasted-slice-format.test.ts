import { describe, expect, it } from "vitest";
import { DOMParser as PMDOMParser, Slice } from "@tiptap/pm/model";
import { createTestEditor } from "./paste-test-utils";
import { normalizePastedSlice } from "./pasted-slice-format";

function parseSlice(html: string): Slice {
  const editor = createTestEditor();
  const body = new window.DOMParser().parseFromString(html, "text/html").body;
  return PMDOMParser.fromSchema(editor.schema).parseSlice(body, {
    preserveWhitespace: true,
  });
}

function normalize(html: string): { json: unknown; openStart: number; openEnd: number } {
  const editor = createTestEditor();
  const cleaned = normalizePastedSlice(parseSlice(html), editor.schema);
  return {
    json: cleaned.toJSON(),
    openStart: cleaned.openStart,
    openEnd: cleaned.openEnd,
  };
}

function contentOf(json: any): any[] {
  return json.content;
}

describe("normalizePastedSlice", () => {
  it("is a no-op on an empty slice", () => {
    const editor = createTestEditor();
    expect(normalizePastedSlice(Slice.empty, editor.schema)).toBe(Slice.empty);
  });

  it("drops empty paragraphs (space / NBSP / newline placeholders)", () => {
    const { json } = normalize(
      "<p>a</p><p> </p><p>&nbsp;</p><p>\n</p><p>b</p>",
    );
    const texts = contentOf(json)
      .filter((n: any) => n.type === "paragraph")
      .map((n: any) => n.content?.[0]?.text ?? "");
    expect(texts).toEqual(["a", "b"]);
  });

  it("collapses consecutive hardBreaks and strips edge breaks inside a paragraph", () => {
    const { json } = normalize("<p><br>a<br><br><br>b<br></p>");
    const paragraph = (json as any).content[0];
    expect(paragraph.content.map((n: any) => n.type)).toEqual([
      "text",
      "hardBreak",
      "text",
    ]);
  });

  it("normalizes top-level inline fragments (no paragraph wrapper)", () => {
    const { json } = normalize("a<br><br><br>b");
    expect((json as any).content.map((n: any) => n.type)).toEqual([
      "text",
      "hardBreak",
      "text",
    ]);
  });

  it("drops top-level whitespace text between blocks (preserveWhitespace artifact)", () => {
    // The "\n" between "</h2>" and "<p>" parses as a stray top-level text
    // node; it must not render as a blank line.
    const { json } = normalize("<h2>标题</h2>\n<p>段落一。</p>");
    expect((json as any).content.map((n: any) => n.type)).toEqual([
      "heading",
      "paragraph",
    ]);
    expect((json as any).content[1].content[0].text).toBe("段落一。");
  });

  it("treats a mention-only paragraph as valid content", () => {
    const { json } = normalize(
      '<p><span data-type="mention" data-id="1">@user</span></p>',
    );
    expect(contentOf(json)).toHaveLength(1);
    expect((json as any).content[0].content[0].type).toBe("mention");
  });

  it("keeps image / mathBlock-only blocks", () => {
    const { json } = normalize(
      '<p><img src="https://example.com/a.png"></p><div data-type="mathBlock" data-katex="true">x^2</div>',
    );
    const types = contentOf(json).map((n: any) => n.type);
    expect(types).toEqual(["image", "mathBlock"]);
  });

  it("recurses into blockquotes and drops interior empty paragraphs", () => {
    const { json } = normalize(
      "<blockquote><p>q1</p><p> </p><p>q2</p></blockquote>",
    );
    const quote = contentOf(json)[0];
    expect(quote.content.map((n: any) => n.content[0]?.text)).toEqual([
      "q1",
      "q2",
    ]);
  });

  it("drops an entirely empty blockquote", () => {
    const { json } = normalize("<p>a</p><blockquote><p> </p></blockquote><p>b</p>");
    expect(contentOf(json).map((n: any) => n.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });

  it("preserves list hierarchy and listItem paragraph boundaries (no unwrap)", () => {
    const { json } = normalize(
      "<ol><li><p>one</p></li><li><p>two</p><ul><li><p>nested</p></li></ul></li></ol>",
    );
    const list = contentOf(json)[0];
    expect(list.content[0].content[0].type).toBe("paragraph");
    expect(list.content[1].content[1].type).toBe("bulletList");
    expect(list.content[1].content[1].content[0].content[0].type).toBe(
      "paragraph",
    );
  });

  it("keeps the schema-required placeholder paragraph in empty list items", () => {
    const { json } = normalize("<ul><li></li><li>keep</li></ul>");
    const items = contentOf(json)[0].content;
    expect(items).toHaveLength(2);
    expect(items[0].content).toHaveLength(1);
    expect(items[0].content[0].type).toBe("paragraph");
  });

  it("keeps empty table cells (schema-mandated placeholder)", () => {
    const { json } = normalize("<table><tr><td></td><td>x</td></tr></table>");
    const row = contentOf(json)[0].content[0];
    expect(row.content).toHaveLength(2);
    expect(row.content[0].content[0].type).toBe("paragraph");
    expect(row.content[1].content[0].content[0].text).toBe("x");
  });

  it("preserves code block blank lines verbatim", () => {
    const { json } = normalize(
      "<p>a</p><pre><code>const a = 1;\n\n\nconst b = 2;</code></pre><p>b</p>",
    );
    const code = contentOf(json).find((n: any) => n.type === "codeBlock");
    expect(code.content[0].text).toBe("const a = 1;\n\n\nconst b = 2;");
  });

  it("preserves marks on surviving content", () => {
    const { json } = normalize(
      "<p>a</p><p><strong>keep </strong></p><p><em>b</em></p>",
    );
    const keep = contentOf(json)[1];
    expect(keep.content[0].marks?.[0]?.type).toBe("bold");
    expect(keep.content[0].text).toBe("keep ");
  });

  it("keeps open depths when slice edges carry real content", () => {
    const { openStart, openEnd } = normalize("<p>a</p><p>b</p>");
    expect(openStart).toBe(1);
    expect(openEnd).toBe(1);
  });

  it("closes the slice when a phantom edge paragraph is removed", () => {
    const { openStart, openEnd } = normalize("<p></p><p>a</p>");
    expect(openStart).toBe(0);
    expect(openEnd).toBe(0);
  });

  it("is idempotent", () => {
    const editor = createTestEditor();
    const once = normalizePastedSlice(
      parseSlice("<p></p><p>a<br><br>b</p><p> </p><ul><li></li></ul>"),
      editor.schema,
    );
    const twice = normalizePastedSlice(once, editor.schema);
    expect(twice.toJSON()).toEqual(once.toJSON());
    expect(twice.openStart).toBe(once.openStart);
    expect(twice.openEnd).toBe(once.openEnd);
  });
});
