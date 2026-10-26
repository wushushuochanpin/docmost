import {
  SessionService,
  isOpaqueSessionToken,
  IdentitySessionMetadata,
} from './session.service';
import { createHash } from 'node:crypto';

describe('browser sessions', () => {
  const user = { id: 'user', workspaceId: 'workspace' } as any;
  const identity: IdentitySessionMetadata = {
    issuer: 'https://identity.example',
    subject: 'subject',
    clientId: 'docmost',
    encryptedAccessToken: 'encrypted',
    expiresAt: Date.now() + 60_000,
  };
  let service: SessionService;
  let repo: any;
  let tokens: any;
  let connections: any;
  beforeEach(() => {
    repo = {
      findActiveSessionIds: jest.fn(async () => ['session']),
      insertSession: jest.fn(async (row) => ({ ...row, id: 'session' })),
      findActiveById: jest.fn(async () => ({
        id: 'session',
        userId: 'user',
        workspaceId: 'workspace',
        metadata: null,
      })),
      findActiveByCredentialHash: jest.fn(async () => ({
        id: 'session',
        userId: 'user',
        workspaceId: 'workspace',
      })),
      revokeById: jest.fn(),
      revokeIdentitySessions: jest.fn(),
    };
    tokens = { verifyJwt: jest.fn() };
    connections = {
      setIdentityVerifier: jest.fn(),
      sweep: jest.fn(),
      closeSession: jest.fn(),
    };
    service = new SessionService(
      tokens,
      repo,
      { getCookieExpiresIn: () => new Date(Date.now() + 86400000) } as any,
      { get: () => null } as any,
      { findById: async () => user } as any,
      { findById: async () => ({ id: 'workspace' }) } as any,
      connections,
      { trackActivity: jest.fn() } as any,
    );
  });
  it('issues distinct opaque credentials, stores only hashes and caps identity session lifetime', async () => {
    const first = await service.createOpaqueSession(user, identity);
    const second = await service.createOpaqueSession(user, identity);
    expect(isOpaqueSessionToken(first.token)).toBe(true);
    expect(second.token).not.toBe(first.token);
    expect(+first.expiresAt).toBe(identity.expiresAt);
    const row = repo.insertSession.mock.calls[0][0];
    expect(row.credentialHash).toBe(
      createHash('sha256').update(first.token).digest('hex'),
    );
    expect(JSON.stringify(row)).not.toContain(first.token);
  });
  it('activates only a server-registered pending credential inside the caller transaction', async () => {
    const executeQuery = jest.fn(async () => ({ rows: [] as unknown[] }));
    const trx = {
      getExecutor: () => ({
        transformQuery: (node: unknown) => node,
        compileQuery: (node: unknown) => node,
        executeQuery,
      }),
    } as any;
    const hash = 'a'.repeat(64);
    await expect(
      service.activatePendingIdentitySession(user, identity, hash, trx),
    ).rejects.toThrow('Invalid pending session');
    expect(repo.insertSession).not.toHaveBeenCalled();
    executeQuery.mockResolvedValue({ rows: [{ credentialHash: hash }] });
    await expect(
      service.activatePendingIdentitySession(user, identity, hash, trx),
    ).resolves.toMatchObject({ sessionId: 'session' });
    expect(repo.insertSession).toHaveBeenCalledWith(
      expect.objectContaining({ credentialHash: hash }),
      trx,
    );
    await expect(
      service.activatePendingIdentitySession(
        user,
        identity,
        'caller-selected-token',
        trx,
      ),
    ).rejects.toThrow();
    expect(repo.insertSession).toHaveBeenCalledTimes(1);
  });

  it('rejects missing, expired and cross-workspace sessions before accepting the actor', async () => {
    const { token } = await service.createOpaqueSession(user);
    await expect(
      service.authenticateBrowserCredential(token, 'another'),
    ).rejects.toThrow();
    repo.findActiveById.mockResolvedValue(undefined);
    await expect(
      service.authenticateBrowserCredential(token),
    ).rejects.toThrow();
    await expect(
      service.createOpaqueSession(user, {
        ...identity,
        expiresAt: Date.now() - 1,
      }),
    ).rejects.toThrow();
    expect(repo.insertSession).toHaveBeenCalledTimes(1);
  });
  it('fails closed for identity sessions without a verifier or when the center rejects them', async () => {
    repo.findActiveById.mockResolvedValue({
      id: 'session',
      userId: 'user',
      workspaceId: 'workspace',
      metadata: { identity },
    });
    const { token } = await service.createOpaqueSession(user, identity);
    await expect(
      service.authenticateBrowserCredential(token),
    ).rejects.toThrow();
    const verify = jest.fn<Promise<void>, [IdentitySessionMetadata]>(
      async () => {
        throw new Error('center unavailable');
      },
    );
    service.registerIdentityVerifier(verify);
    await expect(service.authenticateBrowserCredential(token)).rejects.toThrow(
      'center unavailable',
    );
    await expect(
      service.authenticateBrowserCredential(token, undefined, {
        checkIdentity: false,
      }),
    ).resolves.toMatchObject({ sessionId: 'session' });
    verify.mockImplementation(async () => undefined);
    await expect(
      service.authenticateBrowserCredential(token),
    ).resolves.toMatchObject({ sessionId: 'session', user });
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it('does not accept a session revoked while remote identity verification was in flight', async () => {
    const { token } = await service.createOpaqueSession(user, identity);
    repo.findActiveById.mockResolvedValue({
      id: 'session',
      userId: 'user',
      workspaceId: 'workspace',
      metadata: { identity },
    });
    service.registerIdentityVerifier(async () => {
      repo.findActiveSessionIds.mockResolvedValue([]);
    });
    await expect(
      service.authenticateBrowserCredential(token),
    ).rejects.toThrow();
  });

  it('keeps tracked local JWT compatibility but rejects untracked legacy credentials', async () => {
    tokens.verifyJwt.mockResolvedValue({
      sub: 'user',
      workspaceId: 'workspace',
      sessionId: 'session',
    });
    await expect(
      service.authenticateBrowserCredential('legacy-jwt'),
    ).resolves.toMatchObject({ sessionId: 'session' });
    tokens.verifyJwt.mockResolvedValue({
      sub: 'user',
      workspaceId: 'workspace',
    });
    await expect(
      service.authenticateBrowserCredential('untracked-jwt'),
    ).rejects.toThrow();
  });
  it('does not disconnect another user when a scoped revoke changes no row', async () => {
    repo.revokeById.mockResolvedValue(false);
    await service.revokeSession('foreign-session', 'user', 'workspace');
    expect(connections.closeSession).not.toHaveBeenCalled();
    repo.revokeById.mockResolvedValue(true);
    await service.revokeSession('session', 'user', 'workspace');
    expect(connections.closeSession).toHaveBeenCalledWith('session');
  });

  it('rejects account/session mismatches and never revokes an entire issuer accidentally', async () => {
    repo.findActiveById.mockResolvedValue({
      userId: 'other',
      workspaceId: 'workspace',
    });
    await expect(
      service.assertActiveSession('session', 'user', 'workspace'),
    ).rejects.toThrow();
    await expect(
      service.revokeIdentitySessions({ issuer: identity.issuer }),
    ).rejects.toThrow();
    expect(repo.revokeIdentitySessions).not.toHaveBeenCalled();
    await service.revokeIdentitySessions({
      issuer: identity.issuer,
      subject: identity.subject,
    });
    expect(connections.sweep).toHaveBeenCalledTimes(1);
  });
});
