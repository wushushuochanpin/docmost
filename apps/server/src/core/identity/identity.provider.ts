import { identityStage, identityCenterRequest, withIdentityTiming } from './identity.timing';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type * as Oidc from 'openid-client';
import { IdentityConfigService } from './identity.config';
import { openIdentity } from './identity.security';

// Preserve native import for openid-client's ESM entry under the Nest CommonJS build.
const loadOidc = new Function(
  'return import("openid-client")',
) as () => Promise<typeof Oidc>;
export interface IdentitySessionMetadata {
  issuer: string;
  subject: string;
  sid?: string;
  clientId: string;
  encryptedAccessToken: string;
  expiresAt: number;
}

@Injectable()
export class IdentityProvider {
  private readonly logger = new Logger(IdentityProvider.name);
  private configuration?: Promise<Oidc.Configuration>;
  private readonly checks = new Map<string, Promise<void>>();
  constructor(private readonly settings: IdentityConfigService) {}

  async provider() {
    const oidc = await loadOidc();
    const config = this.settings.get();
    this.configuration ??= identityStage('discovery', () => oidc.discovery(
        new URL(config.issuer),
        config.clientId,
        config.clientSecret,
        oidc.ClientSecretPost(config.clientSecret),
        { execute: [oidc.enableNonRepudiationChecks], timeout: 5 },
      ))
      .catch(() => {
        this.configuration = undefined;
        throw new ServiceUnavailableException('center_unavailable');
      });
    return { oidc, config: await this.configuration };
  }

  async create(query: URLSearchParams, expiresAt: number) {
    const result = await this.hosted('', {
      query: query.toString(),
      surface: this.settings.get().surface,
      expiresAt,
    });
    const expected = new URL(
      `/login/t/${query.get('state')}`,
      this.settings.get().issuer,
    ).href;
    if (
      result.url !== expected ||
      !Number.isSafeInteger(result.expiresAt) ||
      result.expiresAt > expiresAt ||
      result.expiresAt <= Date.now()
    ) {
      throw new ServiceUnavailableException('center_unavailable');
    }
    return { url: result.url as string, expiresAt: result.expiresAt as number };
  }

  async complete(state: string) {
    const result = await this.hosted(`/${state}/complete`, {});
    if (result.status !== 'consumed')
      throw new UnauthorizedException('invalid_transaction');
  }

  private async reauthenticationSdk() {
    return (new Function('return import(\"@wushushuochanpin/identity-server/reauthentication\")') as () => Promise<{reauthenticationParameters: () => {prompt: 'login'; max_age: '0'}; requireFreshAuthentication: (authTime: unknown, startedAt: number) => void}>)();
  }

  async reauthenticationParameters() {
    return (await this.reauthenticationSdk()).reauthenticationParameters();
  }

  async exchange(
    url: URL,
    expectedState: string,
    nonce: string,
    verifier: string,
    maxAge?: number,
    reauthenticationStartedAt?: number,
  ) {
    const { oidc, config } = await this.provider();
    try {
      const result = await identityStage('token_exchange', () => oidc.authorizationCodeGrant(config, url, {
        expectedState,
        expectedNonce: nonce,
        pkceCodeVerifier: verifier,
        idTokenExpected: true,
        ...(maxAge !== undefined ? { maxAge } : {}),
      }));
      const claims = result.claims();
      if (reauthenticationStartedAt !== undefined)
        (await this.reauthenticationSdk()).requireFreshAuthentication(claims?.auth_time, reauthenticationStartedAt);
      if (
        !claims?.sub ||
        !result.access_token ||
        !result.expires_in ||
        result.expires_in <= 0
      )
        throw new Error('missing_claims');
      const expiresAt = Math.min(
        Date.now() + result.expires_in * 1000,
        Number(claims.exp) * 1000,
      );
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error('expired');
      return {
        subject: claims.sub,
        sid: typeof claims.sid === 'string' ? claims.sid : undefined,
        accessToken: result.access_token,
        expiresAt,
      };
    } catch (error) {
      if (this.isTransient(error)) {
        this.logger.warn(
          `Identity token exchange unavailable (${this.failureCode(error)})`,
        );
        throw new ServiceUnavailableException('center_unavailable');
      }
      // The user-facing error stays generic; the provider's rejection reason is
      // logged here so an operator can tell invalid_grant from invalid_client.
      this.logger.warn(
        `Identity token exchange rejected (${this.failureCode(error)})`,
      );
      throw new UnauthorizedException('identity_invalid');
    }
  }

  async verify(metadata: IdentitySessionMetadata): Promise<void> {
    return withIdentityTiming('session_verify', undefined, () => this.verifySession(metadata));
  }

