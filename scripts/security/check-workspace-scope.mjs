#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = path.join(process.cwd(), 'apps/server/src');

const rules = [
  { call: 'pageRepo.findById' },
  { call: 'shareRepo.findById' },
  { call: 'commentRepo.findById' },
  { call: 'attachmentRepo.findById' },
  { call: 'pageRepo.getPageAndDescendants' },
  { call: 'shareRepo.updateShare' },
  { call: 'shareRepo.deleteShare' },
  { call: 'commentRepo.updateComment' },
  { call: 'commentRepo.deleteComment' },
  { call: 'attachmentRepo.updateAttachment' },
  { call: 'attachmentRepo.deleteAttachmentById' },
  { call: 'attachmentRepo.deleteAttachmentByFilePath' },
  { call: 'attachmentRepo.findBySpaceId' },
];

function stripComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s+)\/\/.*$/gm, '$1');
}

async function collectTsFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTsFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
      out.push(fullPath);
    }
  }

  return out;
}

function lineNumberOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function hasWorkspaceGuard(callArgs) {
  return /workspaceId|workspace\./.test(callArgs);
}

function extractCallArgs(content, callIndex, callToken) {
  const openParenIndex = callIndex + callToken.length;
  if (content[openParenIndex] !== '(') {
    return null;
  }

  let depth = 1;
  let i = openParenIndex + 1;
  let quote = null;

  while (i < content.length) {
    const ch = content[i];
    const prev = content[i - 1];

    if (quote) {
      if (ch === quote && prev !== '\\') {
        quote = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      i++;
      continue;
    }

    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return content.slice(openParenIndex + 1, i);
      }
    }

    i++;
  }

  return null;
}

async function main() {
  const files = await collectTsFiles(rootDir);
  const violations = [];

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const content = stripComments(raw);

    for (const rule of rules) {
      const callToken = `${rule.call}(`;
      let searchFrom = 0;

      while (searchFrom < content.length) {
        const callIndex = content.indexOf(callToken, searchFrom);
        if (callIndex === -1) {
          break;
        }

        const args = extractCallArgs(content, callIndex, rule.call);
        if (args && !hasWorkspaceGuard(args)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: lineNumberOf(content, callIndex),
            call: rule.call,
          });
        }

        searchFrom = callIndex + callToken.length;
      }
    }
  }

  if (violations.length === 0) {
    console.log('Workspace scope check passed.');
    return;
  }

  console.error('Workspace scope check failed. Unscoped calls:');
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} ${v.call}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
