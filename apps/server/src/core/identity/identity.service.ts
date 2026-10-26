import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { comparePasswordHash, isUserDisabled } from '../../common/helpers';
import { SessionService } from '../session/session.service';
import { IdentityConfigService } from './identity.config';
import { IdentityProvider } from './identity.provider';
import { IdentityRepository } from './identity.repository';
import {
  identityHash,
  identityReturnTo,
  IDENTITY_TTL_MS,
  opaquePattern,
  openIdentity,
  randomIdentitySecret,
  sealIdentity,
} from './identity.security';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

interface LoginParameters {
  nonce: string;
  verifier: string;
  returnTo: string;
  issuer: string;
  clientId: string;
  callback: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly settings: IdentityConfigService,
    private readonly provider: IdentityProvider,
    private readonly repository: IdentityRepository,
    private readonly users: UserRepo,
    private readonly sessions: SessionService,
    @Inject(AUDIT_SERVICE) private readonly audit: IAuditService,
  ) {}

  enabled(workspaceId: string) {
    return this.settings.enabled(workspaceId);
  }

  async account(user: User) {
    const enabled = this.enabled(user.workspaceId);
    return {
      enabled,
      linked:
        enabled &&
        (await this.repository.isLinked(
          user.workspaceId,
          this.settings.get().issuer,
          user.id,
        )),
    };
  }

  async bootstrap(workspace: Workspace, browser?: string, credential?: string) {
    this.assertEnabled(workspace.id);
    this.settings.get();
    if (credential) {
      try {
        await this.sessions.authenticateBrowserCredential(
          credential,
          workspace.id,
        );
        return { ready: true, authenticated: true };
      } catch {
        // An expired credential is not an account binding and may start a new login.
      }
    }
    if (
      browser &&
      opaquePattern.test(browser) &&
      credential &&
      /^dms_[A-Za-z0-9_-]{43}$/.test(credential) &&
      (await this.repository.hasHandle(
        identityHash(credential),
        identityHash(browser),
      ))
    )
      return { ready: true };
    if (browser && opaquePattern.test(browser))
      await this.repository.cancelBrowser(identityHash(browser));
    const binding = randomIdentitySecret();
    const token = `dms_${randomIdentitySecret()}`;
    await this.repository.registerHandle(
      identityHash(token),
      identityHash(binding),
    );
    return { ready: true, binding, token };
  }

  async start(
    workspace: Workspace,
    browser: string | undefined,
    returnTo?: string,
    link?: { user: User; sessionId: string; password: string },
    credential?: string,
  ) {
    this.assertEnabled(workspace.id);
    const config = this.settings.get();
    const destination = identityReturnTo(returnTo);
    if (
      !link &&
      (!browser ||
        !opaquePattern.test(browser) ||
        !credential ||
        !/^dms_[A-Za-z0-9_-]{43}$/.test(credential) ||
        !(await this.repository.hasHandle(
          identityHash(credential),
          identityHash(browser),
        )))
    )
      throw new UnauthorizedException('invalid_transaction');
    if (link) {
      const user = await this.users.findById(link.user.id, workspace.id, {
        includePassword: true,
        includeUserMfa: true,
      });
      if (
        !user ||
        isUserDisabled(user) ||
        !link.sessionId ||
        !link.password ||
        !user.password ||
        !(await comparePasswordHash(link.password, user.password))
      ) {
        throw new UnauthorizedException('identity_password_invalid');
      }
      // Do not replace an existing MFA requirement with an unverified assurance claim.
      if (workspace.enforceMfa || user['mfa']?.isEnabled)
        throw new ForbiddenException('identity_assurance_required');
    }
    const binding =
      browser && opaquePattern.test(browser) ? browser : randomIdentitySecret();
    const state = randomIdentitySecret(),
      nonce = randomIdentitySecret(),
      verifier = randomIdentitySecret();
    const expiresAt = Date.now() + IDENTITY_TTL_MS;
    const query = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callback,
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(link ? { prompt: 'login', max_age: '0' } : {}),
    });
    const hosted = await this.provider.create(query, expiresAt);
    await this.repository.create({
      stateHash: identityHash(state),
      browserHash: identityHash(binding),
      workspaceId: workspace.id,
      purpose: link ? 'link' : 'login',
      credentialHash: link ? undefined : identityHash(credential!),
      userId: link?.user.id,
      sessionId: link?.sessionId,
      sealedParameters: sealIdentity(
        {
          nonce,
          verifier,
          returnTo: destination,
          issuer: config.issuer,
          clientId: config.clientId,
          callback: config.callback,
        },
        config.encryptionKey,
      ),
      expiresAt: new Date(hosted.expiresAt),
    });
    return { url: hosted.url, binding };
  }

  async callback(
    workspace: Workspace,
    callbackQuery: string,
    browser?: string,
    credential?: string,
  ) {
    this.assertEnabled(workspace.id);
    const config = this.settings.get();
    const query = new URLSearchParams(callbackQuery);
    const state = query.get('state') ?? '';
    if (
      !opaquePattern.test(state) ||
      !browser ||
      !opaquePattern.test(browser) ||
      query.getAll('state').length !== 1 ||
      query.getAll('code').length > 1
    ) {
      throw new UnauthorizedException('invalid_transaction');
    }
    const tx = await this.repository.consume(
      identityHash(state),
      identityHash(browser),
      workspace.id,
    );
    let validatedReturnTo: string | undefined;
    try {
      if (
        tx.purpose === 'login' &&
        (!credential || identityHash(credential) !== tx.credentialHash)
      )
        throw new UnauthorizedException('session_changed');
      const parameters = openIdentity<LoginParameters>(
        tx.sealedParameters,
        config.encryptionKey,
      );
      if (
        parameters.issuer !== config.issuer ||
        parameters.clientId !== config.clientId ||
        parameters.callback !== config.callback
      )
        throw new UnauthorizedException('invalid_transaction');
      validatedReturnTo = identityReturnTo(parameters.returnTo);
      if (query.has('error') || !query.get('code'))
        throw new UnauthorizedException('identity_invalid');
      if (tx.purpose === 'link') {
        const actor = await this.sessions.authenticateBrowserCredential(
          credential ?? '',
          workspace.id,
        );
        if (actor.user.id !== tx.userId || actor.sessionId !== tx.sessionId)
          throw new UnauthorizedException('session_changed');
      }
      await this.provider.complete(state);
      const callback = new URL(config.callback);
      callback.search = callbackQuery;
      const identity = await this.provider.exchange(
        callback,
        state,
        parameters.nonce,
        parameters.verifier,
        tx.purpose === 'link' ? 0 : undefined,
      );
      const metadata = {
        issuer: config.issuer,
        subject: identity.subject,
        sid: identity.sid,
        clientId: config.clientId,
        encryptedAccessToken: sealIdentity(
          identity.accessToken,
          config.encryptionKey,
        ),
        expiresAt: identity.expiresAt,
      };
      await this.provider.verify(metadata);
      const userId =
        tx.purpose === 'link'
          ? tx.userId
          : await this.repository.linkedUser(
              workspace.id,
              config.issuer,
              identity.subject,
            );
      if (!userId) throw new ForbiddenException('identity_not_linked');
      const user = await this.users.findById(userId, workspace.id, {
        includeUserMfa: true,
      });
      if (!user || isUserDisabled(user))
        throw new ForbiddenException('identity_not_linked');
      if (workspace.enforceMfa || user['mfa']?.isEnabled)
        throw new ForbiddenException('identity_assurance_required');
      await this.repository.finish(
        tx,
        config.issuer,
        identity.subject,
        userId,
        (hash, db) =>
          this.sessions.activatePendingIdentitySession(
            user,
            metadata,
            hash,
            db,
          ),
      );
      await this.users.updateLastLogin(user.id, workspace.id);
      this.audit.logWithContext(
        {
          event:
            tx.purpose === 'link'
              ? AuditEvent.USER_UPDATED
              : AuditEvent.USER_LOGIN,
          resourceType: AuditResource.USER,
          resourceId: user.id,
          metadata: { source: 'identity_center', action: tx.purpose },
        },
        { workspaceId: workspace.id, actorId: user.id },
      );
      const destination = new URL(parameters.returnTo, 'https://local.invalid');
      destination.searchParams.set('identity_authenticated', '1');
      return {
        returnTo:
          tx.purpose === 'link'
            ? '/settings/account/profile?identity_linked=1'
            : destination.pathname + destination.search + destination.hash,
      };
    } catch (error) {
      // The controller uses this validated transaction purpose only for a fixed local failure destination.
      if (error instanceof Error)
        Object.assign(error, {
          identityPurpose: tx.purpose,
          identityReturnTo: validatedReturnTo,
        });
      throw error;
    }
  }

  async cancelBrowserTransactions(browser?: string) {
    if (browser && opaquePattern.test(browser))
      await this.repository.cancelBrowser(identityHash(browser));
  }

  private assertEnabled(workspaceId: string) {
    if (!this.enabled(workspaceId))
      throw new ForbiddenException('identity_disabled');
  }
}
