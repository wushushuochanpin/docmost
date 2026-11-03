import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';

// Two sweep intervals: one failed verification can be a center/timeout blip,
// but protected streams must not remain open indefinitely without an answer.
export const SESSION_VERIFICATION_GRACE_MS = 10_000;

export type SessionCloseReason = 'revoked' | 'unavailable';

type Connection = {
  sessionId: string;
  close: (reason: SessionCloseReason) => void;
  setPending?: (pending: boolean) => void;
  pending: boolean;
};

// The database is authoritative. This registry only owns connection cleanup.
// A five-second sweep also observes revocations committed by another instance.
@Injectable()
export class SessionConnectionsService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionConnectionsService.name);
  private readonly connections = new Map<object, Connection>();
  private readonly unavailableSince = new Map<string, number>();
  private sweeping = false;
  private identityVerifier?: (sessionId: string) => Promise<void>;

  // Exposed for deterministic tests; production always uses the bounded default.
  readonly verificationGraceMs = SESSION_VERIFICATION_GRACE_MS;

  setIdentityVerifier(verifier: (sessionId: string) => Promise<void>): void {
    this.identityVerifier = verifier;
  }

  constructor(private readonly sessions: UserSessionRepo) {}

  register(
    key: object,
    sessionId: string,
    close: (reason: SessionCloseReason) => void,
    setPending?: (pending: boolean) => void,
  ): void {
    this.connections.set(key, { sessionId, close, setPending, pending: false });
  }

  closeSession(sessionId: string): void {
    for (const [key, value] of this.connections) {
      if (value.sessionId === sessionId)
        this.close(key, value.close, 'revoked');
    }
  }

  unregister(key: object): void {
    const sessionId = this.connections.get(key)?.sessionId;
    this.connections.delete(key);
    if (sessionId) this.pruneSession(sessionId);
  }

  @Interval('session-connection-revocation', 5000)
  async sweep(): Promise<void> {
    if (this.sweeping || !this.connections.size) return;
    this.sweeping = true;
    const snapshot = [...this.connections.entries()];
    const closeReasons = new Map<string, SessionCloseReason>();
    try {
      const ids = [...new Set(snapshot.map(([, value]) => value.sessionId))];
      const active = new Set<string>();
      for (let offset = 0; offset < ids.length; offset += 500) {
        for (const id of await this.sessions.findActiveSessionIds(
          ids.slice(offset, offset + 500),
        ))
          active.add(id);
      }
      const remaining = [...active];
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(8, remaining.length) }, async () => {
          while (cursor < remaining.length) {
            const id = remaining[cursor++];
            try {
              if (!this.identityVerifier)
                throw new ServiceUnavailableException('identity_unavailable');
              await this.identityVerifier(id);
              this.unavailableSince.delete(id);
              this.setSessionPending(id, false);
            } catch (error) {
              if (this.isDefinitiveRevocation(error)) {
                active.delete(id);
                closeReasons.set(id, 'revoked');
                this.unavailableSince.delete(id);
                continue;
              }
              const since = this.unavailableSince.get(id) ?? Date.now();
              this.unavailableSince.set(id, since);
              // Stop writes immediately while authorization is unconfirmed,
              // but keep the connection long enough for a short blip to heal.
              this.setSessionPending(id, true);
              if (Date.now() - since >= this.verificationGraceMs) {
                active.delete(id);
                closeReasons.set(id, 'unavailable');
                this.unavailableSince.delete(id);
                this.logger.warn(
                  `Identity verification unavailable for ${this.verificationGraceMs}ms; closing protected connection`,
                );
              } else {
                this.logger.debug(
                  'Identity verification unavailable; keeping connection during bounded grace',
                );
              }
            }
          }
        }),
      );
      for (const [key, value] of snapshot) {
        if (!active.has(value.sessionId) && this.connections.get(key) === value)
          this.close(
            key,
            value.close,
            closeReasons.get(value.sessionId) ?? 'revoked',
          );
      }
    } catch {
      // Loss of authoritative session state must not leave protected streams
      // open. The reason is "unavailable", not "revoked", so clients retry
      // instead of telling the user that the account changed.
      for (const [key, value] of snapshot) {
        if (this.connections.get(key) === value)
          this.close(key, value.close, 'unavailable');
      }
      this.logger.warn(
        'Session verification unavailable; protected connections closed',
      );
    } finally {
      this.sweeping = false;
    }
  }

  /** Only a parsed 401 from the center/local session check is definitive. */
  private isDefinitiveRevocation(error: unknown): boolean {
    if (error instanceof UnauthorizedException) return true;
    const getStatus = (error as { getStatus?: () => number })?.getStatus;
    return typeof getStatus === 'function' && getStatus.call(error) === 401;
  }

  private setSessionPending(sessionId: string, pending: boolean): void {
    for (const value of this.connections.values()) {
      if (value.sessionId !== sessionId || value.pending === pending) continue;
      value.pending = pending;
      try {
        value.setPending?.(pending);
      } catch {
        this.logger.warn('Session verification state update failed');
      }
    }
  }

  private pruneSession(sessionId: string): void {
    for (const value of this.connections.values()) {
      if (value.sessionId === sessionId) return;
    }
    this.unavailableSince.delete(sessionId);
  }

  private close(
    key: object,
    close: (reason: SessionCloseReason) => void,
    reason: SessionCloseReason,
  ): void {
    this.connections.delete(key);
    try {
      close(reason);
    } catch {
      this.logger.warn('Session connection cleanup failed');
    }
  }

  onModuleDestroy(): void {
    for (const [key, value] of this.connections)
      this.close(key, value.close, 'unavailable');
  }
}
