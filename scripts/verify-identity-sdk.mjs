import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../vendor/identity-sdk/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('identity-sdk-provenance.json', root), 'utf8'));
const version = '0.5.5-build.g493ca2d1c2d4a9b3f898b194e79eceb180f00436.b511f60f8e52d4fa3a6e7c7d5c9556524';
const baseCommit = '493ca2d1c2d4a9b3f898b194e79eceb180f00436';
if (provenance.repository !== 'company-identity-center' || provenance.baseCommit !== baseCommit ||
    provenance.version !== version || provenance.buildId !== '511f60f8e52d4fa3a6e7c7d5c9556524' ||
    provenance.workingTreeSnapshot !== false || provenance.freshlyCompiled !== true)
  throw new Error('Identity SDK artifact provenance mismatch');
const client = JSON.parse(readFileSync(new URL('../apps/client/package.json', import.meta.url), 'utf8'));
const server = JSON.parse(readFileSync(new URL('../apps/server/package.json', import.meta.url), 'utf8'));
const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
for (const name of ['server', 'web', 'react']) {
  const item = provenance.packages?.[name];
  const archive = `wushushuochanpin-identity-${name}-${version}.tgz`;
  const packageName = `@wushushuochanpin/identity-${name}`;
  if (!item || item.name !== packageName || item.version !== version || item.archive !== archive)
    throw new Error(`Identity SDK package identity mismatch: ${name}`);
  const file = new URL(archive, root);
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== item.sha256)
    throw new Error(`Identity SDK artifact digest mismatch: ${name}`);
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', fileURLToPath(file), 'package/package.json'], { encoding: 'utf8' }));
  if (manifest.name !== packageName || manifest.version !== version ||
      (name === 'react' && manifest.dependencies?.['@wushushuochanpin/identity-web'] !== version))
    throw new Error(`Identity SDK tarball manifest mismatch: ${name}`);
  const declared = (name === 'server' ? server : client).dependencies[packageName];
  if (declared !== `file:../../vendor/identity-sdk/${archive}` || !lock.includes(`file:vendor/identity-sdk/${archive}`))
    throw new Error(`Identity SDK dependency mismatch: ${name}`);
  if (name === 'server') {
    const marker = `  '${packageName}@file:vendor/identity-sdk/${archive}(fastify@5.8.5)':`;
    const start = lock.indexOf(marker), end = lock.indexOf('\n\n', start);
    if (start < 0 || end < 0) throw new Error('Identity SDK server lockfile snapshot missing');
    const snapshot = lock.slice(start, end);
    for (const [dependency, expected] of Object.entries(manifest.dependencies))
      if (!snapshot.includes(`\n      ${dependency}: ${expected}\n`)) throw new Error(`Identity SDK dependency version mismatch: ${dependency}`);
  }
}
const webArchive = provenance.packages.web.archive;
if (rootPackage.pnpm.overrides['@wushushuochanpin/identity-react>@wushushuochanpin/identity-web'] !== `file:vendor/identity-sdk/${webArchive}`)
  throw new Error('Identity SDK React dependency override mismatch');
console.log('Identity SDK artifacts, provenance and dependency versions verified');
