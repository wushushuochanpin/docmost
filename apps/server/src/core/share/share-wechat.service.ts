import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { EnvironmentService } from '../../integrations/environment/environment.service';

type WechatApiResponse = {
  errcode?: number;
  errmsg?: string;
};

type AccessTokenResponse = WechatApiResponse & {
  access_token?: string;
  expires_in?: number;
};

type JsapiTicketResponse = WechatApiResponse & {
  ticket?: string;
  expires_in?: number;
};

type CachedValue = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class ShareWechatService {
  private readonly logger = new Logger(ShareWechatService.name);
  private accessTokenCache: CachedValue | null = null;
  private accessTokenPromise: Promise<CachedValue> | null = null;
  private jsapiTicketCache: CachedValue | null = null;
  private jsapiTicketPromise: Promise<CachedValue> | null = null;

  constructor(private readonly environmentService: EnvironmentService) {}

  isConfigured(): boolean {
    return this.environmentService.hasWechatShareConfig();
  }

  async createSignature(pageUrl: string) {
    if (!this.isConfigured()) {
      return { enabled: false as const };
    }

    const normalizedUrl = this.normalizePageUrl(pageUrl);
    const jsapiTicket = await this.getJsapiTicket();
    const nonceStr = randomBytes(8).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1')
      .update(
        `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${normalizedUrl}`,
      )
      .digest('hex');

    return {
      enabled: true as const,
      appId: this.environmentService.getWechatAppId(),
      nonceStr,
      timestamp,
      signature,
    };
  }

  normalizePageUrl(url: string): string {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  }

  private async getJsapiTicket(): Promise<string> {
    const now = Date.now();
    if (this.jsapiTicketCache && this.jsapiTicketCache.expiresAt > now) {
      return this.jsapiTicketCache.value;
    }

    if (!this.jsapiTicketPromise) {
      this.jsapiTicketPromise = this.fetchJsapiTicket();
    }

    try {
      const cached = await this.jsapiTicketPromise;
      this.jsapiTicketCache = cached;
      return cached.value;
    } finally {
      this.jsapiTicketPromise = null;
    }
  }

  private async fetchJsapiTicket(): Promise<CachedValue> {
    const accessToken = await this.getAccessToken();
    const url = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('type', 'jsapi');

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException('Failed to fetch WeChat JSAPI ticket');
    }

    const data = (await response.json()) as JsapiTicketResponse;
    if (data.errcode || !data.ticket) {
      this.logger.warn(
        `WeChat JSAPI ticket request failed: ${data.errcode ?? 'unknown'} ${data.errmsg ?? ''}`.trim(),
      );
      throw new BadGatewayException('Failed to fetch WeChat JSAPI ticket');
    }

    return {
      value: data.ticket,
      expiresAt: this.getExpiryTime(data.expires_in),
    };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now) {
      return this.accessTokenCache.value;
    }

    if (!this.accessTokenPromise) {
      this.accessTokenPromise = this.fetchAccessToken();
    }

    try {
      const cached = await this.accessTokenPromise;
      this.accessTokenCache = cached;
      return cached.value;
    } finally {
      this.accessTokenPromise = null;
    }
  }

  private async fetchAccessToken(): Promise<CachedValue> {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', this.environmentService.getWechatAppId());
    url.searchParams.set('secret', this.environmentService.getWechatAppSecret());

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException('Failed to fetch WeChat access token');
    }

    const data = (await response.json()) as AccessTokenResponse;
    if (data.errcode || !data.access_token) {
      this.logger.warn(
        `WeChat access token request failed: ${data.errcode ?? 'unknown'} ${data.errmsg ?? ''}`.trim(),
      );
      throw new BadGatewayException('Failed to fetch WeChat access token');
    }

    return {
      value: data.access_token,
      expiresAt: this.getExpiryTime(data.expires_in),
    };
  }

  private getExpiryTime(expiresIn?: number) {
    const safeExpiresIn = Number.isFinite(expiresIn) ? Number(expiresIn) : 7200;
    const ttlMs = Math.max(60, safeExpiresIn - 300) * 1000;
    return Date.now() + ttlMs;
  }
}
