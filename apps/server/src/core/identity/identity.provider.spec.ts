import { IdentityProvider } from './identity.provider';
import { sealIdentity } from './identity.security';

describe('Identity center adapter (provider boundary stub)', () => {
  const encryptionKey = Buffer.alloc(32, 3);
  const configuration = {
    issuer: 'https://center.test',
    clientId: 'docmost',
    clientSecret: 'server-secret',
    callback: 'https://book.test/api/identity/callback',
    surface: 'web',
    encryptionKey,
  };
  const state = 'a'.repeat(43);
  const originalFetch = global.fetch;
  let adapter: IdentityProvider;
  beforeEach(() => {
    adapter = new IdentityProvider({ get: () => configuration } as any);
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the exact state as complete id and an empty authenticated body', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(Response.json({ status: 'consumed' }));
    await adapter.complete(state);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL(
        `https://center.test/delegation/hosted/requests/${state}/complete`,
      ),
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('docmost:server-secret').toString('base64')}`,
        }),
      }),
    );
  });
  it('rejects hostile hosted redirects before returning them to a browser', async () => {
    const expiresAt = Date.now() + 100000;
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        Response.json({ url: 'https://evil.test/login', expiresAt }),
      );
    await expect(
      adapter.create(new URLSearchParams({ state }), expiresAt),
    ).rejects.toThrow('center_unavailable');
  });
  it('fails closed when center cannot confirm consumption', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 410 }));
    await expect(adapter.complete(state)).rejects.toThrow('center_unavailable');
  });
  it('requires signed OIDC identity and positive finite expiry after exchange', async () => {
    const authorizationCodeGrant = jest
      .fn()
      .mockResolvedValue({
        access_token: 'token',
        expires_in: 60,
        claims: () => ({
          sub: 'person',
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      });
    jest
      .spyOn(adapter, 'provider')
      .mockResolvedValue({
        oidc: { authorizationCodeGrant },
        config: {},
      } as any);
    const result = await adapter.exchange(
      new URL(configuration.callback + '?code=one&state=' + state),
      state,
      'nonce',
      'verifier',
    );
    expect(result.subject).toBe('person');
    expect(authorizationCodeGrant.mock.calls[0][2]).toEqual({
      expectedState: state,
      expectedNonce: 'nonce',
      pkceCodeVerifier: 'verifier',
      idTokenExpected: true,
    });
    authorizationCodeGrant.mockResolvedValue({
      access_token: 'token',
      expires_in: 60,
      claims: () => undefined,
    });
    await expect(
      adapter.exchange(
        new URL(configuration.callback),
        state,
        'nonce',
        'verifier',
      ),
    ).rejects.toThrow('identity_invalid');
  });
  it.each([
    { active: false, sub: 'person', client_id: 'docmost' },
    { active: true, sub: 'other', client_id: 'docmost' },
    { active: true, sub: 'person', client_id: 'other' },
  ])(
    'rejects inactive, subject or client mismatch on ongoing access',
    async (active) => {
      jest
        .spyOn(adapter, 'provider')
        .mockResolvedValue({
          oidc: {
            tokenIntrospection: async () => active,
            fetchUserInfo: async () => ({ sub: 'person' }),
          },
          config: {},
        } as any);
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          Response.json({
            status: 'ok',
            sub: 'person',
            data: { id: 'person' },
          }),
        );
      await expect(
        adapter.verify({
          issuer: configuration.issuer,
          clientId: 'docmost',
          subject: 'person',
          encryptedAccessToken: sealIdentity('token', encryptionKey),
          expiresAt: Date.now() + 60000,
        }),
      ).rejects.toThrow('identity_unavailable');
    },
  );
  it('denies center-disabled identity without reading any role or grants field', async () => {
    jest
      .spyOn(adapter, 'provider')
      .mockResolvedValue({
        oidc: {
          tokenIntrospection: async () => ({
            active: true,
            sub: 'person',
            client_id: 'docmost',
          }),
          fetchUserInfo: async () => ({ sub: 'person' }),
        },
        config: {},
      } as any);
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        Response.json({
          status: 'ok',
          sub: 'person',
          data: { id: 'person', isForbidden: true },
        }),
      );
    await expect(
      adapter.verify({
        issuer: configuration.issuer,
        clientId: 'docmost',
        subject: 'person',
        encryptedAccessToken: sealIdentity('token', encryptionKey),
        expiresAt: Date.now() + 60000,
      }),
    ).rejects.toThrow('identity_unavailable');
  });
});
