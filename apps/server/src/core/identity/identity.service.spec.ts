jest.mock('@docmost/db/repos/user/user.repo', () => ({ UserRepo: class {} }));
jest.mock('../session/session.service', () => ({ SessionService: class {} }));
jest.mock('../../common/helpers', () => ({
  comparePasswordHash: jest.fn(),
  isUserDisabled: () => false,
}));
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { identityHash } from './identity.security';

describe('Identity browser bootstrap', () => {
  const workspace = { id: 'workspace' } as any;
  const browser = 'a'.repeat(43),
    credential = 'dms_' + 'b'.repeat(43);
  function fixture() {
    const repository = {
      hasHandle: jest.fn(),
      registerHandle: jest.fn(),
      cancelBrowser: jest.fn(),
    };
    const sessions = { authenticateBrowserCredential: jest.fn() };
    const service = new IdentityService(
      { enabled: () => true, get: () => ({}) } as any,
      {} as any,
      repository as any,
      {} as any,
      sessions as any,
      {} as any,
    );
    return { service, repository, sessions };
  }
  it('preserves a valid local session without overwriting the browser credential', async () => {
    const { service, repository, sessions } = fixture();
    sessions.authenticateBrowserCredential.mockResolvedValue({
      user: { id: 'user' },
    });
    expect(await service.bootstrap(workspace, browser, credential)).toEqual({
      ready: true,
      authenticated: true,
    });
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalledWith(
      credential,
      workspace.id,
      { checkIdentity: false },
    );
    expect(repository.registerHandle).not.toHaveBeenCalled();
  });
  it('idempotently reuses only a registered pending handle', async () => {
    const { service, repository, sessions } = fixture();
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new UnauthorizedException('pending'),
    );
    repository.hasHandle.mockResolvedValue(true);
    expect(await service.bootstrap(workspace, browser, credential)).toEqual({
      ready: true,
    });
    expect(repository.registerHandle).not.toHaveBeenCalled();
    expect(repository.cancelBrowser).not.toHaveBeenCalled();
  });
  it('revokes an inactive local handle and registers fresh random credentials', async () => {
    const { service, repository, sessions } = fixture();
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new UnauthorizedException('expired'),
    );
    repository.hasHandle.mockResolvedValue(false);
    const result = await service.bootstrap(workspace, browser, credential);
    expect(repository.cancelBrowser).toHaveBeenCalledWith(
      identityHash(browser),
    );
    expect(result.token).toMatch(/^dms_[A-Za-z0-9_-]{43}$/);
    expect(result.token).not.toBe(credential);
    expect(result.binding).not.toBe(browser);
    expect(repository.registerHandle).toHaveBeenCalledWith(
      identityHash(result.token!),
      identityHash(result.binding!),
    );
    expect(result.authenticated).not.toBe(true);
  });
  it('does not revoke a valid local session when the center is unavailable', async () => {
    const { service, repository, sessions } = fixture();
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new ServiceUnavailableException('identity_unavailable'),
    );
    await expect(
      service.bootstrap(workspace, browser, credential),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.cancelBrowser).not.toHaveBeenCalled();
    expect(repository.registerHandle).not.toHaveBeenCalled();
  });
});

describe('Identity account switch', () => {
  it('binds the fresh-auth requirement to the server transaction', async () => {
    const key = Buffer.alloc(32, 9);
    const provider = {
      reauthenticationParameters: jest.fn().mockResolvedValue({prompt: 'login', max_age: '0'}),
      create: jest.fn().mockImplementation(async (_query, expiresAt) => ({url: 'https://center.test/login', expiresAt})),
    };
    const repository = {hasHandle: jest.fn().mockResolvedValue(true), create: jest.fn()};
    const service = new IdentityService({enabled: () => true, get: () => ({issuer: 'https://center.test', clientId: 'book', callback: 'https://book.test/api/identity/callback', encryptionKey: key})} as any, provider as any, repository as any, {} as any, {} as any, {} as any);
    const before = Date.now();
    await service.start({id:'workspace'} as any, 'a'.repeat(43), '/home', undefined, 'dms_' + 'b'.repeat(43), true);
    const query = provider.create.mock.calls[0][0] as URLSearchParams;
    expect(query.get('prompt')).toBe('login');
    expect(query.get('max_age')).toBe('0');
    expect(query.get('code_challenge_method')).toBe('S256');
    const {openIdentity} = await import('./identity.security');
    const saved = openIdentity<{reauthenticationStartedAt:number}>(repository.create.mock.calls[0][0].sealedParameters, key);
    expect(saved.reauthenticationStartedAt).toBeGreaterThanOrEqual(before);
    expect(saved.reauthenticationStartedAt).toBeLessThanOrEqual(Date.now());
  });
});
