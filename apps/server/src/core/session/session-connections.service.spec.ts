import { UnauthorizedException } from '@nestjs/common';
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
    expect(reader).toHaveBeenCalledWith('revoked');
    expect(writer).toHaveBeenCalledWith('revoked');
    expect(unaffected).not.toHaveBeenCalled();
    await registry.sweep();
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it('closes streams on authoritative DB failure with a retryable reason and continues cleanup if one close callback fails', async () => {
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
    expect(second).toHaveBeenCalledWith('unavailable');
  });
  it('closes center-revoked sessions and never re-registers a disconnected socket after an async sweep', async () => {
    const registry = new SessionConnectionsService({
      findActiveSessionIds: async () => ['a', 'b'],
    } as any);
    registry.setIdentityVerifier(async (id) => {
      if (id === 'a') throw new UnauthorizedException('center rejected');
    });
    const revoked = jest.fn(),
      active = jest.fn();
    const key = {};
    registry.register({}, 'a', revoked);
    registry.register(key, 'b', active);
    registry.unregister(key);
    await registry.sweep();
    expect(revoked).toHaveBeenCalledWith('revoked');
    expect(active).not.toHaveBeenCalled();
  });
  it('keeps a session through one transient verification failure and recovers on the next sweep', async () => {
    const registry = new SessionConnectionsService({
      findActiveSessionIds: async () => ['a'],
    } as any);
    const verify = jest
      .fn()
      .mockRejectedValueOnce(new Error('center timeout'))
      .mockResolvedValue(undefined);
    registry.setIdentityVerifier(verify);
    const close = jest.fn();
    const setPending = jest.fn();
    registry.register({}, 'a', close, setPending);
    await registry.sweep();
    expect(close).not.toHaveBeenCalled();
    expect(setPending).toHaveBeenLastCalledWith(true);
    await registry.sweep();
    expect(close).not.toHaveBeenCalled();
    expect(setPending).toHaveBeenLastCalledWith(false);
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it('closes a session only after the bounded grace when the center stays unavailable', async () => {
    let now = 1_000_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const registry = new SessionConnectionsService({
        findActiveSessionIds: async () => ['a'],
      } as any);
      registry.setIdentityVerifier(async () => {
        throw new Error('center timeout');
      });
      const close = jest.fn();
      registry.register({}, 'a', close);
      await registry.sweep();
      expect(close).not.toHaveBeenCalled();
      now += registry.verificationGraceMs - 1;
      await registry.sweep();
      expect(close).not.toHaveBeenCalled();
      now += 1;
      await registry.sweep();
      expect(close).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledWith('unavailable');
    } finally {
      clock.mockRestore();
    }
  });
  it('treats a missing identity verifier as unavailable, not as a revocation', async () => {
    const registry = new SessionConnectionsService({
      findActiveSessionIds: async () => ['a'],
    } as any);
    (registry as any).verificationGraceMs = 0;
    const close = jest.fn();
    registry.register({}, 'a', close);
    await registry.sweep();
    expect(close).toHaveBeenCalledWith('unavailable');
  });
});
