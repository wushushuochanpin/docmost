import { markdownToHtml } from '@docmost/editor-ext';
import { htmlToJson } from '../../collaboration/collaboration.util';
import { richContent } from './rich-content';
import { DocumentCommandError } from '../document-command/document-candidate';

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
  if (/<\/?[a-z!]|\[\^|\$|^\s*[-*+]\s+\[[ xX]\]/im.test(syntax))
    throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  if (/^\s*\[[^\]]+\]:|\]\[[^\]]*\]/m.test(syntax))
    throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  // Validate links before the HTML parser's sanitizer could remove their scheme.
  for (const match of syntax.matchAll(/\]\(([^\s)]+)/g)) {
    if (
      !/^(https?:\/\/|mailto:|\/files\/by-id\/[0-9a-f-]{36}$)/i.test(match[1])
    )
      throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  }
  const content = markdown.trim()
    ? htmlToJson(await markdownToHtml(markdown, { stripFrontmatter: false }))
    : { type: 'doc', content: [{ type: 'paragraph' }] };
  const normalize = (node: any) => {
    if (node.type === 'image') {
      const match = /^\/files\/by-id\/([0-9a-f-]{36})$/i.exec(
        node.attrs?.src ?? '',
      );
      if (match) node.attrs.attachmentId = match[1];
    }
    node.content?.forEach(normalize);
  };
  normalize(content);
  return richContent(content, allowEmpty);
}
