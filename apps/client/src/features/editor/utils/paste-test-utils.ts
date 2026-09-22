// Shared schema / editor builder for paste-cleanup tests.
//
// Builds a focused editor whose node names and content models mirror the real
// docmost editor (paragraph, lists, blockquote, table with "block+" cells,
// image / mathBlock / attachment block atoms, mention / mathInline inline
// atoms, codeBlock) without pulling React node views into the test run.
// The real MarkdownClipboard extension is used as-is, so the integration
// tests exercise the actual paste handler.
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { History } from "@tiptap/extension-history";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import { Node } from "@tiptap/core";
import { MarkdownClipboard } from "@/features/editor/extensions/markdown-clipboard";

const TestImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  defining: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: null } };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ node }) {
    return ["img", { src: node.attrs.src }] as any;
  },
});

const TestMathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  isolating: true,
  addAttributes() {
    return { text: { default: "" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="mathBlock"]' }];
  },
  renderHTML({ node }) {
    return ["div", { "data-type": "mathBlock" }, node.attrs.text] as any;
  },
});

const TestMathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { text: { default: "" } };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="mathInline"]' }];
  },
  renderHTML({ node }) {
    return ["span", { "data-type": "mathInline" }, node.attrs.text] as any;
  },
});

const TestMention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { id: { default: null }, label: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },
  renderHTML({ node }) {
    return [
      "span",
      { "data-type": "mention" },
      node.attrs.label ?? "",
    ] as any;
  },
});

const TestAttachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  defining: true,
  addAttributes() {
    return { url: { default: null }, name: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="attachment"]' }];
  },
  renderHTML({ node }) {
    return ["div", { "data-type": "attachment" }] as any;
  },
});

// Mirror of @docmost/editor-ext TableCell content (subset of node types that
// exist in this test schema): cells hold one or more blocks.
const TestTableCell = TableCell.extend({
  content:
    "(paragraph | heading | bulletList | orderedList | taskList | blockquote | image | mathBlock | attachment)+",
});

const TestTableRow = TableRow.extend({
  content: "(tableCell | tableHeader)*",
});

export const testExtensions = [
  StarterKit.configure({
    heading: {},
    undoRedo: false,
    codeBlock: {},
    link: false,
    trailingNode: false,
  }),
  History,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TestTableRow,
  TestTableCell,
  TableHeader,
  TestImage,
  TestMathBlock,
  TestMathInline,
  TestMention,
  TestAttachment,
  MarkdownClipboard.configure({ transformPastedText: true }),
];

export function createTestEditor(initialContent?: unknown): Editor {
  return new Editor({
    extensions: testExtensions,
    content: (initialContent ?? "") as any,
  });
}
