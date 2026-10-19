import { BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export const OAUTH_SCOPES = [
  'knowledge.read',
  'pages.create',
  'folders.create',
  'pages.edit',
] as const;
export const secretHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const opaque = (prefix: string) =>
  prefix + randomBytes(32).toString('base64url');
export const oauthError = (code: string): never => {
  throw new BadRequestException({ error: code });
};
export function exactParameters(
  value: unknown,
  allowed: string[],
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return oauthError('invalid_request');
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      !allowed.includes(key) ||
      typeof item !== 'string' ||
      item.length > 4096
    )
      return oauthError('invalid_request');
    result[key] = item;
  }
  return result;
}
export function validateRedirect(uri: string, publicClient: boolean) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return oauthError('invalid_request');
  }
  if (
    url.hash ||
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol)
  )
    return oauthError('invalid_request');
  if (
    url.protocol !== 'https:' &&
    !(publicClient && ['127.0.0.1', '[::1]'].includes(url.hostname))
  )
    return oauthError('invalid_request');
  return url;
}
export function matchesRedirect(
  uri: string,
  registered: string[],
  publicClient: boolean,
) {
  const actual = validateRedirect(uri, publicClient);
  return registered.some((value) => {
    const expected = validateRedirect(value, publicClient);
    if (actual.href === expected.href) return true;
    if (
      publicClient &&
      actual.protocol === 'http:' &&
      actual.hostname === expected.hostname
    ) {
      actual.port = '';
      expected.port = '';
      return actual.href === expected.href;
    }
    return false;
  });
}
export function scopeSet(value: string): string[] {
  const scopes = value?.split(' ');
  if (
    !scopes?.length ||
    new Set(scopes).size !== scopes.length ||
    !scopes.includes('knowledge.read') ||
    scopes.some((s) => !OAUTH_SCOPES.includes(s as any))
  )
    return oauthError('invalid_scope');
  return scopes;
}
