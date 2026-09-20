import { EditorSessionConflictException } from './editor-session.errors';
import {
  EDITOR_SESSION_COLLAB_CLOSE_CODE,
  EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS,
} from './editor-session.constants';

describe('EditorSessionConflictException close-code contract', () => {
  it('carries the numeric WS close code @hocuspocus/server uses to close collab connections', () => {
    const err = new EditorSessionConflictException();
    expect(err.code).toBe(EDITOR_SESSION_COLLAB_CLOSE_CODE);
    expect(typeof err.code).toBe('number');
  });

  it('keeps the HTTP 409 response shape used by the REST API', () => {
    const err = new EditorSessionConflictException('Editor session is not active');
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toEqual({
      code: 'EDITOR_SESSION_CONFLICT',
      message: 'Editor session is not active',
    });
  });
});

describe('Editor-session heartbeat timeout', () => {
  it('is comfortably above the browser background-tab timer throttle (~60s)', () => {
    // Regression for the "实时协作重连中，当前为本地编辑" reconnect loop:
    // a backgrounded tab has its setInterval throttled to ~1/min, which exceeded
    // the old 45s timeout -> lease expiry -> heartbeat 409 -> reacquire churn.
    expect(EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS).toBeGreaterThan(60_000);
    // Must stay below the Redis lease TTL so expiry semantics stay consistent.
    expect(EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS).toBeLessThanOrEqual(
      5 * 60 * 1000,
    );
  });
});
