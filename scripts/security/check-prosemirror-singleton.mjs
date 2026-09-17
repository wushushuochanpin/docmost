#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const viteConfigPath = path.join(rootDir, "apps/client/vite.config.ts");

const requiredEntries = [
  ["changeset", "prosemirror-changeset", "dist/index.js"],
  ["collab", "prosemirror-collab", "dist/index.js"],
  ["commands", "prosemirror-commands", "dist/index.js"],
  ["dropcursor", "prosemirror-dropcursor", "dist/index.js"],
  ["gapcursor", "prosemirror-gapcursor", "dist/index.js"],
  ["history", "prosemirror-history", "dist/index.js"],
  ["inputrules", "prosemirror-inputrules", "dist/index.js"],
  ["keymap", "prosemirror-keymap", "dist/index.js"],
  ["markdown", "prosemirror-markdown", "dist/index.js"],
  ["menu", "prosemirror-menu", "dist/index.js"],
  ["model", "prosemirror-model", "dist/index.js"],
  ["schema-basic", "prosemirror-schema-basic", "dist/index.js"],
  ["schema-list", "prosemirror-schema-list", "dist/index.js"],
  ["state", "prosemirror-state", "dist/index.js"],
  ["tables", "prosemirror-tables", "dist/index.js"],
  [
    "trailing-node",
    "prosemirror-trailing-node",
    "dist/prosemirror-trailing-node.js",
  ],
  ["transform", "prosemirror-transform", "dist/index.js"],
  ["view", "prosemirror-view", "dist/index.js"],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTuple(source, [tiptapName, packageName, entryPoint]) {
  const pattern = new RegExp(
    String.raw`\[\s*["']${escapeRegExp(tiptapName)}["']\s*,\s*["']${escapeRegExp(packageName)}["']\s*,\s*["']${escapeRegExp(entryPoint)}["']\s*,?\s*\]`,
    "m",
  );

  return pattern.test(source);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const violations = [];
  const source = await fs.readFile(viteConfigPath, "utf8");

  for (const entry of requiredEntries) {
    const [, packageName, entryPoint] = entry;

    if (!hasTuple(source, entry)) {
      violations.push(
        `missing ProseMirror singleton alias tuple: ${entry.join(" -> ")}`,
      );
    }

    const entryPath = path.join(
      rootDir,
      "node_modules",
      packageName,
      entryPoint,
    );
    if (
      (await pathExists(path.join(rootDir, "node_modules"))) &&
      !(await pathExists(entryPath))
    ) {
      violations.push(
        `configured ProseMirror ESM entry does not exist: ${entryPath}`,
      );
    }
  }

  if (!source.includes("`@tiptap/pm/${tiptapName}`")) {
    violations.push("missing generated @tiptap/pm/* alias mapping");
  }

  if (!source.includes("{ find: packageName, replacement }")) {
    violations.push("missing generated bare prosemirror-* alias mapping");
  }

  if (!source.includes("dedupe: prosemirrorPackageNames")) {
    violations.push("missing ProseMirror Vite dedupe list");
  }

  const bareReplacementPattern =
    /find:\s*["']@tiptap\/pm\/[^"']+["']\s*,\s*replacement:\s*["']prosemirror-[^"']+["']/;

  if (bareReplacementPattern.test(source)) {
    violations.push(
      "found @tiptap/pm/* alias to a bare prosemirror-* package; use absolute ESM dist entries instead",
    );
  }

  if (violations.length === 0) {
    console.log("ProseMirror singleton guard passed.");
    return;
  }

  console.error("ProseMirror singleton guard failed.");
  console.error(
    "This prevents the production editor crash where duplicate prosemirror-view runtimes break DecorationSet identity and throw localsInner errors.",
  );

  for (const violation of violations) {
    console.error(`- ${violation}`);
  }

  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
