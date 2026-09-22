// Shared normalization for *pasted* slices, applied on every paste path so
// that Gemini / ChatGPT / web-page clipboard payloads stop importing phantom
// blank lines:
//
//   - the custom MarkdownClipboard.handlePaste calls it right after
//     DOMParser.parseSlice, before tr.replaceRange;
//   - the default paste path (transformPasted) calls the exact same function.
//
// The function is idempotent: running it on an already-normalized slice is a
// no-op, so double application (custom handler + transformPasted) can never
// drift. It only ever looks at the pasted fragment — it must never run on
// onUpdate, save, load or collaboration sync, or the blank lines a user adds
// manually would be stripped too.
import { Fragment, Node, NodeType, Schema, Slice } from "@tiptap/pm/model";

// Container types that are structural table/list/column/detail scaffolding:
// they are never removed, and when they end up empty the schema-mandated
// placeholder paragraph is re-inserted instead of producing an invalid doc.
const STRUCTURAL_CONTAINER_TYPES = new Set([
  "tableCell",
  "tableHeader",
  "listItem",
  "column",
  "details",
  "detailsContent",
  "detailsSummary",
  "tableRow",
  "table",
]);

// Types whose blank lines are semantically meaningful (code blocks). Their
// content is preserved verbatim — normalizing them would change code.
function isVerbatim(node: Node): boolean {
  return node.type.spec.code === true;
}

function isWhitespaceOnlyText(node: Node): boolean {
  return node.isText && node.textContent.trim() === "";
}

function createEmptyParagraph(schema: Schema): Node {
  // A bare empty paragraph is always a legal fill for the containers we
  // re-insert into (block+, paragraph block*, ...).
  return schema.nodes.paragraph.createAndFill() as Node;
}

function canBeEmpty(nodeType: NodeType): boolean {
  return nodeType.validContent(Fragment.empty);
}

function canContainParagraph(nodeType: NodeType): boolean {
  const paragraph = nodeType.schema.nodes.paragraph;
  if (!paragraph) return false;
  const fill = paragraph.createAndFill();
  if (!fill) return false;
  return nodeType.validContent(Fragment.from(fill));
}

/**
 * Normalizes a run of inline nodes:
 *  - collapses runs of consecutive hardBreaks into a single line break;
 *  - strips leading/trailing hardBreaks and whitespace-only edge text;
 *  - keeps every non-text inline node (mention, inline math, ...) and any
 *    internal whitespace untouched.
 *
 * Returns `null` when the run carries no real content (only whitespace text
 * and/or hardBreaks) and is therefore a phantom blank line.
 */
function normalizeInlineRun(nodes: readonly Node[]): Node[] | null {
  type Entry = { kind: "real" | "break" | "ws"; node: Node };
  const entries: Entry[] = [];

  for (const node of nodes) {
    if (node.type.name === "hardBreak") {
      entries.push({ kind: "break", node });
    } else if (isWhitespaceOnlyText(node)) {
      entries.push({ kind: "ws", node });
    } else {
      entries.push({ kind: "real", node });
    }
  }

  const firstReal = entries.findIndex((entry) => entry.kind === "real");
  if (firstReal === -1) return null;

  let lastReal = firstReal;
  for (let i = firstReal + 1; i < entries.length; i++) {
    if (entries[i].kind === "real") lastReal = i;
  }

  const children: Node[] = [];
  let pendingBreak: Node | null = null;

  for (let i = firstReal; i <= lastReal; i++) {
    const entry = entries[i];
    if (entry.kind === "break") {
      if (!pendingBreak) pendingBreak = entry.node;
      continue;
    }
    if (pendingBreak) {
      children.push(pendingBreak);
      pendingBreak = null;
    }
    children.push(entry.node);
  }

  return children;
}

/**
 * Cleans a paragraph's inline content via normalizeInlineRun.
 *
 * Returns `null` when the paragraph carries no real content (only whitespace
 * text and/or hardBreaks) and is therefore a phantom blank line.
 */
function normalizeParagraphContent(node: Node): Node | null {
  const children: Node[] = [];
  node.content.forEach((child) => children.push(child));
  const cleaned = normalizeInlineRun(children);
  if (cleaned === null) return null;
  const fragment = Fragment.from(cleaned);
  if (fragment.eq(node.content)) return node;
  return node.type.create(node.attrs, fragment, node.marks);
}

