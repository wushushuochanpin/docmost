export function createEmptyProsemirrorDocument() {
  return {
    type: "doc",
    content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
  };
}

export function normalizeProsemirrorContent(content: any) {
  return content ?? createEmptyProsemirrorDocument();
}
