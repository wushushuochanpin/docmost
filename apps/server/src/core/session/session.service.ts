import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TokenService } from '../auth/services/token.service';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { User } from '@docmost/db/types/entity.types';
import { ClsService } from 'nestjs-cls';
import {
  AuditContext,
  AUDIT_CONTEXT_KEY,
} from '../../common/middlewares/audit-context.middleware';
import * as Bowser from 'bowser';
import { createHash, randomBytes } from 'node:crypto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { isUserDisabled } from '../../common/helpers';
import { JwtPayload, JwtType } from '../auth/dto/jwt-payload';
import { SessionConnectionsService } from './session-connections.service';
import { SessionActivityService } from './session-activity.service';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';

export type IdentitySessionMetadata = {
  issuer: string;
  subject: string;
  sid?: string;
  encryptedAccessToken: string;
  clientId: string;
  expiresAt: number;
};

export const isOpaqueSessionToken = (token: string): boolean =>
  /^dms_[A-Za-z0-9_-]{43}$/.test(token);
const credentialHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const MAX_SESSIONS_PER_USER = 25;
const RETENTION_DAYS = 7;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private identityVerifier?: (
    metadata: IdentitySessionMetadata,
  ) => Promise<void>;

  constructor(
    private readonly tokenService: TokenService,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly environmentService: EnvironmentService,
    private readonly cls: ClsService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly connections: SessionConnectionsService,
    private readonly sessionActivity: SessionActivityService,
  ) {
    this.connections.setIdentityVerifier(async (sessionId) => {
      const session = await this.userSessionRepo.findActiveById(sessionId);
      if (!session) throw new UnauthorizedException();
      await this.verifyIdentitySession(session.metadata);
      if (
        !(
          await this.userSessionRepo.findActiveSessionIds([sessionId])
        ).includes(sessionId)
      )
        throw new UnauthorizedException();
    });
  }

  registerIdentityVerifier(
    verifier: (metadata: IdentitySessionMetadata) => Promise<void>,
  ): void {
    this.identityVerifier = verifier;
  }

  private async verifyIdentitySession(metadata: unknown): Promise<void> {
    const identity = (metadata as { identity?: IdentitySessionMetadata } | null)
      ?.identity;
    if (!identity) return;
    if (
      !this.identityVerifier ||
      !Number.isFinite(identity.expiresAt) ||
      identity.expiresAt <= Date.now()
    )
      throw new UnauthorizedException();
    await this.identityVerifier(identity);
  }

  @Interval('session-cleanup', 24 * 60 * 60 * 1000)
  async cleanupSessions() {
    try {
      await this.userSessionRepo.deleteStale(RETENTION_DAYS);
      await this.userSessionRepo.trimExcessSessions(MAX_SESSIONS_PER_USER);
      this.logger.debug('Session cleanup completed');
    } catch (err) {
      this.logger.error('Session cleanup failed', err);
    }
  }

  async createSessionAndToken(user: User): Promise<string> {
    const auditContext = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    const ipAddress = auditContext?.ipAddress ?? null;
    const userAgent = auditContext?.userAgent ?? null;

    const deviceName = this.parseDeviceName(userAgent);
    const expiresAt = this.environmentService.getCookieExpiresIn();

    const session = await this.userSessionRepo.insertSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      deviceName,
      ipAddress,
      expiresAt,
    });

    return this.tokenService.generateAccessToken(user, session.id);
  }

  async createOpaqueSession(user: User, identity?: IdentitySessionMetadata) {
    if (isUserDisabled(user)) throw new UnauthorizedException();
    const token = `dms_${randomBytes(32).toString('base64url')}`;
    const configuredExpiry = this.environmentService.getCookieExpiresIn();
    if (
      identity &&
      (!Number.isFinite(identity.expiresAt) || identity.expiresAt <= Date.now())
    )
      throw new UnauthorizedException();
    const expiresAt = identity
      ? new Date(Math.min(+configuredExpiry, identity.expiresAt))
      : configuredExpiry;
    const auditContext = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    const session = await this.userSessionRepo.insertSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      expiresAt,
      credentialHash: credentialHash(token),
      deviceName: this.parseDeviceName(auditContext?.userAgent ?? null),
      ipAddress: auditContext?.ipAddress ?? null,
      metadata: identity ? { identity } : null,
    });
    return { token, sessionId: session.id, expiresAt };
  }

  /** Called only inside the identity repository's locked browser transaction.
   * The credential must already have been minted and registered by bootstrap.
   * No HTTP endpoint may pass a caller-selected credential into session issuance.
   */
  async activatePendingIdentitySession(
    user: User,
    identity: IdentitySessionMetadata,
    hash: string,
    trx: KyselyTransaction,
  ): Promise<{ sessionId: string; expiresAt: Date }> {
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      isUserDisabled(user) ||
      !Number.isFinite(identity.expiresAt) ||
      identity.expiresAt <= Date.now()
    )
      throw new UnauthorizedException();
    const pending =
      await sql`select credential_hash from identity_browser_handles
      where credential_hash = ${hash} and status = 'pending' and session_id is null
      and expires_at > clock_timestamp() for update`.execute(trx);
    if (pending.rows.length !== 1)
      throw new UnauthorizedException('Invalid pending session');
    const expiresAt = new Date(
      Math.min(
        +this.environmentService.getCookieExpiresIn(),
        identity.expiresAt,
      ),
    );
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    const session = await this.userSessionRepo.insertSession(
      {
        userId: user.id,
        workspaceId: user.workspaceId,
        expiresAt,
        credentialHash: hash,
        metadata: { identity },
        deviceName: this.parseDeviceName(context?.userAgent ?? null),
        ipAddress: context?.ipAddress ?? null,
      },
      trx,
    );
    return { sessionId: session.id, expiresAt };
  }

  async authenticateBrowserCredential(
    token: string,
    expectedWorkspaceId?: string,
    options: { checkIdentity?: boolean } = {},
  ) {
    if (!token) throw new UnauthorizedException();
    let sessionId: string;
    let userId: string;
    let workspaceId: string;
    if (isOpaqueSessionToken(token)) {
      const session = await this.userSessionRepo.findActiveByCredentialHash(
        credentialHash(token),
      );
      if (!session) throw new UnauthorizedException();
      ({ id: sessionId, userId, workspaceId } = session);
    } else {
      const payload: JwtPayload = await this.tokenService.verifyJwt(
        token,
        JwtType.ACCESS,
      );
      sessionId = payload.sessionId;
      userId = payload.sub;
      workspaceId = payload.workspaceId;
    }
    if (expectedWorkspaceId && workspaceId !== expectedWorkspaceId)
      throw new UnauthorizedException();
    const result = await this.assertActiveSession(
      sessionId,
      userId,
      workspaceId,
      options.checkIdentity !== false,
    );
    this.sessionActivity.trackActivity(sessionId, userId, workspaceId);
    return { ...result, sessionId };
  }

  async assertActiveSession(
    sessionId: string,
    userId: string,
    workspaceId: string,
    checkIdentity = false,
  ) {
    // Untracked legacy JWTs require reauthentication; they cannot be revoked safely.
    if (!sessionId || !userId || !workspaceId)
      throw new UnauthorizedException();
    const session = await this.userSessionRepo.findActiveById(sessionId);
    if (
      !session ||
      session.userId !== userId ||
      session.workspaceId !== workspaceId
    )
      throw new UnauthorizedException();
    const [user, workspace] = await Promise.all([
      this.userRepo.findById(userId, workspaceId),
      this.workspaceRepo.findById(workspaceId),
    ]);
    if (!user || !workspace || isUserDisabled(user))
      throw new UnauthorizedException();
    if (checkIdentity) {
      await this.verifyIdentitySession(session.metadata);
      // Remote verification may outlive logout or an account disable operation.
      if (
        !(
          await this.userSessionRepo.findActiveSessionIds([sessionId])
        ).includes(sessionId)
      )
        throw new UnauthorizedException();
    }
    return { user, workspace };
  }

  async revokeIdentitySessions(identity: {
    issuer: string;
    subject?: string;
    sid?: string;
  }): Promise<void> {
    if (!identity.issuer || (!identity.subject && !identity.sid))
      throw new Error(
        'Identity revocation requires an issuer and subject or sid',
      );
    await this.userSessionRepo.revokeIdentitySessions(identity);
    void this.connections.sweep();
  }

  async getActiveSessions(
    userId: string,
    workspaceId: string,
    currentSessionId: string | null,
  ) {
    const sessions = await this.userSessionRepo.findActiveByUser(
      userId,
      workspaceId,
    );

    const mapped = sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      geoLocation: s.geoLocation,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrentDevice: s.id === currentSessionId,
    }));

    return mapped.sort((a, b) => {
      if (a.isCurrentDevice) return -1;
      if (b.isCurrentDevice) return 1;
      return 0;
    });
  }

  async revokeSession(
    sessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const revoked = await this.userSessionRepo.revokeById(
      sessionId,
      userId,
      workspaceId,
    );
    if (revoked) this.connections.closeSession(sessionId);
  }

  async revokeAllOtherSessions(
    currentSessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.userSessionRepo.revokeAllExceptCurrent(
      currentSessionId,
      userId,
      workspaceId,
    );
    void this.connections.sweep();
  }

  private parseDeviceName(userAgent: string | null): string | null {
    if (!userAgent) return null;

    try {
      const parsed = Bowser.parse(userAgent);

      const os = parsed.os?.name;
      const browser = parsed.browser?.name;
      const platformType = parsed.platform?.type;

      if (platformType === 'mobile' || platformType === 'tablet') {
        return parsed.platform?.model || os || 'Mobile Device';
      }

      if (os) {
        return browser ? `${browser} on ${os}` : os;
      }

      return browser || null;
    } catch {
      return null;
    }
  }
}
