import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../vendor/identity-sdk/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('identity-sdk-provenance.json', root), 'utf8'));
const archive = 'wushushuochanpin-identity-server-0.5.1.tgz';
const digest = createHash('sha256').update(readFileSync(new URL(archive, root))).digest('hex');
if (provenance.repository !== 'company-identity-center' ||
    provenance.baseCommit !== 'd58e03a662b102e1060f9c52f44ed24347d30d3e' ||
    provenance.workingTreeSnapshot !== false || provenance.freshlyCompiled !== true ||
    provenance.version !== '0.5.1' || provenance.packages?.server?.archive !== archive ||
    provenance.packages.server.sha256 !== digest) {
  throw new Error('Identity SDK artifact provenance mismatch');
}
const manifest = JSON.parse(execFileSync('tar', ['-xOf', fileURLToPath(new URL(archive, root)), 'package/package.json'], { encoding: 'utf8' }));
const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const marker = `  '@wushushuochanpin/identity-server@file:vendor/identity-sdk/${archive}(fastify@5.8.5)':`;
const start = lock.indexOf(marker);
const end = lock.indexOf('\n\n', start);
if (start < 0 || end < 0) throw new Error('Identity SDK lockfile snapshot missing');
const snapshot = lock.slice(start, end);
for (const [name, version] of Object.entries(manifest.dependencies)) {
  if (!snapshot.includes(`\n      ${name}: ${version}\n`)) throw new Error(`Identity SDK lockfile dependency mismatch: ${name}`);
}
console.log('Identity SDK artifact provenance and dependency versions verified');
