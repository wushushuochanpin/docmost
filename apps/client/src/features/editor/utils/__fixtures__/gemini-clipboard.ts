// Fixed clipboard fixtures representing Gemini's "Copy" button payload,
// used as the stable test sample for paste cleanup.
//
// Gemini ships its answer the same way as other AI chat products: text/plain
// carries the raw Markdown source, and text/html wraps that same source in a
// <pre> (or white-space:pre container) with no block-level rich-text tags.
// See looksLikeMarkdownSourceHtml() in markdown-clipboard.ts.
//
// The sample deliberately includes the blank-line patterns Gemini/ChatGPT
// payloads are known for:
//   - a blank line between every list item (CommonMark → loose list → every
//     <li> wraps a <p>, which renders with extra gaps);
//   - runs of blank lines between paragraphs;
//   - a fenced code block with intentionally preserved blank lines.

const GEMINI_MARKDOWN_SAMPLE = [
  "## 粘贴空行问题",
  "",
  "",
  "从 Gemini 复制内容粘贴后会出现多余空行。",
  "",
  "1. 第一项",
  "",
  "2. 第二项",
  "",
  "3. 第三项",
  "",
  "```ts",
  "const a = 1;",
  "",
  "const b = 2;",
  "```",
  "",
  "结尾段落。",
  "",
  "",
].join("\n");

export const GEMINI_CLIPBOARD_FIXTURE = {
  name: "Gemini Copy button clipboard payload",
  textHtml: `<pre style="white-space:pre-wrap">${GEMINI_MARKDOWN_SAMPLE.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
  textPlain: GEMINI_MARKDOWN_SAMPLE,
};

// A second fixed sample: Gemini's "copy selection" rich-text flavor, where
// line breaks come through as <br> inside a single paragraph and loose list
// items wrap <p> (both historically produced phantom blank lines).
export const GEMINI_RICH_TEXT_FIXTURE = {
  name: "Gemini rich-text selection clipboard payload",
  textHtml:
    "<div>第一行<br><br><br>第二行</div><ul><li><p>甲</p></li><li><p>乙</p></li></ul>",
  textPlain: "第一行\n\n\n第二行\n- 甲\n- 乙",
};
