import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('logout during identity login or provider outage', () => {
  const actor = {
    user: { id: 'user', workspaceId: 'workspace' },
    workspace: { id: 'workspace' },
    sessionId: 'session',
  };
  const make = () => {
    const sessions = {
      authenticateBrowserCredential: jest.fn().mockResolvedValue(actor),
      revokeSession: jest.fn(),
    };
    const identity = { cancelBrowserTransactions: jest.fn() };
    const audit = { logWithContext: jest.fn() };
    const controller = new AuthController(
      {} as any,
      sessions as any,
      {} as any,
      {} as any,
      audit as any,
      identity as any,
    );
    const req = {
      protocol: 'https',
      headers: { host: 'book.example', origin: 'https://book.example' },
      cookies: { authToken: 'credential', identityBrowser: 'binding' },
      raw: { workspaceId: 'workspace' },
    };
    const res = { clearCookie: jest.fn() };
    return { controller, sessions, identity, audit, req, res };
  };

  it('revokes locally without a network identity check and clears login binding', async () => {
    const { controller, sessions, identity, req, res } = make();
    await controller.logout(req as any, res as any);
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalledWith(
      'credential',
      'workspace',
      { checkIdentity: false },
    );
    expect(sessions.revokeSession).toHaveBeenCalledWith(
      'session',
      'user',
      'workspace',
    );
    expect(identity.cancelBrowserTransactions).toHaveBeenCalledWith('binding');
    expect(res.clearCookie).toHaveBeenCalledWith('authToken', {
      path: '/',
      sameSite: 'lax',
    });
  });

  it('cancels a pending login even without an authenticated session', async () => {
    const { controller, sessions, identity, req, res } = make();
    req.cookies.authToken = '';
    await controller.logout(req as any, res as any);
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
    expect(identity.cancelBrowserTransactions).toHaveBeenCalledWith('binding');
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('closes and audits the identity session before cancelling its browser handle', async () => {
    const { controller, sessions, identity, audit, req, res } = make();
    identity.cancelBrowserTransactions.mockImplementation(async () => {
      sessions.authenticateBrowserCredential.mockRejectedValue(
        new UnauthorizedException(),
      );
    });
    await controller.logout(req as any, res as any);
    expect(sessions.revokeSession).toHaveBeenCalledWith(
      'session',
      'user',
      'workspace',
    );
    expect(sessions.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(
      identity.cancelBrowserTransactions.mock.invocationCallOrder[0],
    );
    expect(audit.logWithContext).toHaveBeenCalled();
  });

  it('clears a revoked/expired session while cancelling outstanding callbacks', async () => {
    const { controller, sessions, identity, req, res } = make();
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new UnauthorizedException(),
    );
    await controller.logout(req as any, res as any);
    expect(identity.cancelBrowserTransactions).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('rejects a cross-origin logout before mutating state', async () => {
    const { controller, identity, req, res } = make();
    req.headers.origin = 'https://attacker.example';
    await expect(
      controller.logout(req as any, res as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(identity.cancelBrowserTransactions).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('does not report successful logout if authoritative state is unavailable', async () => {
    const { controller, identity, req, res } = make();
    identity.cancelBrowserTransactions.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(controller.logout(req as any, res as any)).rejects.toThrow(
      'database unavailable',
    );
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