/**
 * Recursively cleans a non-boundary block node. Returns `null` when the node
 * is a removable phantom (an empty paragraph, or an emptied container such as
 * a blockquote), letting the parent drop it. When dropping would break the
 * schema (table cells, list items, ...), the required placeholder is kept
 * instead.
 */
function normalizeNode(node: Node, schema: Schema): Node | null {
  if (node.type.name === "paragraph") {
    return normalizeParagraphContent(node);
  }
  if (isVerbatim(node) || node.isLeaf) {
    return node;
  }

  const children: Node[] = [];
  let changed = false;

  node.content.forEach((child) => {
    const cleaned = normalizeNode(child, schema);
    if (cleaned === null) {
      changed = true;
      return;
    }
    children.push(cleaned);
    if (cleaned !== child) changed = true;
  });

  if (node.type.name === "listItem") {
    // listItem content is "paragraph block*": the first child must stay a
    // paragraph. Re-insert the placeholder when cleaning emptied the item
    // or removed its lead paragraph.
    if (children.length === 0 || children[0].type.name !== "paragraph") {
      children.unshift(createEmptyParagraph(schema));
      changed = true;
    }
  } else if (children.length === 0) {
    if (STRUCTURAL_CONTAINER_TYPES.has(node.type.name)) {
      if (!canBeEmpty(node.type) && canContainParagraph(node.type)) {
        children.push(createEmptyParagraph(schema));
        changed = true;
      }
      // Optional content (detailsContent, ...) may stay empty; no placeholder.
    } else {
      // Emptied body container (blockquote, callout, ...) → drop entirely.
      return null;
    }
  }

  if (!changed) return node;
  return node.type.create(node.attrs, Fragment.from(children), node.marks);
}

type BoundaryResult = { node: Node | null; depthLeft: number };

/**
 * Cleans a node sitting on the slice's open boundary. The openStart/openEnd
 * count how deep the slice's edge content merges with the surrounding doc, so
 * the boundary nodes (and the first-child chain down to that depth) drive
 * whether the slice inserts as blocks or merges inline. A boundary node that
 * is a phantom (empty paragraph / emptied container) is dropped and its open
 * contribution (`depthLeft`) reported as 0 so the caller can re-close the
 * slice coherently.
 */
function cleanBoundary(node: Node, depth: number, schema: Schema): BoundaryResult {
  if (node.type.name === "paragraph") {
    const cleaned = normalizeParagraphContent(node);
    return cleaned === null
      ? { node: null, depthLeft: 0 }
      : { node: cleaned, depthLeft: 1 };
  }
  if (isVerbatim(node) || node.isLeaf) {
    return { node, depthLeft: 0 };
  }

  const children: Node[] = [];
  let firstChildBoundaryDepth = 0;
  let changed = false;

  node.content.forEach((child, _offset, index) => {
    let cleaned: Node | null;
    if (depth > 1 && index === 0) {
      const inner = cleanBoundary(child, depth - 1, schema);
      if (inner.node === null) {
        changed = true;
        return;
      }
      cleaned = inner.node;
      firstChildBoundaryDepth = inner.depthLeft;
    } else {
      cleaned = normalizeNode(child, schema);
      if (cleaned === null) {
        changed = true;
        return;
      }
    }
    children.push(cleaned);
    if (cleaned !== child) changed = true;
  });

  if (node.type.name === "listItem" && children.length > 0 && children[0].type.name !== "paragraph") {
    children.unshift(createEmptyParagraph(schema));
    changed = true;
  }

  if (children.length === 0) {
    if (STRUCTURAL_CONTAINER_TYPES.has(node.type.name)) {
      // Schema-mandated placeholder (e.g. an empty table cell or list item)
      // is not a phantom blank line — drop it and the structure breaks.
      if (!canBeEmpty(node.type) && canContainParagraph(node.type)) {
        children.push(createEmptyParagraph(schema));
        changed = true;
      }
    } else {
      // Emptied boundary container (phantom) → drop it entirely.
      return { node: null, depthLeft: 0 };
    }
  }

  const rebuilt = changed
    ? node.type.create(node.attrs, Fragment.from(children), node.marks)
    : node;
  return { node: rebuilt, depthLeft: 1 + (depth > 1 ? firstChildBoundaryDepth : 0) };
}