  private async verifySession(metadata: IdentitySessionMetadata): Promise<void> {
    const settings = this.settings.get();
    if (
      metadata.issuer !== settings.issuer ||
      metadata.clientId !== settings.clientId ||
      metadata.expiresAt <= Date.now()
    ) {
      throw this.invalid('session_metadata_mismatch');
    }
    const key = metadata.encryptedAccessToken;
    let pending = this.checks.get(key);
    if (!pending) {
      pending = this.verifyRemote(metadata).finally(() =>
        this.checks.delete(key),
      );
      this.checks.set(key, pending);
    }
    return pending;
  }

  private async verifyRemote(metadata: IdentitySessionMetadata) {
    let accessToken: string;
    try {
      accessToken = openIdentity<string>(
        metadata.encryptedAccessToken,
        this.settings.get().encryptionKey,
      );
    } catch {
      // A locally unreadable credential cannot be verified and is not an outage.
      throw this.invalid('credential_unreadable');
    }

    const { oidc, config } = await this.provider();
    try {
      const [introspection, userInfo, accountResponse] = await Promise.all([
        identityStage('introspection', () => oidc.tokenIntrospection(config, accessToken)),
        identityStage('userinfo', () => oidc.fetchUserInfo(config, accessToken, metadata.subject)),
        identityStage('account_headers', () => fetch(new URL('/api/get-account', metadata.issuer), {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        })),
      ]);

      // Only a parsed, authoritative answer from the center may end a session.
      // A malformed answer is an availability failure, not a revocation.
      if (typeof introspection.active !== 'boolean')
        throw new ServiceUnavailableException('identity_unavailable');
      if (!introspection.active)
        throw this.invalid('introspection_inactive');
      if (
        introspection.sub !== metadata.subject ||
        introspection.client_id !== metadata.clientId
      )
        throw this.invalid('introspection_subject_mismatch');

      if (!userInfo || typeof userInfo.sub !== 'string')
        throw new ServiceUnavailableException('identity_unavailable');
      if (userInfo.sub !== metadata.subject)
        throw this.invalid('userinfo_subject_mismatch');

      // Account deletion/disablement is an explicit center decision. Other
      // non-2xx account responses are treated as a temporary failure so a
      // center deploy or gateway error cannot sign every user out.
      if (!accountResponse.ok)
        throw new ServiceUnavailableException('identity_unavailable');
      let account: {
        status?: string;
        sub?: string;
        data?: { id?: string; isForbidden?: boolean; isDeleted?: boolean };
      };
      try {
        account = await identityStage('account_body', () => accountResponse.json());
      } catch {
        throw new ServiceUnavailableException('identity_unavailable');
      }
      if (account?.data?.isForbidden || account?.data?.isDeleted)
        throw this.invalid('account_disabled');
      if (account?.sub !== undefined && account.sub !== metadata.subject)
        throw this.invalid('account_subject_mismatch');
      if (
        account?.data?.id !== undefined &&
        account.data.id !== metadata.subject
      )
        throw this.invalid('account_id_mismatch');
      if (
        account?.status !== 'ok' ||
        typeof account.sub !== 'string' ||
        typeof account.data?.id !== 'string'
      )
        throw new ServiceUnavailableException('identity_unavailable');
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      this.logger.warn(
        `Identity verification unavailable (${this.failureCode(error)})`,
      );
      throw new ServiceUnavailableException('identity_unavailable');
    }
  }

  /**
   * Convert a provider-side rejection into the deliberately generic HTTP error,
   * keeping the concrete reason in the server log only.
   */
  private invalid(reason: string): UnauthorizedException {
    this.logger.warn(`Identity verification rejected (${reason})`);
    return new UnauthorizedException('identity_invalid');
  }

  /** Network, timeout, throttling and 5xx failures are transient. */
  private isTransient(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number')
      return status >= 500 || status === 408 || status === 429;
    if (['TimeoutError', 'AbortError', 'TypeError'].includes(error.name))
      return true;
    const cause = (error as { cause?: unknown }).cause;
    return (
      cause instanceof Error &&
      ['TimeoutError', 'AbortError', 'TypeError'].includes(cause.name)
    );
  }

  private failureCode(error: unknown): string {
    if (!(error instanceof Error)) return 'unknown';
    const status = (error as { status?: unknown }).status;
    const code = (error as { code?: unknown }).code;
    const oauth = (error as { error?: unknown }).error;
    return [
      error.name,
      typeof status === 'number' ? `status=${status}` : '',
      typeof code === 'string' ? code : '',
      typeof oauth === 'string' ? `oauth=${oauth}` : '',
    ]
      .filter(Boolean)
      .join(',');
  }

  private hosted(path: string, body: unknown): Promise<any> {
    return identityStage(path === '' ? 'hosted_create' : 'hosted_complete', () => this.hostedRequest(path, body));
  }

  private async hostedRequest(path: string, body: unknown): Promise<any> {
    const config = this.settings.get();
    try {
      const response = await fetch(
        new URL(`/delegation/hosted/requests${path}`, config.issuer),
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString('base64')}`,
          },
          body: JSON.stringify(body),
        },
      );
      identityCenterRequest(response);
      if (!response.ok) throw new Error('hosted_failed');
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('center_unavailable');
    }
  }
}
