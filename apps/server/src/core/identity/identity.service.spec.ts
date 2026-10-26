jest.mock('@docmost/db/repos/user/user.repo', () => ({ UserRepo: class {} }));
jest.mock('../session/session.service', () => ({ SessionService: class {} }));
jest.mock('../../common/helpers', () => ({
  comparePasswordHash: jest.fn(),
  isUserDisabled: () => false,
}));
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
    );
    expect(repository.registerHandle).not.toHaveBeenCalled();
  });
  it('idempotently reuses only a registered pending handle', async () => {
    const { service, repository, sessions } = fixture();
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new Error('pending'),
    );
    repository.hasHandle.mockResolvedValue(true);
    expect(await service.bootstrap(workspace, browser, credential)).toEqual({
      ready: true,
    });
    expect(repository.registerHandle).not.toHaveBeenCalled();
    expect(repository.cancelBrowser).not.toHaveBeenCalled();
  });
  it('revokes an inactive center handle and registers fresh random credentials', async () => {
    const { service, repository, sessions } = fixture();
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new Error('identity_unavailable'),
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
});
