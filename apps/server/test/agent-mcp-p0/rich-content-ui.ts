import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
// Two complete GIF frames, retained byte-for-byte by upload_image.
const gif = Buffer.from(
  '47494638396101000100800000000000ffffff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b',
  'hex',
).toString('base64');
const text = (value: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});
const table = (value: string) => ({
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: ['A', 'B'].map((v) => ({
        type: 'tableHeader',
        content: [text(v)],
      })),
    },
    {
      type: 'tableRow',
      content: [value, 'Native cell'].map((v) => ({
        type: 'tableCell',
        content: [text(v)],
      })),
    },
  ],
});
export async function richContentUi(
  mcp: (name: string, args: any) => Promise<any>,
  tab: any,
  pg: any,
  origin: string,
  workspace: string,
  space: string,
  folder: string,
) {
  const priorLimits = (
    await pg`SELECT quota_limits FROM agent_policies WHERE workspace_id=${workspace}`
  )[0].quota_limits;
  // Keep this rendering fixture separate from quota-specific tests.
  await pg`UPDATE agent_policies SET quota_limits=${pg.json({ write: 100, read: 200, query: 100 })} WHERE workspace_id=${workspace}`;
  const call = async (name: string, args: any) => {
    const response = await mcp(name, args);
    expect(
      response.isError ? response.structuredContent : undefined,
    ).toBeUndefined();
    return response.structuredContent;
  };
  const created = await call('create_page', {
    space_id: space,
    parent_id: folder,
    title: 'Rich MCP acceptance',
    content: {
      type: 'doc',
      content: [
        table('Original cell'),
        { type: 'horizontalRule' },
        {
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [
            { type: 'text', text: 'flowchart LR\n A[First] --> B[Second]' },
          ],
        },
      ],
    },
    idempotency_key: 'rich-create',
  });
  const page = created.page_id;
  const uploads: any[] = [];
  for (const [index, data] of [png, gif].entries()) {
    const input = {
      page_id: page,
      file_name: `figure-${index}`,
      data_base64: data,
      idempotency_key: `rich-image-${index}`,
    };
    const saved = await call('upload_image', input);
    uploads.push(saved);
    expect(saved.sha256).toBe(
      createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex'),
    );
    expect(await call('upload_image', input)).toEqual(saved);
    const conflict = await mcp('upload_image', {
      ...input,
      file_name: 'different',
    });
    expect(conflict.structuredContent.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const operation = await call('get_operation', {
      tool: 'upload_image',
      idempotency_key: input.idempotency_key,
    });
    expect(operation.result).toEqual(saved);
  }
  expect(
    (
      await pg`SELECT count(*)::int as n FROM attachments WHERE page_id=${page}`
    )[0].n,
  ).toBe(2);
  const context = await call('get_edit_context', { page_id: page });
  const ops = [
    {
      type: 'append',
      content: {
        type: 'doc',
        content: uploads.map((upload, i) => ({
          type: 'imageFigure',
          content: [
            upload.node,
            {
              type: 'imageCaption',
              content: [{ type: 'text', text: `Editable caption ${i}` }],
            },
          ],
        })),
      },
    },
  ];
  const committed = await call('edit_page', {
    page_id: page,
    version_token: context.version_token,
    idempotency_key: 'rich-append',
    ops,
  });
  expect(committed.status).toBe('committed');
  expect(
    (
      await call('edit_page', {
        page_id: page,
        version_token: context.version_token,
        idempotency_key: 'rich-append',
        ops,
      })
    ).operation_id,
  ).toBe(committed.operation_id);
  // An attachment from a different page cannot be smuggled into a new document.
  const denied = await mcp('create_page', {
    space_id: space,
    parent_id: folder,
    title: 'Must rollback',
    content: { type: 'doc', content: [uploads[0].node] },
    idempotency_key: 'rich-wrong-page',
  });
  expect(denied.structuredContent.code).toBe('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
  expect(
    (await pg`SELECT id FROM pages WHERE title='Must rollback'`).length,
  ).toBe(0);
  const saved = (await pg`SELECT ydoc,content FROM pages WHERE id=${page}`)[0];
  const doc = new Y.Doc();
  Y.applyUpdate(doc, saved.ydoc);
  expect(TiptapTransformer.fromYdoc(doc, 'default')).toEqual(saved.content);
  doc.destroy();
  const url = origin + '/p/' + page;
  await tab.goto(url);
  await tab.waitForFunction(
    () =>
      document.querySelectorAll('.ProseMirror table').length > 0 &&
      document.querySelectorAll('.ProseMirror figure img').length === 2 &&
      document.querySelector('.ProseMirror svg[id^="mermaid-"]'),
  );
  await tab.waitForFunction(() =>
    [...document.querySelectorAll('.ProseMirror figure img')].every(
      (img) =>
        (img as HTMLImageElement).complete &&
        (img as HTMLImageElement).naturalWidth > 0,
    ),
  );
  expect(await tab.evaluate(() => document.body.innerText)).not.toContain(
    '页面加载失败',
  );
  for (const upload of uploads) {
    const bytes = await tab.evaluate(async (src: string) => {
      const response = await fetch(src);
      return {
        status: response.status,
        type: response.headers.get('content-type'),
        disposition: response.headers.get('content-disposition'),
        data: Array.from(new Uint8Array(await response.arrayBuffer())),
      };
    }, '/api' + upload.src);
    expect(bytes.status).toBe(200);
    expect(bytes.type).toContain(upload.mime_type);
    expect(bytes.disposition).toBeNull();
    expect(
      createHash('sha256').update(Buffer.from(bytes.data)).digest('hex'),
    ).toBe(upload.sha256);
  }
  const caption = await tab.waitForSelector(
    '.ProseMirror[contenteditable="true"] figcaption',
  );
  expect(caption).toBeTruthy();
  await tab.bringToFront();
  await caption.click();
  await caption.evaluate((el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await new Promise((r) => setTimeout(r, 100));
  await tab.keyboard.type(' updated in browser');
  await tab.waitForFunction(() =>
    document
      .querySelector('.ProseMirror figcaption')
      ?.textContent?.includes('updated in browser'),
  );
  for (let i = 0; i < 100; i++) {
    if (
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${page}`)[0].content,
      ).includes('updated in browser')
    )
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await tab.waitForFunction(() =>
    document.body.innerText.includes('修改已可靠保存'),
  );
  await tab.goto(origin + '/home');
  for (let i = 0; i < 100; i++) {
    if (
      !(
        await pg`SELECT 1 FROM document_human_permits WHERE page_id=${page} AND expires_at>clock_timestamp()`
      ).length
    )
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const fresh = await call('get_edit_context', { page_id: page });
  expect(
    fresh.blocks
      .find((b: any) => b.type === 'imageFigure')
      .content.content[1].content.map((n: any) => n.text ?? '')
      .join(''),
  ).toContain('updated in browser');
  const replacements = [
    {
      type: 'replace_block',
      block_ref: fresh.blocks.find((b: any) => b.type === 'table').block_ref,
      content: { type: 'doc', content: [table('Changed cell')] },
    },
    {
      type: 'replace_block',
      block_ref: fresh.blocks.find((b: any) => b.type === 'codeBlock')
        .block_ref,
      markdown: '```mermaid\nflowchart LR\n A[Changed] --> C[Verified]\n```',
    },
  ];
  await call('edit_page', {
    page_id: page,
    version_token: fresh.version_token,
    idempotency_key: 'rich-replace',
    ops: replacements,
  });
  const stale = await mcp('edit_page', {
    page_id: page,
    version_token: fresh.version_token,
    idempotency_key: 'rich-stale',
    ops: replacements,
  });
  expect(stale.structuredContent.code).toBe('REVISION_CONFLICT');
  const final = await call('get_edit_context', { page_id: page });
  expect(
    final.blocks.filter((b: any) => b.type === 'imageFigure'),
  ).toHaveLength(2);
  expect(
    final.blocks.every((b: any) => !b.protected && !b.content_truncated),
  ).toBe(true);
  expect(
    final.blocks.find((b: any) => b.type === 'codeBlock').content.content[0]
      .text,
  ).toContain('C[Verified]');
  await tab.goto(url);
  await tab.waitForFunction(
    () =>
      document
        .querySelector('.ProseMirror svg[id^="mermaid-"]')
        ?.textContent?.includes('Verified') &&
      document
        .querySelector('.ProseMirror table')
        ?.textContent?.includes('Changed cell'),
  );
  await tab.reload();
  await tab.waitForFunction(
    () =>
      document.querySelectorAll('.ProseMirror figcaption').length === 2 &&
      document
        .querySelector('.ProseMirror svg[id^="mermaid-"]')
        ?.textContent?.includes('Verified'),
  );
  await tab.waitForSelector('.ProseMirror[contenteditable="true"] figcaption');
  await tab.waitForFunction(() => {
    const svg = document.querySelector('.ProseMirror svg[id^="mermaid-"]');
    return (
      svg?.textContent?.includes('Verified') &&
      svg.getBoundingClientRect().height > 30 &&
      document.body.innerText.includes('修改已可靠保存')
    );
  });
  await tab.screenshot({
    path: '/tmp/docmost-rich-content-verified.png',
    fullPage: true,
  });
  await tab.goto(origin + '/home');
  await pg`UPDATE agent_policies SET quota_limits=${pg.json(priorLimits)} WHERE workspace_id=${workspace}`;
}
