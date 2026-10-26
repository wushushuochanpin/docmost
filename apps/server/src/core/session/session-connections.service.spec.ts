import { SessionConnectionsService } from './session-connections.service';

describe('session connection cleanup', () => {
  it('closes all revoked-session connections, including idle readers, and preserves another session', async () => {
    const repo = { findActiveSessionIds: jest.fn(async () => ['active']) };
    const registry = new SessionConnectionsService(repo as any);
    registry.setIdentityVerifier(async () => undefined);
    const reader = jest.fn(),
      writer = jest.fn(),
      unaffected = jest.fn();
    registry.register({}, 'revoked', reader);
    registry.register({}, 'revoked', writer);
    registry.register({}, 'active', unaffected);
    await registry.sweep();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(unaffected).not.toHaveBeenCalled();
    await registry.sweep();
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it('closes streams on authoritative DB failure and continues cleanup if one close callback fails', async () => {
    const registry = new SessionConnectionsService({
      findActiveSessionIds: async () => {
        throw new Error('offline');
      },
    } as any);
    const second = jest.fn();
    registry.register({}, 'a', () => {
      throw new Error('socket error');
    });
    registry.register({}, 'b', second);
    await registry.sweep();
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('closes center-revoked sessions and never re-registers a disconnected socket after an async sweep', async () => {
    const registry = new SessionConnectionsService({
      findActiveSessionIds: async () => ['a', 'b'],
    } as any);
    registry.setIdentityVerifier(async (id) => {
      if (id === 'a') throw new Error('center rejected');
    });
    const revoked = jest.fn(),
      active = jest.fn();
    const key = {};
    registry.register({}, 'a', revoked);
    registry.register(key, 'b', active);
    registry.unregister(key);
    await registry.sweep();
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(active).not.toHaveBeenCalled();
  });
});
