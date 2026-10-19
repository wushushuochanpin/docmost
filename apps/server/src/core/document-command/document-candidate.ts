import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as Y from 'yjs';

export interface DocumentVersion {
  workspaceId: string;
  pageId: string;
  generation: string;
  revision: string;
}

/** Internal, validated text-block commands. The public Markdown adapter is separate. */
export type TextBlockCommand =
  | { type: 'append' | 'prepend'; text: string; fragment?: string }
  | {
      type: 'replace_block';
      blockRef: string;
      text: string;
      fragment?: string;
    };

export class DocumentCommandError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const reject = (code: string): never => {
  throw new DocumentCommandError(code);
};

/** Works only on an isolated binary clone; never transacts on a live document. */
export class DocumentCandidate {
  constructor(private readonly signingKey: Buffer) {
    if (signingKey.length < 32)
      throw new Error('Signing key must be at least 32 bytes');
  }

  versionToken(version: DocumentVersion): string {
    return this.sign({ kind: 'revision', schema: 1, ...version });
  }

  assertVersion(token: string, expected: DocumentVersion): void {
    if (token !== this.versionToken(expected)) reject('REVISION_CONFLICT');
  }

  blockRef(version: DocumentVersion, document: Y.Doc, index: number): string {
    const block = document.getXmlFragment('default').get(index);
    if (!block) return reject('BLOCK_REFERENCE_INVALID');
    return this.sign({
      kind: 'block',
      ...version,
      index,
      hash: this.hash(block.toString()),
    });
  }

  apply(
    binary: Uint8Array,
    version: DocumentVersion,
    token: string,
    commands: TextBlockCommand[],
  ) {
    this.assertVersion(token, version);
    if (commands.length < 1 || commands.length > 20) reject('INVALID_ARGUMENT');
    if (
      commands.reduce((n, c) => n + Buffer.byteLength(c.text, 'utf8'), 0) >
      256 * 1024
    ) {
      reject('CONTENT_TOO_LARGE');
    }
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, binary);
      const root = candidate.getXmlFragment('default');
      const original = root.toArray();
      const originalContent = root.toString();
      const replaced = new Set<number>();
      const resolved = commands.map((command) => {
        if (!['append', 'prepend', 'replace_block'].includes(command.type))
          reject('INVALID_ARGUMENT');
        if (command.type !== 'replace_block') return { command, target: null };
        const ref = this.verify(command.blockRef);
        const index = ref.index;
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= original.length ||
          command.blockRef !== this.blockRef(version, candidate, index) ||
          replaced.has(index)
        ) {
          return reject('BLOCK_REFERENCE_INVALID');
        }
        const target = original[index];
        if (!isEditableBlock(target)) return reject('BLOCK_NOT_EDITABLE');
        replaced.add(index);
        return { command, target };
      });
      candidate.transact(() => {
        let prependOffset = 0;
        for (const { command, target } of resolved) {
          let nodes: Y.XmlElement[];
          if (command.fragment) {
            const fragment = new Y.Doc();
            try {
              Y.applyUpdate(fragment, Buffer.from(command.fragment, 'base64'));
              const source = fragment.getXmlFragment('default').toArray();
              if (
                !source.length ||
                source.some((node) => !isEditableBlock(node))
              )
                reject('UNSUPPORTED_CONTENT');
              nodes = source.map((node) => (node as Y.XmlElement).clone());
            } finally {
              fragment.destroy();
            }
          } else {
            const node = new Y.XmlElement(
              target instanceof Y.XmlElement ? target.nodeName : 'paragraph',
            );
            if (target instanceof Y.XmlElement) {
              for (const [key, value] of Object.entries(target.getAttributes()))
                node.setAttribute(key, value);
            }
            const text = new Y.XmlText();
            text.insert(0, command.text);
            node.insert(0, [text]);
            nodes = [node];
          }
          if (
            target instanceof Y.XmlElement &&
            nodes.length === 1 &&
            nodes[0].nodeName === target.nodeName
          ) {
            const id = target.getAttribute('id');
            if (id !== undefined) nodes[0].setAttribute('id', id);
            else nodes[0].removeAttribute('id');
          }
          const index = target
            ? root.toArray().indexOf(target)
            : command.type === 'prepend'
              ? prependOffset
              : root.length;
          if (target) root.delete(index, 1);
          root.insert(index, nodes);
          if (!target && command.type === 'prepend')
            prependOffset += nodes.length;
        }
      });
      return root.toString() === originalContent
        ? binary
        : Y.encodeStateAsUpdate(candidate);
    } finally {
      candidate.destroy();
    }
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private sign(value: object): string {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${createHmac('sha256', this.signingKey).update(body).digest('base64url')}`;
  }

  private verify(value: string): Record<string, any> {
    if (typeof value !== 'string' || value.length > 4096)
      return reject('BLOCK_REFERENCE_INVALID');
    const [body, signature, extra] = value.split('.');
    if (!body || !signature || extra) return reject('BLOCK_REFERENCE_INVALID');
    const expected = createHmac('sha256', this.signingKey)
      .update(body)
      .digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return reject('BLOCK_REFERENCE_INVALID');
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return reject('BLOCK_REFERENCE_INVALID');
    }
  }
}

/** A protected descendant or mark protects its entire ancestor block. */
export function isEditableBlock(node: unknown): boolean {
  if (node instanceof Y.XmlText)
    return node
      .toDelta()
      .every(
        (delta) =>
          typeof delta.insert === 'string' &&
          Object.keys(delta.attributes ?? {}).every((mark) =>
            ['bold', 'italic', 'strike', 'code', 'underline', 'link'].includes(
              mark,
            ),
          ),
      );
  return (
    node instanceof Y.XmlElement &&
    [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'blockquote',
      'codeBlock',
      'hardBreak',
    ].includes(node.nodeName) &&
    node.toArray().every(isEditableBlock)
  );
}
