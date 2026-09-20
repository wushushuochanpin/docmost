export const EDITOR_SESSION_REDIS_PREFIX = 'editor_session';
export const EDITOR_SESSION_LEGACY_SESSION_ID = 'legacy-session';

export const EDITOR_SESSION_STATE_TTL_MS = 5 * 60 * 1000;
export const EDITOR_SESSION_SOCKET_TTL_MS = 24 * 60 * 60 * 1000;
// Must stay comfortably above the browser's background-tab timer throttle
// (~1/min after 5min hidden). 45s caused lease expiry -> collab reconnect loops
// for backgrounded editor tabs (see bug: "实时协作重连中，当前为本地编辑").
export const EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS = 120 * 1000;
export const EDITOR_SESSION_TAKEOVER_GRACE_MS = 8 * 1000;
// WS close code used by the collab server when an editor-session conflict kills
// a connection (hocuspocus closes with the thrown error's numeric `code`).
// Keep in sync with the client constant EDITOR_SESSION_CONFLICT_CLOSE_CODE.
export const EDITOR_SESSION_COLLAB_CLOSE_CODE = 4409;

export const EDITOR_SESSION_TAKEOVER_REQUESTED_EVENT =
  'editor-session.takeover-requested';
export const EDITOR_SESSION_GRANTED_EVENT = 'editor-session.granted';
export const EDITOR_SESSION_REVOKED_EVENT = 'editor-session.revoked';
