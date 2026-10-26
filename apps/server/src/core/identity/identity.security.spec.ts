import {
  identityReturnTo,
  openIdentity,
  randomIdentitySecret,
  sealIdentity,
} from './identity.security';

describe('Identity transaction security', () => {
  const key = Buffer.alloc(32, 7);
  it('encrypts server-only transaction material with authenticated encryption', () => {
    const plaintext = {
      verifier: randomIdentitySecret(),
      nonce: randomIdentitySecret(),
    };
    const encrypted = sealIdentity(plaintext, key);
    expect(encrypted).not.toContain(plaintext.verifier);
    expect(openIdentity(encrypted, key)).toEqual(plaintext);
    const tampered = Buffer.from(encrypted, 'base64url');
    tampered[30] ^= 1;
    expect(() => openIdentity(tampered.toString('base64url'), key)).toThrow();
    expect(() => openIdentity(encrypted, Buffer.alloc(32, 8))).toThrow();
  });
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/api/auth/logout',
    '/s/../login',
    '/oauth/consent?request_id=bad',
    '/oauth/consent?request_id=12345678-1234-1234-1234-123456789012&redirect=https://evil.test',
  ])('rejects unregistered local or external return %s', (value) => {
    expect(() => identityReturnTo(value)).toThrow();
  });
  it.each([
    '/home',
    '/settings/account/profile',
    '/s/general/p/document-abc',
    '/oauth/consent?request_id=12345678-1234-1234-1234-123456789012',
  ])('accepts known product destination %s', (value) => {
    expect(identityReturnTo(value)).toBe(value);
  });
});
