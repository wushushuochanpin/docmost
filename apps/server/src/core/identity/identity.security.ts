import { BadRequestException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export const IDENTITY_BROWSER_COOKIE = 'identityBrowser';
export const IDENTITY_TTL_MS = 5 * 60_000;
export const opaquePattern = /^[A-Za-z0-9_-]{43}$/;
export const randomIdentitySecret = () => randomBytes(32).toString('base64url');
export const identityHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export function sealIdentity(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('docmost.identity.v1'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}

export function openIdentity<T>(value: string, key: Buffer): T {
  const buffer = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
  decipher.setAAD(Buffer.from('docmost.identity.v1'));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(buffer.subarray(28)),
      decipher.final(),
    ]).toString('utf8'),
  );
}

export function identityReturnTo(raw?: string): string {
  if (!raw) return '/home';
  if (
    raw.length > 2048 ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    [...raw].some((character) => character.charCodeAt(0) <= 32)
  ) {
    throw new BadRequestException('invalid_return_to');
  }
  const url = new URL(raw, 'https://local.invalid');
  if (url.origin !== 'https://local.invalid' || url.pathname.includes('%'))
    throw new BadRequestException('invalid_return_to');
  const valid =
    url.pathname === '/home' ||
    url.pathname === '/' ||
    url.pathname === '/settings/account/profile' ||
    /^\/s\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
    /^\/s\/[a-zA-Z0-9_-]+\/p\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
    (url.pathname === '/oauth/consent' &&
      /^[0-9a-f-]{36}$/i.test(url.searchParams.get('request_id') ?? '') &&
      [...url.searchParams.keys()].every((k) => k === 'request_id') &&
      url.searchParams.getAll('request_id').length === 1);
  if (!valid) throw new BadRequestException('invalid_return_to');
  return url.pathname + url.search + url.hash;
}
