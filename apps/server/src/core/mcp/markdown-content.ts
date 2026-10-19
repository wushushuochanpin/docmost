import { markdownToHtml } from '@docmost/editor-ext';
import {
  htmlToJson,
  tiptapExtensions,
} from '../../collaboration/collaboration.util';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import {
  DocumentCommandError,
  isEditableBlock,
} from '../document-command/document-candidate';

/** Use the existing parser, rejecting unsupported syntax before it can be normalized away. */
export async function markdownContent(markdown: string, allowEmpty = false) {
  if (Buffer.byteLength(markdown) > 262144)
    throw new DocumentCommandError('CONTENT_TOO_LARGE');
  if (!markdown.trim() && !allowEmpty)
    throw new DocumentCommandError('INVALID_ARGUMENT');
  const syntax = markdown
    .replace(
      /(^|\n) {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[ \t]*(?=\n|$)|$)/g,
      '',
    )
    .replace(/(`+)[\s\S]*?\1/g, '');
  if (
    /<\/?[a-z!]|!\[|\[\^|\$|^\s*---\s*$|^\s*[-*+]\s+\[[ xX]\]|\|/im.test(syntax)
  )
    throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  if (/^\s*\[[^\]]+\]:|\]\[[^\]]*\]/m.test(syntax))
    throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  // Validate links before the HTML parser's sanitizer could remove their scheme.
  for (const match of syntax.matchAll(/\]\(([^\s)]+)/g)) {
    if (!/^(https?:\/\/|mailto:)/i.test(match[1]))
      throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  }
  const content = markdown.trim()
    ? htmlToJson(await markdownToHtml(markdown))
    : { type: 'doc', content: [{ type: 'paragraph' }] };
  const doc = TiptapTransformer.toYdoc(content, 'default', tiptapExtensions);
  try {
    if (
      doc
        .getXmlFragment('default')
        .toArray()
        .some((node) => !isEditableBlock(node))
    )
      throw new DocumentCommandError('UNSUPPORTED_CONTENT');
    return {
      content,
      fragment: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    };
  } finally {
    doc.destroy();
  }
}
