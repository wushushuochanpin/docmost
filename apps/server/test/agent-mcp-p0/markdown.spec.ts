import { richContent } from '../../src/core/mcp/rich-content';
import {
  jsonToHtml,
  htmlToJson,
} from '../../src/collaboration/collaboration.util';
import { decodeImage } from '../../src/core/mcp/image-upload.service';
import { markdownContent } from '../../src/core/mcp/markdown-content';
import { DocumentCandidate } from '../../src/core/document-command/document-candidate';
import * as Y from 'yjs';
const version = {
  workspaceId: 'workspace',
  pageId: 'page',
  generation: 'generation',
  revision: '1',
};
test.each([
  '# Heading\n\n**bold** and *italic* with ~~strike~~',
  '- item\n- second',
  '> quotation',
  '| a | b |\n|---|---|\n|x|y|',
  '---\n\nbody must survive\n\n---',
  '***',
  '```mermaid\nflowchart LR\n A-->B\n```',
  '[link](https://example.test)',
  '```sh\necho "$VALUE" | cat\n```',
  'Literal `<html>` in code',
])('P1 supported Markdown preserves typed structure: %s', async (text) => {
  const value = await markdownContent(text),
    doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(value.fragment, 'base64'));
  expect(doc.getXmlFragment('default').length).toBeGreaterThan(0);
  doc.destroy();
});
test.each([
  '![image](https://example.test/image)',
  '<script>alert(1)</script>',
  '[link](javascript:alert(1))',
  '[link][ref]\n\n[ref]: javascript:alert(1)',
  '- [x] task',
  '$x^2$',
])('P1 unsupported Markdown is rejected: %s', async (text) => {
  await expect(markdownContent(text)).rejects.toMatchObject({
    code: 'UNSUPPORTED_CONTENT',
  });
});
test('P1 rich block commands preserve protected ancestors, reject whole batch, and keep source unchanged', async () => {
  const doc = new Y.Doc(),
    table = new Y.XmlElement('drawio');
  doc.getXmlFragment('default').push([table]);
  const binary = Y.encodeStateAsUpdate(doc),
    engine = new DocumentCandidate(Buffer.alloc(32, 9)),
    fragment = (await markdownContent('**Bold**')).fragment;
  const output = engine.apply(binary, version, engine.versionToken(version), [
    { type: 'append', text: '**Bold**', fragment },
  ]);
  const result = new Y.Doc();
  Y.applyUpdate(result, output);
  expect(result.getXmlFragment('default').get(0).toString()).toBe(
    table.toString(),
  );
  expect(() =>
    engine.apply(binary, version, engine.versionToken(version), [
      { type: 'append', text: 'first', fragment },
      {
        type: 'replace_block',
        text: 'blocked',
        blockRef: engine.blockRef(version, doc, 0),
        fragment,
      },
    ]),
  ).toThrow('BLOCK_NOT_EDITABLE');
  expect(Y.encodeStateAsUpdate(doc)).toEqual(binary);
  doc.destroy();
  result.destroy();
});

test('P3 leading rules do not strip the body as frontmatter', async () => {
  const { content } = await markdownContent('---\n\nbody must survive\n\n---');
  expect(
    content.content?.filter((n) => n.type === 'horizontalRule'),
  ).toHaveLength(2);
  expect(JSON.stringify(content)).toContain('body must survive');
});

test('P3 figure/caption and table retain native structure across HTML and Yjs', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'imageFigure',
        content: [
          {
            type: 'image',
            attrs: {
              attachmentId: id,
              src: `/files/by-id/${id}`,
              width: 300,
              height: 200,
              alt: 'Diagram',
            },
          },
          {
            type: 'imageCaption',
            content: [
              {
                type: 'text',
                text: 'Editable caption',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      },
    ],
  };
  const parsed = richContent(doc);
  const html = jsonToHtml(parsed.content);
  expect(html).toContain('<figure');
  expect(html).toContain('<figcaption');
  const roundtrip = richContent(htmlToJson(html));
  expect(roundtrip.content.content?.[0].type).toBe('imageFigure');
  expect(JSON.stringify(roundtrip.content)).toContain('Editable caption');
});
test.each([
  {
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { onclick: 'bad()' } }],
  },
  {
    type: 'doc',
    content: [{ type: 'image', attrs: { src: 'https://evil.test/image.png' } }],
  },
  {
    type: 'doc',
    content: [{ type: 'table', content: [{ type: 'tableRow', content: [] }] }],
  },
  {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'X',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ],
  },
  {
    type: 'doc',
    content: [
      {
        type: 'imageFigure',
        content: [
          { type: 'imageCaption', content: [{ type: 'text', text: 'Orphan' }] },
        ],
      },
    ],
  },
])('P3 malformed rich input fails before normalization %#', (content) => {
  expect(() => richContent(content)).toThrow('UNSUPPORTED_CONTENT');
});
test('P3 unsupported image and malformed base64 are rejected', () => {
  expect(() => decodeImage(Buffer.from('<svg/>').toString('base64'))).toThrow(
    'UNSUPPORTED_CONTENT',
  );
  expect(() => decodeImage('not base64!')).toThrow('INVALID_ARGUMENT');
});