/**
 * The single paste-cleanup entry point. Idempotent; never touches the doc
 * beyond the pasted slice; preserves open boundaries when the slice edges
 * carry real content, re-closes the slice fully when a phantom edge had to be
 * removed (keeping the open depths coherent for replaceRange/replaceSelection),
 * and preserves marks, attributes, list hierarchy and verbatim code content.
 */
export function normalizePastedSlice(slice: Slice, schema: Schema): Slice {
  if (slice.content.size === 0) return slice;

  let nodes: Node[] = [];
  slice.content.forEach((node) => nodes.push(node));

  let openStart = slice.openStart;
  let openEnd = slice.openEnd;
  let changed = false;
  let boundaryRemoved = false;

  if (openStart > 0) {
    const result = cleanBoundary(nodes[0], openStart, schema);
    if (result.node === null) {
      nodes.shift();
      openStart = 0;
      boundaryRemoved = true;
      changed = true;
    } else {
      changed ||= result.node !== nodes[0];
      nodes[0] = result.node;
      openStart = result.depthLeft;
    }
  }

  if (openEnd > 0 && nodes.length > 0) {
    const last = nodes.length - 1;
    const result = cleanBoundary(nodes[last], openEnd, schema);
    if (result.node === null) {
      nodes.pop();
      openEnd = 0;
      boundaryRemoved = true;
      changed = true;
    } else {
      changed ||= result.node !== nodes[last];
      nodes[last] = result.node;
      openEnd = result.depthLeft;
    }
  }

  // Top-level whitespace-only text nodes are a parse artifact: with
  // preserveWhitespace, the newline between two block elements comes through
  // as a stray text node (e.g. "</h2>\n<p>" → text(" ")). They are not
  // content and would render as a blank line — drop them. (Boundary nodes
  // can never be text, so filtering here is safe for open depths.)
  {
    const filtered: Node[] = [];
    for (const node of nodes) {
      if (node.isText && node.textContent.trim() === "") {
        changed = true;
        continue;
      }
      filtered.push(node);
    }
    if (filtered.length === 0) return Slice.empty;
    nodes = filtered;
  }

  // Every node that is not a surviving open boundary gets the plain
  // normalizeNode treatment (phantom paragraphs / emptied containers drop
  // out). Nodes newly exposed by a removed boundary are covered here too.
  const leftBoundaryKept = openStart > 0 && nodes.length > 0;
  const rightBoundaryKept = openEnd > 0 && nodes.length > 0;
  for (let i = 0; i < nodes.length; i++) {
    if (i === 0 && leftBoundaryKept) continue;
    if (i === nodes.length - 1 && rightBoundaryKept) continue;
    const cleaned = normalizeNode(nodes[i], schema);
    if (cleaned === null) {
      nodes.splice(i, 1);
      i--;
      changed = true;
    } else {
      changed ||= cleaned !== nodes[i];
      nodes[i] = cleaned;
    }
  }

  if (nodes.length === 0) return Slice.empty;

  if (boundaryRemoved) {
    // A phantom edge was dropped: fully close the slice so the open depths
    // stay coherent for the target context (replaceRange/replaceSelection
    // reject mismatched $from.depth - openStart vs $to.depth - openEnd).
    openStart = 0;
    openEnd = 0;
  }

  // Top-level inline-only fragments (raw "a<br><br>b" pastes, copied single
  // lines, ...) are not wrapped in a paragraph by parseSlice. Normalize the
  // inline run directly so consecutive <br> collapse and edge line breaks
  // drop, mirroring the paragraph rule.
  if (nodes.every((node) => node.isInline)) {
    const cleaned = normalizeInlineRun(nodes);
    if (cleaned === null) return Slice.empty;
    const fragment = Fragment.from(cleaned);
    if (!changed && fragment.eq(slice.content) && openStart === slice.openStart && openEnd === slice.openEnd) {
      return slice;
    }
    return new Slice(fragment, 0, 0);
  }

  if (!changed && openStart === slice.openStart && openEnd === slice.openEnd) {
    return slice;
  }
  return new Slice(Fragment.from(nodes), openStart, openEnd);
}
