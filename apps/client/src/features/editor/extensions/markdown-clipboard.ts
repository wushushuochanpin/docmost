// adapted from: https://github.com/aguingand/tiptap-markdown/blob/main/src/extensions/tiptap/clipboard.js - MIT
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DOMParser, DOMSerializer, Fragment, Slice } from "@tiptap/pm/model";
import { find } from "linkifyjs";
import { markdownToHtml, htmlToMarkdown } from "@docmost/editor-ext";

export const MarkdownClipboard = Extension.create({
  name: "markdownClipboard",
  priority: 101,

  addOptions() {
    return {
      transformPastedText: false,
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("markdownClipboard"),
        props: {
          clipboardTextSerializer: (slice) => {
            const listTypes = ["bulletList", "orderedList", "taskList"];
            let topLevelCount = 0;
            let hasList = false;
            slice.content.forEach((node) => {
              if (listTypes.includes(node.type.name)) {
                hasList = true;
                topLevelCount += node.childCount;
              } else {
                topLevelCount++;
              }
            });

            if (!hasList || topLevelCount < 2) return null;

            const div = document.createElement("div");
            const serializer = DOMSerializer.fromSchema(this.editor.schema);
            const fragment = serializer.serializeFragment(slice.content);
            div.appendChild(fragment);
            return htmlToMarkdown(div.innerHTML);
          },
          handlePaste: (view, event, slice) => {
            if (!event.clipboardData) {
              return false;
            }

            if (this.editor.isActive("codeBlock")) {
              return false;
            }

            const text = event.clipboardData.getData("text/plain");
            const html = event.clipboardData.getData("text/html");
            const vscode = event.clipboardData.getData("vscode-editor-data");
            const vscodeData = vscode ? JSON.parse(vscode) : undefined;
            const language = vscodeData?.mode;

            const isVscodeMarkdown = language === "markdown";
            const isPlainTextOnly = !html && !vscode && !!text;

            // Plain-text pastes (no HTML payload): respect the
            // transformPastedText / shiftKey opt-out and bail out for bare URLs,
            // matching the previous behavior.
            if (isPlainTextOnly && !isVscodeMarkdown) {
              if ((view as any).input?.shiftKey || !this.options.transformPastedText) {
                return false;
              }

              const link = find(text, {
                defaultProtocol: "http",
              }).find((item) => item.isLink && item.value === text);

              if (link) {
                return false;
              }
            }

            let body: HTMLElement;

            if (isVscodeMarkdown || isPlainTextOnly) {
              // Markdown / plain-text source: run through marked so that
              // `$...$` and `$$...$$` are recognized as math nodes.
              const parseOptions = isPlainTextOnly && !isVscodeMarkdown ? { breaks: false } : undefined;
              const parsed = markdownToHtml(text.replace(/\n+$/, ""), parseOptions);
              body = elementFromString(parsed);
            } else if (html) {
              // Rich-text source (web pages, docs apps, ChatGPT, ...): keep the
              // pasted HTML structure, but lift `$...$` / `$$...$$` out of plain
              // text into the math node markers the schema understands. Without
              // this, LaTeX survives as literal text.
              body = new window.DOMParser()
                .parseFromString(html, "text/html")
                .body as HTMLElement;
              extractMathFromDom(body);
            } else {
              return false;
            }

            const { tr } = view.state;
            const { from, to } = view.state.selection;

            normalizeTableColumnWidths(body);

            const contentNodes = DOMParser.fromSchema(
              this.editor.schema,
            ).parseSlice(body, {
              preserveWhitespace: true,
            });

            tr.replaceRange(from, to, contentNodes);
            const insertEnd = tr.mapping.map(from, 1);
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(from, insertEnd - 2)), -1));
            tr.setMeta('paste', true)
            view.dispatch(tr);
            return true;
          },
          // Strip trailing whitespace-only paragraphs from pasted content.
          // Terminals (GNOME Terminal, etc.) often include trailing
          // whitespace in their HTML clipboard data, which ProseMirror
          // parses as an extra paragraph. Inside a list item this creates
          // an orphan empty line that breaks the list structure.
          transformPasted: (slice) => {
            let { content, openStart, openEnd } = slice;

            // Remove trailing paragraphs that contain only whitespace
            while (content.childCount > 1) {
              const lastChild = content.lastChild;
              if (
                lastChild?.type.name === "paragraph" &&
                lastChild.textContent.trim() === ""
              ) {
                const children = [];
                for (let i = 0; i < content.childCount - 1; i++) {
                  children.push(content.child(i));
                }
                content = Fragment.from(children);
              } else {
                break;
              }
            }

            if (content !== slice.content) {
              return new Slice(content, openStart, Math.max(openEnd, 1));
            }

            return slice;
          },
        },
      }),
    ];
  },
});

function elementFromString(value) {
  // add a wrapper to preserve leading and trailing whitespace
  const wrappedValue = `<body>${value}</body>`;

  return new window.DOMParser().parseFromString(wrappedValue, "text/html").body;
}

