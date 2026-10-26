import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';

// The database is authoritative. This registry only owns connection cleanup.
// A five-second sweep also observes revocations committed by another instance.
@Injectable()
export class SessionConnectionsService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionConnectionsService.name);
  private readonly connections = new Map<
    object,
    { sessionId: string; close: () => void }
  >();
  private sweeping = false;
  private identityVerifier?: (sessionId: string) => Promise<void>;

  setIdentityVerifier(verifier: (sessionId: string) => Promise<void>): void {
    this.identityVerifier = verifier;
  }

  constructor(private readonly sessions: UserSessionRepo) {}

  register(key: object, sessionId: string, close: () => void): void {
    this.connections.set(key, { sessionId, close });
  }

  closeSession(sessionId: string): void {
    for (const [key, value] of this.connections) {
      if (value.sessionId === sessionId) this.close(key, value.close);
    }
  }

  unregister(key: object): void {
    this.connections.delete(key);
  }

  @Interval('session-connection-revocation', 5000)
  async sweep(): Promise<void> {
    if (this.sweeping || !this.connections.size) return;
    this.sweeping = true;
    const snapshot = [...this.connections.entries()];
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
                throw new Error('Session verifier unavailable');
              await this.identityVerifier(id);
            } catch {
              active.delete(id);
            }
          }
        }),
      );
      for (const [key, value] of snapshot) {
        if (!active.has(value.sessionId) && this.connections.get(key) === value)
          this.close(key, value.close);
      }
    } catch {
      // Loss of authoritative session state must not leave protected streams open.
      for (const [key, value] of snapshot) {
        if (this.connections.get(key) === value) this.close(key, value.close);
      }
      this.logger.warn(
        'Session verification unavailable; protected connections closed',
      );
    } finally {
      this.sweeping = false;
    }
  }

  private close(key: object, close: () => void): void {
    this.connections.delete(key);
    try {
      close();
    } catch {
      this.logger.warn('Session connection cleanup failed');
    }
  }

  onModuleDestroy(): void {
    for (const [key, value] of this.connections) this.close(key, value.close);
  }
}
