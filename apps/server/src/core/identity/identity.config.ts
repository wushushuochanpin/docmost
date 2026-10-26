import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IdentityConfiguration {
  issuer: string;
  clientId: string;
  clientSecret: string;
  callback: string;
  surface: string;
  encryptionKey: Buffer;
}

@Injectable()
export class IdentityConfigService {
  constructor(private readonly config: ConfigService) {}

  enabled(workspaceId: string): boolean {
    return (
      this.config.get('IDENTITY_ENABLED') === 'true' &&
      String(this.config.get('IDENTITY_WORKSPACE_IDS') ?? '')
        .split(',')
        .map((v) => v.trim())
        .includes(workspaceId)
    );
  }

  get(): IdentityConfiguration {
    const issuer = this.url('IDENTITY_ISSUER');
    const callback = this.url('IDENTITY_CALLBACK_URL');
    if (new URL(callback).pathname !== '/api/identity/callback') this.invalid();
    const clientId = this.required('IDENTITY_CLIENT_ID');
    const clientSecret = this.required('IDENTITY_CLIENT_SECRET');
    const surface = this.required('IDENTITY_SURFACE');
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(surface)) this.invalid();
    const rawKey = this.required('IDENTITY_ENCRYPTION_KEY');
    const encryptionKey = Buffer.from(rawKey, 'base64');
    if (
      encryptionKey.length !== 32 ||
      encryptionKey.toString('base64') !== rawKey
    )
      this.invalid();
    return { issuer, callback, clientId, clientSecret, surface, encryptionKey };
  }

  private required(name: string): string {
    const value = this.config.get<string>(name);
    if (!value || typeof value !== 'string') this.invalid();
    return value;
  }

  private url(name: string): string {
    const raw = this.required(name);
    try {
      const url = new URL(raw);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        this.invalid();
      return raw;
    } catch {
      return this.invalid();
    }
  }

  private invalid(): never {
    throw new ServiceUnavailableException('identity_disabled');
  }
}
