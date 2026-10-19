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
  '| a | b |\n|---|---|\n|x|y|',
  '$x^2$',
])('P1 unsupported Markdown is rejected: %s', async (text) => {
  await expect(markdownContent(text)).rejects.toMatchObject({
    code: 'UNSUPPORTED_CONTENT',
  });
});
test('P1 rich block commands preserve protected ancestors, reject whole batch, and keep source unchanged', async () => {
  const doc = new Y.Doc(),
    table = new Y.XmlElement('table');
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
