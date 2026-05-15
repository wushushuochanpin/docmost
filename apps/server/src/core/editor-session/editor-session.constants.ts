export const EDITOR_SESSION_REDIS_PREFIX = 'editor_session';
export const EDITOR_SESSION_LEGACY_SESSION_ID = 'legacy-session';

export const EDITOR_SESSION_STATE_TTL_MS = 5 * 60 * 1000;
export const EDITOR_SESSION_SOCKET_TTL_MS = 24 * 60 * 60 * 1000;
export const EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS = 45 * 1000;
export const EDITOR_SESSION_TAKEOVER_GRACE_MS = 8 * 1000;

export const EDITOR_SESSION_TAKEOVER_REQUESTED_EVENT =
  'editor-session.takeover-requested';
export const EDITOR_SESSION_GRANTED_EVENT = 'editor-session.granted';
export const EDITOR_SESSION_REVOKED_EVENT = 'editor-session.revoked';
