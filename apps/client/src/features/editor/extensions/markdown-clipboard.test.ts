import { describe, expect, it } from "vitest";
import {
  cleanupPastedHtml,
  looksLikeMarkdownSourceHtml,
} from "./markdown-clipboard";

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

describe("cleanupPastedHtml", () => {
  it("unwraps every <p> inside <li> so lists render tight", () => {
    const body = parseBody(
      "<ol><li><p>first</p></li><li><p>second with <strong>bold</strong></p></li></ol>",
    );
    cleanupPastedHtml(body);
    expect(body.querySelector("li p")).toBeNull();
    expect(body.querySelectorAll("li").length).toBe(2);
    expect(body.querySelector("li strong")?.textContent).toBe("bold");
  });

  it("drops empty paragraphs and divs", () => {
    const body = parseBody(
      "<p>real</p><p>   </p><div>\n</div><p>after</p>",
    );
    cleanupPastedHtml(body);
    const ps = Array.from(body.querySelectorAll("p")).map((p) => p.textContent);
    expect(ps).toEqual(["real", "after"]);
  });

  it("drops trailing <br> inside a block", () => {
    const body = parseBody("<p>hello<br></p>");
    cleanupPastedHtml(body);
    expect(body.querySelector("br")).toBeNull();
    expect(body.textContent).toBe("hello");
  });

  it("keeps nested lists intact", () => {
    const body = parseBody(
      "<ol><li><p>intro</p><ul><li><p>nested</p></li></ul></li></ol>",
    );
    cleanupPastedHtml(body);
    expect(body.querySelectorAll("li").length).toBe(2);
    expect(body.querySelector("li p")).toBeNull();
  });

  it("preserves math markers", () => {
    const body = parseBody(
      '<div data-type="mathBlock" data-katex="true">x^2</div><p>text <span data-type="mathInline" data-katex="true">y</span></p>',
    );
    cleanupPastedHtml(body);
    expect(body.querySelector('[data-type="mathBlock"]')).not.toBeNull();
    expect(body.querySelector('[data-type="mathInline"]')).not.toBeNull();
  });
});
