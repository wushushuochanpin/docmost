import type { Node, Schema } from '@tiptap/pm/model';
import { DOMSerializer } from '@tiptap/pm/model';

const { JSDOM } = require('jsdom') as {
  JSDOM: new (...args: any[]) => any;
};

/**
 * Returns the HTML string representation of a given document node.
 *
 * @remarks **Important**: This function requires `jsdom` to be installed in your project.
 * @param doc - The document node to serialize.
 * @param schema - The Prosemirror schema to use for serialization.
 * @returns A promise containing the HTML string representation of the document fragment.
 *
 * @example
 * ```typescript
 * const html = getHTMLFromFragment(doc, schema)
 * ```
 */
export function getHTMLFromFragment(
  doc: Node,
  schema: Schema,
  options?: { document?: Document },
): string {
  if (options?.document) {
    const wrap = options.document.createElement('div');

    DOMSerializer.fromSchema(schema).serializeFragment(
      doc.content,
      { document: options.document },
      wrap,
    );
    return wrap.innerHTML;
  }

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const localWindow = dom.window;
  let result: string;

  try {
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
      doc.content,
      {
        document: localWindow.document as unknown as Document,
      },
    );

    const serializer = new localWindow.XMLSerializer();
    result = serializer.serializeToString(fragment as any);
  } finally {
    localWindow.close();
  }

  return result;
}
