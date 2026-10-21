import { addUniqueIdsToDoc } from '@docmost/editor-ext';
import { imageAttachmentId } from '../document-command/image-reference';
import { getSchema, JSONContent } from '@tiptap/core';
import { TableMap } from '@tiptap/pm/tables';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { tiptapExtensions } from '../../collaboration/collaboration.util';
import {
  DocumentCommandError,
  isEditableBlock,
} from '../document-command/document-candidate';

export const RICH_CONTENT_CAPABILITIES = {
  formats: ['markdown', 'tiptap-json'],
  nodes: [
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'codeBlock',
    'hardBreak',
    'horizontalRule',
    'table',
    'tableRow',
    'tableHeader',
    'tableCell',
    'image',
    'imageFigure',
    'imageCaption',
  ],
  marks: ['bold', 'italic', 'strike', 'code', 'underline', 'link'],
  diagrams: ['mermaid'],
  image_upload: {
    tool: 'upload_image',
    max_bytes: 7340032,
    formats: ['png', 'gif', 'jpeg', 'webp'],
    preserves_original_bytes: true,
  },
  max_content_bytes: 262144,
};
const fail = (): never => {
  throw new DocumentCommandError('UNSUPPORTED_CONTENT');
};
function safeAttribute(key: string, value: any): boolean {
  if (value === null || value === undefined) return true;
  switch (key) {
    case 'id':
      return typeof value === 'string' && value.length <= 128;
    case 'textAlign':
    case 'align':
      return ['left', 'right', 'center', 'justify'].includes(value);
    case 'indent':
      return Number.isInteger(value) && value >= 0 && value <= 10;
    case 'level':
      return Number.isInteger(value) && value >= 1 && value <= 6;
    case 'start':
      return Number.isInteger(value) && value >= 0 && value <= 1000000;
    case 'colspan':
    case 'rowspan':
      return Number.isInteger(value) && value >= 1 && value <= 100;
    case 'colwidth':
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every((v) => Number.isInteger(v) && v >= 0 && v <= 10000)
      );
    case 'width':
      return (
        (typeof value === 'string' && /^(100|[1-9]?\d)%$/.test(value)) ||
        (Number.isFinite(value) && value > 0 && value <= 100000)
      );
    case 'height':
    case 'htmlHeight':
    case 'size':
    case 'aspectRatio':
      return Number.isFinite(value) && value >= 0 && value <= 100000000;
    case 'language':
      return (
        typeof value === 'string' && /^[a-zA-Z0-9_+#.-]{0,40}$/.test(value)
      );
    case 'alt':
      return typeof value === 'string' && value.length <= 4000;
    case 'src':
      return (
        typeof value === 'string' &&
        /^\/files\/by-id\/[0-9a-f-]{36}$/i.test(value)
      );
    case 'attachmentId':
      return (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      );
    case 'backgroundColor':
      return (
        typeof value === 'string' &&
        /^(#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d.,% ]+\))$/i.test(value)
      );
    case 'backgroundColorName':
      return typeof value === 'string' && /^[a-z-]{1,32}$/i.test(value);
    default:
      return false;
  }
}
/** Strictly validate before ProseMirror can discard unknown attributes or repair malformed trees. */
export function richContent(content: JSONContent, allowEmpty = false) {
  if (Buffer.byteLength(JSON.stringify(content)) > 262144)
    throw new DocumentCommandError('CONTENT_TOO_LARGE');
  const schema = getSchema(tiptapExtensions);
  let count = 0;
  const visit = (node: any, depth = 0) => {
    if (
      !node ||
      typeof node !== 'object' ||
      Array.isArray(node) ||
      ++count > 10000 ||
      depth > 32
    )
      fail();
    if (
      Object.keys(node).some(
        (key) => !['type', 'attrs', 'marks', 'content', 'text'].includes(key),
      )
    )
      fail();
    if (
      !['doc', 'text', ...RICH_CONTENT_CAPABILITIES.nodes].includes(node.type)
    )
      fail();
    if (node.attrs) {
      const spec = schema.nodes[node.type]?.spec.attrs ?? {};
      if (
        typeof node.attrs !== 'object' ||
        Array.isArray(node.attrs) ||
        Object.entries(node.attrs).some(
          ([key, value]) => !(key in spec) || !safeAttribute(key, value),
        )
      )
        fail();
    }
    if (node.type === 'image') imageAttachmentId(node.attrs ?? {});
    if (node.marks) {
      if (!Array.isArray(node.marks)) fail();
      for (const mark of node.marks) {
        if (
          !RICH_CONTENT_CAPABILITIES.marks.includes(mark.type) ||
          Object.keys(mark).some((k) => !['type', 'attrs'].includes(k))
        )
          fail();
        if (mark.type === 'link') {
          const a = mark.attrs ?? {};
          if (
            !/^(https?:\/\/|mailto:)/i.test(a.href ?? '') ||
            /[\u0000-\u0020]/.test(a.href)
          )
            fail();
          if (
            Object.keys(a).some(
              (k) =>
                ![
                  'href',
                  'target',
                  'rel',
                  'class',
                  'internal',
                  'title',
                ].includes(k),
            ) ||
            (a.target != null && !['_blank', '_self'].includes(a.target)) ||
            a.class != null ||
            (a.title != null &&
              (typeof a.title !== 'string' || a.title.length > 4000)) ||
            (a.internal != null && a.internal !== false) ||
            (a.rel != null && a.rel !== 'noopener noreferrer nofollow')
          )
            fail();
        } else if (mark.attrs && Object.keys(mark.attrs).length) fail();
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) fail();
      node.content.forEach((child) => visit(child, depth + 1));
    }
  };
  visit(content);
  if (content.type !== 'doc' || (!allowEmpty && !content.content?.length))
    fail();
  if (!content.content?.length)
    content = { type: 'doc', content: [{ type: 'paragraph' }] };
  try {
    const node = schema.nodeFromJSON(content);
    node.check();
    node.descendants((child) => {
      if (child.type.name === 'table' && TableMap.get(child).problems?.length)
        fail();
    });
  } catch {
    fail();
  }
  // Match the editor's identity normalization before the first collaborative session.
  content = addUniqueIdsToDoc(content, tiptapExtensions);
  const doc = TiptapTransformer.toYdoc(content, 'default', tiptapExtensions);
  try {
    if (
      doc
        .getXmlFragment('default')
        .toArray()
        .some((node) => !isEditableBlock(node))
    )
      fail();
    return {
      content,
      fragment: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    };
  } finally {
    doc.destroy();
  }
}
