import { WsGateway } from './ws.gateway';

describe('Socket.IO session authentication', () => {
  function harness(origin = 'https://book.example') {
    const sessions = {
      authenticateBrowserCredential: jest.fn(async () => ({
        user: { id: 'u' },
        workspace: { id: 'w' },
        sessionId: 's',
      })),
      assertActiveSession: jest.fn(async () => undefined),
    };
    const connections = { register: jest.fn(), unregister: jest.fn() };
    const editor = { registerClient: jest.fn(async () => undefined) };
    const gateway = new WsGateway(
      sessions as any,
      connections as any,
      { getUserSpaceIds: async () => [] } as any,
      {} as any,
      editor as any,
    );
    const client = {
      handshake: {
        secure: true,
        headers: { cookie: 'authToken=dms_test', origin, host: 'book.example' },
      },
      connected: true,
      data: {} as any,
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      broadcast: { to: jest.fn() },
    } as any;
    return { gateway, client, sessions, connections, editor };
  }
  it('uses the same browser session verifier and registers authenticated sockets for revocation', async () => {
    const { gateway, client, sessions, connections } = harness();
    await gateway.handleConnection(client);
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalledWith(
      'dms_test',
    );
    expect(client.data.sessionId).toBe('s');
    connections.register.mock.calls[0][2]();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
  it('rejects a cross-origin cookie handshake', async () => {
    const { gateway, client, sessions } = harness('https://evil.example');
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
  });
  it('accepts same-origin polling GETs without an Origin header', async () => {
    const { gateway, client, sessions, connections } = harness();
    delete client.handshake.headers.origin;
    client.handshake.headers['sec-fetch-site'] = 'same-origin';
    await gateway.handleConnection(client);
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalledWith(
      'dms_test',
    );
    expect(connections.register).toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });
  it.each(['cross-site', 'same-site', 'none', undefined])(
    'rejects missing Origin with fetch-site %s',
    async (fetchSite) => {
      const { gateway, client, sessions } = harness();
      delete client.handshake.headers.origin;
      client.handshake.headers['sec-fetch-site'] = fetchSite;
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
    },
  );
  it('rejects a different protocol even when the host matches', async () => {
    const { gateway, client, sessions } = harness('http://book.example');
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
  });
  it('accepts the configured proxy protocol for TLS-terminated connections', async () => {
    const { gateway, client, sessions } = harness();
    client.handshake.secure = false;
    client.handshake.headers['x-forwarded-proto'] = 'https';
    await gateway.handleConnection(client);
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });
  it('does not let Fetch Metadata override an explicit foreign Origin', async () => {
    const { gateway, client, sessions } = harness('https://evil.example');
    client.handshake.headers['sec-fetch-site'] = 'same-origin';
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
  });
  it('waits for asynchronous handshake authentication before processing an immediate client message', async () => {
    const { gateway, client, sessions, editor } = harness();
    let finishAuthentication!: (actor: any) => void;
    sessions.authenticateBrowserCredential.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAuthentication = resolve;
        }),
    );
    const connecting = gateway.handleConnection(client);
    const message = gateway.handleMessage(client, {
      operation: 'editorSession.registerClient',
      clientId: 'client',
    });
    await Promise.resolve();
    const checkedBeforeAuthentication =
      sessions.assertActiveSession.mock.calls.length;
    finishAuthentication({
      user: { id: 'u' },
      workspace: { id: 'w' },
      sessionId: 's',
    });
    await Promise.all([connecting, message]);
    expect(checkedBeforeAuthentication).toBe(0);
    expect(sessions.assertActiveSession).toHaveBeenCalledWith('s', 'u', 'w');
    expect(editor.registerClient).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's', userId: 'u' }),
    );
    expect(client.emit).not.toHaveBeenCalledWith('Unauthorized');
    expect(client.disconnect).not.toHaveBeenCalled();
  });
  it('drops queued messages when delayed authentication fails', async () => {
    const { gateway, client, sessions, editor } = harness();
    let rejectAuthentication!: (error: Error) => void;
    sessions.authenticateBrowserCredential.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectAuthentication = reject;
        }),
    );
    const connecting = gateway.handleConnection(client);
    const message = gateway.handleMessage(client, {
      operation: 'editorSession.registerClient',
      clientId: 'client',
    });
    rejectAuthentication(new Error('revoked'));
    await Promise.all([connecting, message]);
    expect(sessions.assertActiveSession).not.toHaveBeenCalled();
    expect(editor.registerClient).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledTimes(1);
    expect(client.emit).toHaveBeenCalledWith('Unauthorized');
  });
  it('does not register a socket when it disconnects during authentication', async () => {
    const { gateway, client, sessions, connections } = harness();
    let finishAuthentication!: (actor: any) => void;
    sessions.authenticateBrowserCredential.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAuthentication = resolve;
        }),
    );
    const connecting = gateway.handleConnection(client);
    client.connected = false;
    await gateway.handleDisconnect(client);
    finishAuthentication({
      user: { id: 'u' },
      workspace: { id: 'w' },
      sessionId: 's',
    });
    await connecting;
    expect(connections.register).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });
  it('rejects messages after session revocation before broadcasting any data', async () => {
    const { gateway, client, sessions } = harness();
    await gateway.handleConnection(client);
    sessions.assertActiveSession.mockImplementation(async () => {
      throw new Error('revoked');
    });
    client.data = { sessionId: 's', userId: 'u', workspaceId: 'w' };
    await gateway.handleMessage(client, { operation: 'arbitrary' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.broadcast.to).not.toHaveBeenCalled();
  });
});