// Mirrors the delimiter rules used by the marked math extensions so that
// pasted rich-text (which never carries the `data-type="mathInline"` markers
// the schema expects) still lifts `$...$` and `$$...$$` out of plain text.
const INLINE_MATH_PASTE_RE = /\$(?!\s)([^$]+?)(?<!\s)\$(?!\d)/g;
const BLOCK_MATH_PASTE_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;
const SKIP_MATH_PASTE_SELECTOR =
  "code, pre, script, style, [data-type='mathInline'], [data-type='mathBlock']";

function extractMathFromDom(root: HTMLElement): void {
  // Block math: a block-level element whose entire text content is a
  // `$$...$$` span becomes a mathBlock node.
  const blockCandidates = root.querySelectorAll(
    "p, div, li, h1, h2, h3, h4, h5, h6",
  );
  for (const el of Array.from(blockCandidates)) {
    if (el.closest(SKIP_MATH_PASTE_SELECTOR)) continue;
    const text = el.textContent || "";
    const m = text.match(BLOCK_MATH_PASTE_RE);
    if (!m) continue;
    const mathDiv = document.createElement("div");
    mathDiv.setAttribute("data-type", "mathBlock");
    mathDiv.setAttribute("data-katex", "true");
    mathDiv.textContent = m[1].trim();
    el.replaceWith(mathDiv);
  }

  // Inline math: walk remaining text nodes and split `$...$` runs into
  // mathInline spans.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest(SKIP_MATH_PASTE_SELECTOR)) continue;
    const text = node.textContent || "";
    if (!text.includes("$")) continue;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let matched = false;
    INLINE_MATH_PASTE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE_MATH_PASTE_RE.exec(text)) !== null) {
      matched = true;
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const span = document.createElement("span");
      span.setAttribute("data-type", "mathInline");
      span.setAttribute("data-katex", "true");
      span.textContent = match[1];
      frag.appendChild(span);
      lastIndex = match.index + match[0].length;
    }
    if (!matched) continue;
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    node.parentNode?.replaceChild(frag, node);
  }
}

const DEFAULT_PASTE_COL_WIDTH_PX = 150;

function parsePixelWidth(el: Element): number | null {
  const attr = el.getAttribute("width");
  if (attr) {
    const n = parseInt(attr, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const style = el.getAttribute("style") || "";
  const m = style.match(/(?:^|;)\s*width\s*:\s*([\d.]+)\s*px/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function getFirstRow(table: Element): Element | null {
  const tbodyRow = table.querySelector(":scope > tbody > tr");
  if (tbodyRow) return tbodyRow;
  const theadRow = table.querySelector(":scope > thead > tr");
  if (theadRow) return theadRow;
  return table.querySelector(":scope > tr");
}

function deriveColumnWidths(table: Element): (number | null)[] | null {
  const cols = table.querySelectorAll(":scope > colgroup > col");
  if (cols.length > 0) {
    const widths: (number | null)[] = [];
    cols.forEach((col) => widths.push(parsePixelWidth(col)));
    if (widths.some((w) => w !== null)) return widths;
  }

  const firstRow = getFirstRow(table);
  if (!firstRow) return null;

  const widths: (number | null)[] = [];
  Array.from(firstRow.children)
    .filter((c) => c.tagName === "TD" || c.tagName === "TH")
    .forEach((cell) => {
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
      const w = parsePixelWidth(cell);
      for (let i = 0; i < colspan; i++) {
        widths.push(w !== null ? Math.round(w / colspan) : null);
      }
    });
  if (widths.length === 0 || widths.every((w) => w === null)) return null;
  return widths;
}

// Mirror of server normalizeTableColumnWidths (see import/utils/table-utils.ts):
// markdown source has no widths, so without this every pasted table renders
// at table-layout:fixed/100% and squashes columns to fit the editor instead of
// letting .tableWrapper's overflow-x: auto scroll.
export function normalizeTableColumnWidths(root: Element): void {
  root.querySelectorAll("table").forEach((table) => {
    const firstRow = getFirstRow(table);
    if (!firstRow) return;

    let colWidths = deriveColumnWidths(table);
    if (!colWidths) {
      let count = 0;
      Array.from(firstRow.children)
        .filter((c) => c.tagName === "TD" || c.tagName === "TH")
        .forEach((cell) => {
          count += parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
        });
      if (count === 0) return;
      colWidths = new Array(count).fill(DEFAULT_PASTE_COL_WIDTH_PX);
    }

    let col = 0;
    Array.from(firstRow.children)
      .filter((c) => c.tagName === "TD" || c.tagName === "TH")
      .forEach((cell) => {
        if (cell.getAttribute("colwidth")) {
          col += parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
          return;
        }
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
        const slice = colWidths!.slice(col, col + colspan);
        col += colspan;
        if (slice.length === 0 || slice.every((w) => w === null)) return;
        const values = slice.map((w) => (w == null ? 100 : w));
        cell.setAttribute("colwidth", values.join(","));
      });
  });
}
