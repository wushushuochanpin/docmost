import * as Y from 'yjs';
import {
  DocumentCandidate,
  DocumentVersion,
} from '../../src/core/document-command/document-candidate';
const version: DocumentVersion = {
  workspaceId: 'workspace',
  pageId: 'page',
  generation: 'generation',
  revision: '1',
};
function fixture() {
  const doc = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  text.insert(0, 'original');
  paragraph.insert(0, [text]);
  const table = new Y.XmlElement('table');
  table.setAttribute('opaque', 'keep-me');
  const attachment = new Y.XmlElement('attachment');
  attachment.setAttribute('id', 'attachment-id');
  const commented = new Y.XmlElement('paragraph');
  const annotated = new Y.XmlText();
  annotated.insert(0, 'commented', { comment: { id: 'comment-id' } });
  commented.insert(0, [annotated]);
  doc
    .getXmlFragment('default')
    .insert(0, [paragraph, table, attachment, commented]);
  return doc;
}
describe('P0 AC-04/08/18 isolated binary candidate', () => {
  const engine = new DocumentCandidate(Buffer.alloc(32, 7));
  test('replaces one block while preserving complex siblings and comment marks', () => {
    const original = fixture();
    const before = Y.encodeStateAsUpdate(original);
    const result = engine.apply(before, version, engine.versionToken(version), [
      {
        type: 'replace_block',
        blockRef: engine.blockRef(version, original, 0),
        text: 'new',
      },
    ]);
    const candidate = new Y.Doc();
    Y.applyUpdate(candidate, result);
    expect(candidate.getXmlFragment('default').get(0).toString()).toContain(
      'new',
    );
    expect(
      candidate
        .getXmlFragment('default')
        .toArray()
        .slice(1)
        .map((x) => x.toJSON()),
    ).toEqual(
      original
        .getXmlFragment('default')
        .toArray()
        .slice(1)
        .map((x) => x.toJSON()),
    );
    expect(Y.encodeStateAsUpdate(original)).toEqual(before);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, before);
    expect(restored.getXmlFragment('default').toString()).toEqual(
      original.getXmlFragment('default').toString(),
    );
    restored.destroy();
    candidate.destroy();
    original.destroy();
  });
  test.each([1, 2, 3])(
    'refuses protected block %i and leaves live state untouched',
    (index) => {
      const doc = fixture();
      const before = Y.encodeStateAsUpdate(doc);
      expect(() =>
        engine.apply(before, version, engine.versionToken(version), [
          { type: 'append', text: 'must not escape' },
          {
            type: 'replace_block',
            blockRef: engine.blockRef(version, doc, index),
            text: 'bad',
          },
        ]),
      ).toThrow('BLOCK_NOT_EDITABLE');
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
      doc.destroy();
    },
  );
  test('rejects stale generation, revision, foreign resource and tampered block ref', () => {
    const doc = fixture();
    const binary = Y.encodeStateAsUpdate(doc);
    const token = engine.versionToken(version);
    for (const changed of [
      { revision: '2' },
      { generation: 'restored' },
      { workspaceId: 'other' },
      { pageId: 'other' },
    ]) {
      expect(() =>
        engine.apply(binary, { ...version, ...changed }, token, [
          { type: 'append', text: 'x' },
        ]),
      ).toThrow('REVISION_CONFLICT');
    }
    const ref = engine.blockRef(version, doc, 0);
    expect(() =>
      engine.apply(binary, version, token, [
        { type: 'replace_block', blockRef: ref + 'x', text: 'x' },
      ]),
    ).toThrow('BLOCK_REFERENCE_INVALID');
    expect(() =>
      engine.apply(binary, version, token, [
        { type: 'replace_block', blockRef: ref, text: 'a' },
        { type: 'replace_block', blockRef: ref, text: 'b' },
      ]),
    ).toThrow('BLOCK_REFERENCE_INVALID');
    doc.destroy();
  });
  test('keeps prepend order and enforces batch/input limits', () => {
    const doc = fixture();
    const binary = Y.encodeStateAsUpdate(doc);
    const token = engine.versionToken(version);
    const candidate = new Y.Doc();
    Y.applyUpdate(
      candidate,
      engine.apply(binary, version, token, [
        { type: 'prepend', text: 'a' },
        { type: 'prepend', text: 'b' },
      ]),
    );
    expect(
      candidate
        .getXmlFragment('default')
        .toArray()
        .slice(0, 2)
        .map((x) => x.toString()),
    ).toEqual(['<paragraph>a</paragraph>', '<paragraph>b</paragraph>']);
    expect(() =>
      engine.apply(
        binary,
        version,
        token,
        Array(21).fill({ type: 'append', text: 'x' }),
      ),
    ).toThrow('INVALID_ARGUMENT');
    expect(() =>
      engine.apply(binary, version, token, [
        { type: 'append', text: '中'.repeat(90000) },
      ]),
    ).toThrow('CONTENT_TOO_LARGE');
    candidate.destroy();
    doc.destroy();
  });
});
