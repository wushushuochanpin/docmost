#!/usr/bin/env node
/**
 * Client bundle integrity guard.
 *
 * Catches the class of production crash we hit twice (mermaid group, then
 * excalidraw group): manual `advancedChunks` vendor groups split a heavy
 * library into a group chunk plus sub-chunks, and server (Rolldown/Rust)
 * builds can emit broken cross-chunk interfaces (import name not among the
 * target chunk's exports) or cyclic splits (sub-chunk <-> index) whose
 * re-exported value is not initialized when the sub-chunk runs ->
 * "TypeError: x is not a function" on page load. Because local builds can
 * look fine while the server build is broken, this guard is part of CI and
 * must also be re-run against the *server image* after every deploy
 * (docker run --rm docmost:local node .../check-bundle-integrity.mjs).
 *
 * Checks (run against apps/client/dist/assets after `pnpm --filter client build`):
 *   1. Cross-chunk static imports: every imported symbol must exist in the
 *      target chunk's `export{...}` name set (rolldown emits
 *      "internalName as exportName" — compare export names).
 *   2. No manual vendor groups for heavy lazy libs may remain in the
 *      bundle: vendor-mermaid / vendor-excalidraw / vendor-katex chunks
 *      must not exist.
 *   3. The eager closure (index.html entry + its static import closure) must
 *      not contain any chunk over MAX_EAGER_CHUNK_BYTES and must not
 *      reference mermaid.core / katex / vendor-* heavy chunks, i.e. heavy
 *      libraries must stay on lazy dynamic-import chains.
 *   4. index.html <link rel="modulepreload"> list must not contain any
 *      chunk over MAX_EAGER_CHUNK_BYTES (first-screen budget).
 *
 * Exit code 0 on pass, 1 with details on any failure.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

// Allow pointing at a different dist (e.g. inside the production image):
//   node check-bundle-integrity.mjs --assets /app/apps/client/dist/assets
const argAssets = process.argv.findIndex((a) => a === "--assets");
const distRoot = argAssets > 0 ? process.argv[argAssets + 1] : null;
const assetsDir = distRoot
  ? path.resolve(distRoot)
  : path.join(rootDir, "apps/client/dist/assets");
const indexPath = distRoot
  ? path.join(path.dirname(assetsDir), "index.html")
  : path.join(rootDir, "apps/client/dist/index.html");

const MAX_EAGER_CHUNK_BYTES = 600 * 1024; // vendor-mantine (~360KB) is the largest allowed eager chunk
const FORBIDDEN_VENDOR_CHUNKS = [
  /^vendor-mermaid-/,
  /^vendor-excalidraw-/,
  /^vendor-katex-/,
];
const HEAVY_LAZY_MARKERS = [/mermaid\.core-/, /^katex-/];

function exportNames(source) {
  const names = new Set();
  const re = /export\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(source))) {
    for (const item of m[1].split(",")) {
      const it = item.trim();
      if (!it) continue;
      const asIdx = it.lastIndexOf(" as ");
      names.add(asIdx > 0 ? it.slice(asIdx + 4).trim() : it);
    }
  }
  return names;
}

function failures() {
  const results = [];
  return {
    fail(msg) {
      results.push(msg);
    },
    get() {
      return results;
    },
  };
}

async function main() {
  const guard = failures();

  let files;
  try {
    files = await fs.readdir(assetsDir);
  } catch {
    console.error(
      `FATAL: ${assetsDir} not found. Build the client first: pnpm --filter client build`,
    );
    process.exit(1);
  }
  const jsFiles = files.filter((f) => f.endsWith(".js"));
  const content = new Map();
  for (const f of jsFiles) {
    content.set(f, await fs.readFile(path.join(assetsDir, f), "utf8"));
  }

  // --- 2. forbidden vendor group chunks must not exist ---------------------
  for (const f of jsFiles) {
    for (const re of FORBIDDEN_VENDOR_CHUNKS) {
      if (re.test(f)) {
        guard.fail(
          `Forbidden manual vendor group chunk present: ${f}. Heavy lazy libs (mermaid/excalidraw/katex) must be chunked naturally.`,
        );
      }
    }
  }

  // --- 1. cross-chunk import/export interface check ------------------------
  let checked = 0;
  let depsWithoutExportDecl = 0;
  for (const [f, src] of content) {
    const re = /import\{([^}]*)\}from"\.\/([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      const [, syms, dep] = m;
      const depFile = jsFiles.find((x) => x === dep || x.startsWith(dep));
      if (!depFile || !content.has(depFile)) {
        guard.fail(`Missing chunk: ${f} imports "./${dep}" (not found).`);
        continue;
      }
      const exp = exportNames(content.get(depFile));
      if (exp.size === 0) depsWithoutExportDecl++;
      for (const s of syms.split(",")) {
        const name = s.trim().split(" as ")[0];
        checked++;
        if (!exp.has(name)) {
          guard.fail(
            `Export mismatch: ${f} imports "${name}" from ${depFile}, but that chunk does not export it (rolldown server-build bug class: 'TypeError: x is not a function').`,
          );
        }
      }
    }
  }
  console.log(`[bundle-integrity] cross-chunk imports checked: ${checked}`);

  // --- eager closure (index.html entry -> static imports, recursive) -------
  const seen = new Set();
  const eagerChunks = [];
  function collectEager(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = content.get(file);
    if (!src) return;
    eagerChunks.push(file);
    const re = /from"\.\/([a-zA-Z0-9._-]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      const dep = jsFiles.find((x) => x === m[1] || x.startsWith(m[1]));
      if (dep) collectEager(dep);
    }
  }
  let indexHtml;
  try {
    indexHtml = await fs.readFile(indexPath, "utf8");
  } catch {
    guard.fail(`FATAL: ${indexPath} not found.`);
  }
  const entryMatch = indexHtml && indexHtml.match(/assets\/(index-[a-zA-Z0-9_-]+\.js)/);
  if (!entryMatch) {
    guard.fail("Could not locate entry chunk (assets/index-*.js) in index.html.");
  } else {
    collectEager(entryMatch[1]);
    const eagerBytes = new Map();
    for (const f of eagerChunks) {
      const st = await fs.stat(path.join(assetsDir, f));
      eagerBytes.set(f, st.size);
    }
    for (const [f, size] of eagerBytes) {
      if (size > MAX_EAGER_CHUNK_BYTES) {
        guard.fail(
          `Heavy chunk ${f} (${(size / 1024).toFixed(0)}KB) is in the eager closure; a heavy lib returned to the page-load path (was: ${MAX_EAGER_CHUNK_BYTES / 1024}KB budget).`,
        );
      }
      for (const marker of HEAVY_LAZY_MARKERS) {
        if (marker.test(f)) {
          guard.fail(
            `Lazy library chunk ${f} is statically referenced by the eager closure; it must stay on a dynamic-import chain.`,
          );
        }
      }
    }
    console.log(
      `[bundle-integrity] eager closure: ${eagerChunks.length} chunks, ${(
        [...eagerBytes.values()].reduce((a, b) => a + b, 0) /
        1024 /
        1024
      ).toFixed(2)}MB`,
    );
  }

  // --- 4. modulepreload list budget ----------------------------------------
  if (indexHtml) {
    const preloads = [...indexHtml.matchAll(/href="\.?\/(assets\/[a-zA-Z0-9._-]+\.js)"/g)]
      .map((m) => m[1]);
    for (const p of preloads) {
      const file = path.basename(p);
      if (!content.has(file)) {
        guard.fail(`index.html preloads missing chunk: ${file}`);
        continue;
      }
      const size = Buffer.byteLength(content.get(file));
      if (size > MAX_EAGER_CHUNK_BYTES) {
        guard.fail(
          `index.html modulepreloads heavy chunk ${file} (${(size / 1024).toFixed(0)}KB) on the first screen; over ${MAX_EAGER_CHUNK_BYTES / 1024}KB budget.`,
        );
      }
    }
  }

  const errors = guard.get();
  if (errors.length > 0) {
    console.error(`[bundle-integrity] FAIL (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("[bundle-integrity] PASS: interface, vendor groups, eager closure, preload budget all clean.");
}

main().catch((e) => {
  console.error("[bundle-integrity] unexpected error:", e);
  process.exit(1);
});
