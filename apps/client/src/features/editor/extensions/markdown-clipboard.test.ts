import { describe, expect, it } from "vitest";
import { looksLikeMarkdownSourceHtml } from "./markdown-clipboard";

function parseBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

describe("looksLikeMarkdownSourceHtml", () => {
  it("treats a <pre>-wrapped payload (Gemini Copy button) as Markdown source", () => {
    // Gemini / ChatGPT-style Copy: the Markdown source sits inside a <pre>
    // (or whitespace:pre container) with no block-level rich-text tags.
    const body = parseBody(
      `<pre style="white-space:pre-wrap">## Title\n\n**bold** text\n\n1. one</pre>`,
    );
    expect(looksLikeMarkdownSourceHtml(body)).toBe(true);
  });

  it("treats a whitespace:pre div wrapping plain text as Markdown source", () => {
    const body = parseBody(
      `<div style="white-space:pre-wrap"># Heading\n\nParagraph with **bold**</div>`,
    );
    expect(looksLikeMarkdownSourceHtml(body)).toBe(true);
  });

  it("keeps real rich-text HTML (h2/p/strong) as rich text", () => {
    const body = parseBody(
      "<h2>Heading</h2><p>Paragraph with <strong>bold</strong></p>",
    );
    expect(looksLikeMarkdownSourceHtml(body)).toBe(false);
  });

  it("keeps rich text wrapped in a div container", () => {
    const body = parseBody(
      '<div><h2>Title</h2><ul><li>one</li></ul></div>',
    );
    expect(looksLikeMarkdownSourceHtml(body)).toBe(false);
  });

  it("keeps tables and blockquotes as rich text", () => {
    const body = parseBody(
      "<table><tr><td>a</td></tr></table><blockquote>quote</blockquote>",
    );
    expect(looksLikeMarkdownSourceHtml(body)).toBe(false);
  });
});
