import {
  Injectable,
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
  private configuration?: Promise<Oidc.Configuration>;
  private readonly checks = new Map<string, Promise<void>>();
  constructor(private readonly settings: IdentityConfigService) {}

  async provider() {
    const oidc = await loadOidc();
    const config = this.settings.get();
    this.configuration ??= oidc
      .discovery(
        new URL(config.issuer),
        config.clientId,
        config.clientSecret,
        oidc.ClientSecretPost(config.clientSecret),
        { execute: [oidc.enableNonRepudiationChecks], timeout: 5 },
      )
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

  async exchange(
    url: URL,
    expectedState: string,
    nonce: string,
    verifier: string,
    maxAge?: number,
  ) {
    const { oidc, config } = await this.provider();
    try {
      const result = await oidc.authorizationCodeGrant(config, url, {
        expectedState,
        expectedNonce: nonce,
        pkceCodeVerifier: verifier,
        idTokenExpected: true,
        ...(maxAge !== undefined ? { maxAge } : {}),
      });
      const claims = result.claims();
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
    } catch {
      throw new UnauthorizedException('identity_invalid');
    }
  }

  async verify(metadata: IdentitySessionMetadata): Promise<void> {
    const settings = this.settings.get();
    if (
      metadata.issuer !== settings.issuer ||
      metadata.clientId !== settings.clientId ||
      metadata.expiresAt <= Date.now()
    ) {
      throw new UnauthorizedException('identity_invalid');
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
    try {
      const accessToken = openIdentity<string>(
        metadata.encryptedAccessToken,
        this.settings.get().encryptionKey,
      );
      const { oidc, config } = await this.provider();
      const [active, , accountResponse] = await Promise.all([
        oidc.tokenIntrospection(config, accessToken),
        oidc.fetchUserInfo(config, accessToken, metadata.subject),
        fetch(new URL('/api/get-account', metadata.issuer), {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        }),
      ]);
      if (
        !active.active ||
        active.sub !== metadata.subject ||
        active.client_id !== metadata.clientId ||
        !accountResponse.ok
      )
        throw new Error('inactive');
      const account = (await accountResponse.json()) as {
        status?: string;
        sub?: string;
        data?: { id?: string; isForbidden?: boolean; isDeleted?: boolean };
      };
      if (
        account.status !== 'ok' ||
        account.sub !== metadata.subject ||
        account.data?.id !== metadata.subject ||
        account.data.isForbidden ||
        account.data.isDeleted
      )
        throw new Error('inactive');
    } catch {
      throw new UnauthorizedException('identity_unavailable');
    }
  }

  private async hosted(path: string, body: unknown): Promise<any> {
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
      if (!response.ok) throw new Error('hosted_failed');
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('center_unavailable');
    }
  }
}
