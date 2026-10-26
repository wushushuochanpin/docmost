import { JwtAuthGuard } from './jwt-auth.guard';

describe('opaque browser session guard', () => {
  const token = `dms_${'a'.repeat(43)}`;
  const actor = { user: { id: 'u' }, workspace: { id: 'w' }, sessionId: 's' };
  function harness(origin = 'https://book.example', method = 'POST') {
    const request = {
      cookies: { authToken: token },
      raw: { workspaceId: 'w', sessionId: undefined },
      protocol: 'https',
      method,
      headers: { origin, host: 'book.example' },
      user: undefined,
    };
    const sessions = {
      authenticateBrowserCredential: jest.fn(async () => actor),
    };
    const guard = new JwtAuthGuard(
      { getAllAndOverride: () => false } as any,
      { isCloud: () => false } as any,
      sessions as any,
    );
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
    return { guard, context, request, sessions };
  }
  it('authenticates an opaque cookie and populates the existing request actor contract', async () => {
    const { guard, context, request, sessions } = harness();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(actor);
    expect(request.raw.sessionId).toBe('s');
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalledWith(
      token,
      'w',
    );
  });
  it.each(['https://attacker.example', 'http://book.example', 'null', ''])(
    'refuses unsafe POST origin %s before session access',
    async (origin) => {
      const { guard, context, sessions } = harness(origin);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Same-origin request required',
      );
      expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
    },
  );
});
