import { createHmac, timingSafeEqual } from 'node:crypto';
import { DocumentCommandError } from './document-candidate';

/** Domain-separated, identity/filter/revision-bound cursors. Never a permission grant. */
export function sealCursor(binding: object, position: string | number): string {
  const body = Buffer.from(
    JSON.stringify({ binding, position, expires: Date.now() + 3600_000 }),
  ).toString('base64url');
  return body + '.' + signature(body).toString('base64url');
}
function signature(body: string) {
  const key = Buffer.from(
    process.env.DOCUMENT_COMMAND_SIGNING_KEY ?? '',
    'base64',
  );
  if (key.length < 32) throw new Error('DOCUMENT_COMMAND_SIGNING_KEY_REQUIRED');
  return createHmac('sha256', key)
    .update('agent-cursor-v1\0' + body)
    .digest();
}
export function openCursor(token: string, binding: object): string | number {
  try {
    if (token.length > 8192) throw Error();
    const [body, mac, extra] = token.split('.');
    const actual = Buffer.from(mac, 'base64url'),
      expected = signature(body);
    if (
      extra ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw Error();
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (
      data.expires < Date.now() ||
      JSON.stringify(data.binding) !== JSON.stringify(binding)
    )
      throw Error();
    return data.position;
  } catch {
    throw new DocumentCommandError('REVISION_CONFLICT');
  }
}
