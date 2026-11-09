import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
console.log('Identity SDK artifact provenance verified');
