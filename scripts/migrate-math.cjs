// One-shot migration: lift bare $...$ / $$...$$ text nodes into mathInline/mathBlock
// Tiptap nodes. Dry-run by default; pass --apply to actually write.
const postgres = require('postgres');
const Y = require('yjs');
const { TiptapTransformer } = require('@hocuspocus/transformer');
const { tiptapExtensions } = require('/app/apps/server/dist/collaboration/collaboration.util.js');

const APPLY = process.argv.includes('--apply');

const INLINE_RE = /\$(?!\s)([^$]+?)(?<!\s)\$(?!\d)/g;
const BLOCK_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;

function splitInlineMathIntoNodes(text) {
  const nodes = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    nodes.push({ type: 'mathInline', attrs: { text: m[1].trim() } });
    last = m.index + m[0].length;
  }
  if (last === 0) return null;
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

function transform(node) {
  if (!node || typeof node !== 'object') return { node, changed: false };

  // paragraph whose whole text is $$...$$ -> mathBlock
  if (node.type === 'paragraph' && Array.isArray(node.content)) {
    const fullText = node.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('');
    const bm = fullText.match(BLOCK_RE);
    if (bm && bm[1].trim()) {
      return { node: { type: 'mathBlock', attrs: { text: bm[1].trim() } }, changed: true };
    }
  }

  if (!Array.isArray(node.content)) return { node, changed: false };

  const newChildren = [];
  let changed = false;
  for (const child of node.content) {
    if (child.type === 'text') {
      const parts = splitInlineMathIntoNodes(child.text || '');
      if (parts) {
        newChildren.push(...parts);
        changed = true;
        continue;
      }
    }
    const r = transform(child);
    if (r.changed) changed = true;
    newChildren.push(r.node);
  }
  return { node: { ...node, content: newChildren }, changed };
}

async function main() {
  const sql = postgres('postgresql://docmost:ea08e12222c4fc809cf2be9991f5c3fc@db:5432/docmost', { max: 1 });

  const rows = await sql`SELECT id, title, content FROM pages WHERE content IS NOT NULL ORDER BY created_at`;
  console.log(`Total pages: ${rows.length}`);

  let changedPages = 0;
  let inlineCount = 0;
  let blockCount = 0;

  for (const row of rows) {
    const orig = row.content;
    const r = transform(orig);
    if (!r.changed) continue;

    changedPages++;
    // count nodes
    const countInline = JSON.stringify(r.node).split('"mathInline"').length - 1;
    const countBlock = JSON.stringify(r.node).split('"mathBlock"').length - 1;
    inlineCount += countInline;
    blockCount += countBlock;

    console.log(`  [${APPLY ? 'WILL UPDATE' : 'DRY-RUN'}] ${row.id} "${(row.title || '').slice(0, 40)}" (+${countInline} inline, +${countBlock} block)`);

    if (APPLY) {
      const ydoc = TiptapTransformer.toYdoc(r.node, 'default', tiptapExtensions);
      const ydocState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
      await sql`UPDATE pages SET content = ${JSON.stringify(r.node)}::jsonb, ydoc = ${ydocState} WHERE id = ${row.id}`;
    }
  }

  console.log('');
  console.log(`${APPLY ? 'APPLIED' : 'DRY-RUN SUMMARY'}: ${changedPages} pages changed, ${inlineCount} inline math, ${blockCount} block math`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
