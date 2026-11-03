import { AuthenticationExtension } from './authentication.extension';

describe('collaboration session boundary', () => {
  function harness() {
    const sessions = { assertActiveSession: jest.fn(async () => undefined) };
    const leases = {
      validateCollabConnection: jest.fn(),
      release: jest.fn(async () => undefined),
    };
    const registry = { register: jest.fn(), unregister: jest.fn() };
    const extension = new AuthenticationExtension(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      leases as any,
      {} as any,
      sessions as any,
      registry as any,
    );
    return { extension, sessions, leases, registry };
  }
  it('checks revoked sessions before the read-only early return', async () => {
    const { extension, sessions, leases } = harness();
    sessions.assertActiveSession.mockImplementation(async () => {
      throw new Error('revoked');
    });
    await expect(
      extension.beforeHandleMessage({
        connection: { readOnly: true },
        context: { sessionId: 's', user: { id: 'u', workspaceId: 'w' } },
      } as any),
    ).rejects.toThrow('revoked');
    expect(leases.validateCollabConnection).not.toHaveBeenCalled();
  });
  it('binds connection cleanup to its session and releases its editor lease on revocation', async () => {
    const { extension, registry, leases } = harness();
    const connection = { close: jest.fn(), onClose: jest.fn() };
    const editSession = { sessionId: 's' };
    await extension.connected({
      connection,
      documentName: 'page.p',
      context: {
        sessionId: 's',
        user: { id: 'u', workspaceId: 'w' },
        editSession,
      },
    } as any);
    expect(registry.register.mock.calls[0][1]).toBe('s');
    registry.register.mock.calls[0][2]();
    expect(connection.close).toHaveBeenCalledWith({
      code: 4401,
      reason: 'Session ended',
    });
    expect(leases.release).toHaveBeenCalledWith(
      expect.objectContaining({ editSession, userId: 'u', workspaceId: 'w' }),
    );
    connection.onClose.mock.calls[0][0]();
    expect(registry.unregister).toHaveBeenCalledWith(connection);
  });
  it('uses a retryable close when authorization cannot be confirmed and releases the lease', async () => {
    const { extension, registry, leases } = harness();
    const connection = { close: jest.fn(), onClose: jest.fn() };
    const editSession = { sessionId: 's' };
    await extension.connected({
      connection,
      documentName: 'page.p',
      context: {
        sessionId: 's',
        user: { id: 'u', workspaceId: 'w' },
        editSession,
      },
    } as any);
    registry.register.mock.calls[0][2]('unavailable');
    expect(connection.close).toHaveBeenCalledWith({
      code: 1013,
      reason: 'Session verification unavailable',
    });
    expect(leases.release).toHaveBeenCalledWith(
      expect.objectContaining({ editSession, userId: 'u', workspaceId: 'w' }),
    );
  });
  it('suspends writes immediately while authorization is unconfirmed and restores them on recovery', async () => {
    const { extension, registry } = harness();
    const connection = {
      close: jest.fn(),
      onClose: jest.fn(),
      readOnly: false,
      sendStateless: jest.fn(),
    };
    await extension.connected({
      connection,
      documentName: 'page.p',
      context: {
        sessionId: 's',
        user: { id: 'u', workspaceId: 'w' },
      },
    } as any);
    const setPending = registry.register.mock.calls[0][3];
    setPending(true);
    expect(connection.readOnly).toBe(true);
    expect(connection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({ type: 'session_verification_pending' }),
    );
    setPending(false);
    expect(connection.readOnly).toBe(false);
    expect(connection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({ type: 'session_verification_recovered' }),
    );
  });
});
