import { redactSensitiveUrl } from './utils';

describe('identity HTTP log URL redaction', () => {
  it.each([
    '/api/identity/callback?code=secret-code&state=browser-binding',
    'https://book.example/api/identity/callback?code=secret-code&state=browser-binding',
    '/api/identity/start?returnTo=%2Foauth%2Fconsent%3Frequest_id%3Dsecret',
  ])('removes credentials and nested authorization state from %s', (url) => {
    expect(redactSensitiveUrl(url)).toBe(url.split('?')[0]);
  });
  it('preserves ordinary request diagnostics', () => {
    expect(redactSensitiveUrl('/api/pages?limit=10')).toBe(
      '/api/pages?limit=10',
    );
  });
});
