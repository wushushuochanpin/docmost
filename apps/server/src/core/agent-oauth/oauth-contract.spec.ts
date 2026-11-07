import { matchesRedirect, redirectOrigin, validateRedirect } from './oauth-contract';

describe('WorkBuddy OAuth redirect', () => {
  const uri = 'workbuddy://workbuddy/mcp/custom-mcp%3Adocmost/oauth/callback';

  it('accepts the exact public client callback and matches it exactly', () => {
    expect(redirectOrigin(validateRedirect(uri, true))).toBe('workbuddy://workbuddy');
    expect(matchesRedirect(uri, [uri], true)).toBe(true);
    expect(matchesRedirect(uri.replace('docmost', 'other'), [uri], true)).toBe(false);
    expect(() => validateRedirect(uri, false)).toThrow();
  });

  it.each([
    'workbuddy://evil/mcp/custom-mcp%3Adocmost/oauth/callback',
    'workbuddy://workbuddy/mcp/custom-mcp%3Adocmost/oauth/callback?x=1',
    'workbuddy://workbuddy/mcp/custom-mcp%3Adocmost/oauth/callback#fragment',
    'workbuddy://workbuddy/mcp/custom-mcp%3A..%2Fother/oauth/callback',
    'other://workbuddy/mcp/custom-mcp%3Adocmost/oauth/callback',
  ])('rejects unsafe or altered callback %s', (value) => {
    expect(() => validateRedirect(value, true)).toThrow();
  });
});
