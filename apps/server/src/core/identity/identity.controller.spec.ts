jest.mock('./identity.service', () => ({ IdentityService: class {} }));
import { IdentityController } from './identity.controller';

function response() {
  const res: any = {
    header: jest.fn(),
    setCookie: jest.fn(),
    redirect: jest.fn(),
  };
  res.header.mockReturnValue(res);
  res.setCookie.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  return res;
}
describe('Identity HTTP contract', () => {
  const config = {
    get: () => ({ callback: 'https://book.test/api/identity/callback' }),
  };
  it('never sets an authentication cookie on successful callback', async () => {
    const identity = {
      callback: jest
        .fn()
        .mockResolvedValue({ returnTo: '/home?identity_authenticated=1' }),
    };
    const controller = new IdentityController(identity as any, config as any),
      res = response();
    await controller.callback(
      { id: 'workspace' } as any,
      {
        raw: { url: '/api/identity/callback?state=one&code=two' },
        cookies: { identityBrowser: 'browser', authToken: 'handle' },
      } as any,
      res,
    );
    expect(res.setCookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/home?identity_authenticated=1');
  });
  it('rejects cross-origin bootstrap before allocating any handle', async () => {
    const identity = { bootstrap: jest.fn() };
    const controller = new IdentityController(identity as any, config as any);
    await expect(
      controller.bootstrap(
        { id: 'workspace' } as any,
        { headers: { origin: 'https://evil.test' }, cookies: {} } as any,
        response(),
      ),
    ).rejects.toThrow('invalid_identity_request');
    expect(identity.bootstrap).not.toHaveBeenCalled();
  });
  it('does not overwrite an existing local authenticated cookie during bootstrap', async () => {
    const identity = {
      bootstrap: jest
        .fn()
        .mockResolvedValue({ ready: true, authenticated: true }),
    };
    const controller = new IdentityController(identity as any, config as any),
      res = response();
    await expect(
      controller.bootstrap(
        { id: 'workspace' } as any,
        {
          headers: { origin: 'https://book.test' },
          cookies: { authToken: 'existing' },
        } as any,
        res,
      ),
    ).resolves.toEqual({ ready: true, authenticated: true });
    expect(res.setCookie).not.toHaveBeenCalled();
  });
  it('reports center unavailability separately from transaction errors', async () => {
    const identity = {
      start: jest.fn().mockRejectedValue(new Error('center_unavailable')),
    };
    const controller = new IdentityController(identity as any, config as any),
      res = response();
    await controller.start(
      { id: 'workspace' } as any,
      '/home',
      { cookies: {} } as any,
      res,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      '/login?identity_error=center_unavailable',
    );
  });
  it('returns disabled before workspace initialization', () => {
    const controller = new IdentityController(
      { enabled: jest.fn() } as any,
      config as any,
    );
    expect(controller.status(undefined as any)).toEqual({ enabled: false });
  });
  it('preserves a server-validated consent destination on failed identity login', async () => {
    const returnTo =
      '/oauth/consent?request_id=12345678-1234-1234-1234-123456789012';
    const error = Object.assign(new Error('identity_not_linked'), {
      identityPurpose: 'login',
      identityReturnTo: returnTo,
    });
    const controller = new IdentityController(
        { callback: jest.fn().mockRejectedValue(error) } as any,
        config as any,
      ),
      res = response();
    await controller.callback(
      { id: 'workspace' } as any,
      {
        raw: { url: '/api/identity/callback?state=s&code=c' },
        cookies: {},
      } as any,
      res,
    );
    const destination = new URL(
      res.redirect.mock.calls[0][0],
      'https://book.test',
    );
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('redirect')).toBe(returnTo);
    expect(destination.searchParams.get('identity_error')).toBe(
      'identity_not_linked',
    );
  });
  it('does not carry arbitrary callback returnTo on unverified failures', async () => {
    const controller = new IdentityController(
        {
          callback: jest
            .fn()
            .mockRejectedValue(new Error('invalid_transaction')),
        } as any,
        config as any,
      ),
      res = response();
    await controller.callback(
      { id: 'workspace' } as any,
      {
        raw: { url: '/api/identity/callback?returnTo=https://evil.test' },
        cookies: {},
      } as any,
      res,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      '/login?identity_error=invalid_transaction',
    );
  });
});
