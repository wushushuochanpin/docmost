import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import ms, { StringValue } from 'ms';
import { ShareLegacyRouteMode } from '../../core/share/share.constants';

const DEFAULT_SOURCE_REPO_URL = 'https://github.com/docmost/docmost';

@Injectable()
export class EnvironmentService {
  constructor(private configService: ConfigService) {}

  getNodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  isDevelopment(): boolean {
    return this.getNodeEnv() === 'development';
  }

  getConfiguredAppUrl(): string | undefined {
    const rawUrl = this.configService.get<string>('APP_URL')?.trim();
    if (!rawUrl) {
      return undefined;
    }

    const { origin } = new URL(rawUrl);
    return origin;
  }

  getAppUrl(): string {
    return this.getConfiguredAppUrl() || `http://localhost:${this.getPort()}`;
  }

  isHttps(): boolean {
    const appUrl = this.configService.get<string>('APP_URL');
    try {
      const url = new URL(appUrl);
      return url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  getSubdomainHost(): string {
    return this.configService.get<string>('SUBDOMAIN_HOST');
  }

  getPort(): number {
    return parseInt(this.configService.get<string>('PORT', '3000'));
  }

  getAppSecret(): string {
    return this.configService.get<string>('APP_SECRET');
  }

  getAppCommitSha(): string | undefined {
    const commitSha = this.configService.get<string>('APP_COMMIT_SHA');
    return commitSha?.trim() || undefined;
  }

  getAppSourceUrl(): string {
    const configured = this.configService.get<string>('APP_SOURCE_URL');
    if (configured?.trim()) {
      return configured.trim();
    }

    const commitSha = this.getAppCommitSha();
    if (commitSha) {
      return `${DEFAULT_SOURCE_REPO_URL}/tree/${commitSha}`;
    }

    return DEFAULT_SOURCE_REPO_URL;
  }

  getPdfExportChromiumPath(): string | undefined {
    const value = this.configService.get<string>('PDF_EXPORT_CHROMIUM_PATH');
    return value?.trim() || undefined;
  }

  getAppChannel(): 'prod' | 'staging' {
    const channel = this.configService
      .get<string>('APP_CHANNEL', 'prod')
      .toLowerCase();

    return channel === 'staging' ? 'staging' : 'prod';
  }

  getDatabaseURL(): string {
    return this.configService.get<string>('DATABASE_URL');
  }

  getDatabaseMaxPool(): number {
    return parseInt(this.configService.get<string>('DATABASE_MAX_POOL', '10'));
  }

  getRedisUrl(): string {
    return this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
  }

  getJwtTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_TOKEN_EXPIRES_IN', '90d');
  }

  getCookieExpiresIn(): Date {
    const expiresInStr = this.getJwtTokenExpiresIn();
    let msUntilExpiry: number;
    try {
      msUntilExpiry = ms(expiresInStr as StringValue);
    } catch (err) {
      msUntilExpiry = ms('90d');
    }
    return new Date(Date.now() + msUntilExpiry);
  }

  getStorageDriver(): string {
    return this.configService.get<string>('STORAGE_DRIVER', 'local');
  }

  getBackupLocalPath(): string {
    return this.configService.get<string>(
      'BACKUP_LOCAL_PATH',
      path.join(process.cwd(), 'data', 'backups'),
    );
  }

  isBackupEnabled(): boolean {
    const raw = this.configService.get<string>('BACKUP_ENABLED', 'true');
    return raw === 'true' || raw === '1';
  }

  isBackupS3Enabled(): boolean {
    const raw = this.configService.get<string>('BACKUP_S3_ENABLED', 'false');
    return raw === 'true' || raw === '1';
  }

  getBackupS3Prefix(): string {
    const value = this.configService.get<string>('BACKUP_S3_PREFIX', 'backups');
    return value.trim().replace(/^\/+|\/+$/g, '');
  }

  getBackupStaleJobMinutes(): number {
    const raw = this.configService.get<string>(
      'BACKUP_STALE_JOB_MINUTES',
      '30',
    );
    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1440;
    }

    return parsed;
  }

  getFileUploadSizeLimit(): string {
    const value = this.configService.get<string>(
      'FILE_UPLOAD_SIZE_LIMIT',
      '50mb',
    );
    return value?.trim() || '50mb';
  }

  getFileImportSizeLimit(): string {
    const value = this.configService.get<string>(
      'FILE_IMPORT_SIZE_LIMIT',
      '200mb',
    );
    return value?.trim() || '200mb';
  }

  getAwsS3AccessKeyId(): string {
    return this.configService.get<string>('AWS_S3_ACCESS_KEY_ID');
  }

  getAwsS3SecretAccessKey(): string {
    return this.configService.get<string>('AWS_S3_SECRET_ACCESS_KEY');
  }

  getAwsS3Region(): string {
    return this.configService.get<string>('AWS_S3_REGION');
  }

  getAwsS3Bucket(): string {
    return this.configService.get<string>('AWS_S3_BUCKET');
  }

  getAwsS3Endpoint(): string {
    return this.configService.get<string>('AWS_S3_ENDPOINT');
  }

  getAwsS3ForcePathStyle(): boolean {
    const v = this.configService.get<string>('AWS_S3_FORCE_PATH_STYLE');
    return v === 'true' || v === '1';
  }

  getAwsS3Url(): string {
    return this.configService.get<string>('AWS_S3_URL');
  }

  getMailDriver(): string {
    return this.configService.get<string>('MAIL_DRIVER', 'log');
  }

  getMailFromAddress(): string {
    return this.configService.get<string>('MAIL_FROM_ADDRESS');
  }

  getMailFromName(): string {
    return this.configService.get<string>('MAIL_FROM_NAME', 'SuperChat');
  }

  getSmtpHost(): string {
    return this.configService.get<string>('SMTP_HOST');
  }

  getSmtpPort(): number {
    return parseInt(this.configService.get<string>('SMTP_PORT'));
  }

  getSmtpSecure(): boolean {
    const secure = this.configService
      .get<string>('SMTP_SECURE', 'false')
      .toLowerCase();
    return secure === 'true';
  }

  getSmtpIgnoreTLS(): boolean {
    const ignoretls = this.configService
      .get<string>('SMTP_IGNORETLS', 'false')
      .toLowerCase();
    return ignoretls === 'true';
  }

  getSmtpUsername(): string {
    return this.configService.get<string>('SMTP_USERNAME');
  }

  getSmtpPassword(): string {
    return this.configService.get<string>('SMTP_PASSWORD');
  }

  getPostmarkToken(): string {
    return this.configService.get<string>('POSTMARK_TOKEN');
  }

  getDrawioUrl(): string {
    return this.configService.get<string>('DRAWIO_URL');
  }

  getWechatAppId(): string {
    return this.configService.get<string>('WECHAT_APP_ID');
  }

  getWechatAppSecret(): string {
    return this.configService.get<string>('WECHAT_APP_SECRET');
  }

  hasWechatShareConfig(): boolean {
    return Boolean(this.getWechatAppId() && this.getWechatAppSecret());
  }

  isCloud(): boolean {
    const cloudConfig = this.configService
      .get<string>('CLOUD', 'false')
      .toLowerCase();
    return cloudConfig === 'true';
  }

  isSelfHosted(): boolean {
    return !this.isCloud();
  }

  getStripePublishableKey(): string {
    return this.configService.get<string>('STRIPE_PUBLISHABLE_KEY');
  }

  getStripeSecretKey(): string {
    return this.configService.get<string>('STRIPE_SECRET_KEY');
  }

  getStripeWebhookSecret(): string {
    return this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  getBillingTrialDays(): number {
    return parseInt(this.configService.get<string>('BILLING_TRIAL_DAYS', '14'));
  }

  getCollabUrl(): string {
    return this.configService.get<string>('COLLAB_URL');
  }

  isCollabDisableRedis(): boolean {
    const isStandalone = this.configService
      .get<string>('COLLAB_DISABLE_REDIS', 'false')
      .toLowerCase();
    return isStandalone === 'true';
  }

  isDisableTelemetry(): boolean {
    const disable = this.configService
      .get<string>('DISABLE_TELEMETRY', 'false')
      .toLowerCase();
    return disable === 'true';
  }

  getPostHogHost(): string {
    return this.configService.get<string>('POSTHOG_HOST');
  }

  getPostHogKey(): string {
    return this.configService.get<string>('POSTHOG_KEY');
  }

  getSearchDriver(): string {
    return this.configService
      .get<string>('SEARCH_DRIVER', 'database')
      .toLowerCase();
  }

  getShareLegacyRouteMode(): ShareLegacyRouteMode {
    const mode = this.configService
      .get<string>('SHARE_LEGACY_ROUTE_MODE', ShareLegacyRouteMode.Observe)
      .toLowerCase();

    switch (mode) {
      case ShareLegacyRouteMode.Observe:
      case ShareLegacyRouteMode.ProtectedBlock:
      case ShareLegacyRouteMode.RedirectPublic:
      case ShareLegacyRouteMode.Removed:
        return mode;
      default:
        return ShareLegacyRouteMode.Observe;
    }
  }

  getTypesenseUrl(): string {
    return this.configService
      .get<string>('TYPESENSE_URL', 'http://localhost:8108')
      .toLowerCase();
  }

  getTypesenseApiKey(): string {
    return this.configService.get<string>('TYPESENSE_API_KEY');
  }

  getTypesenseLocale(): string {
    return this.configService
      .get<string>('TYPESENSE_LOCALE', 'en')
      .toLowerCase();
  }

  getAiDriver(): string {
    return this.configService.get<string>('AI_DRIVER');
  }

  getAiEmbeddingModel(): string {
    return this.configService.get<string>('AI_EMBEDDING_MODEL');
  }

  getAiCompletionModel(): string {
    return this.configService.get<string>('AI_COMPLETION_MODEL');
  }

  getAiEmbeddingDimension(): number {
    return parseInt(
      this.configService.get<string>('AI_EMBEDDING_DIMENSION'),
      10,
    );
  }

  getOpenAiApiKey(): string {
    return this.configService.get<string>('OPENAI_API_KEY');
  }

  getOpenAiApiUrl(): string {
    return this.configService.get<string>('OPENAI_API_URL');
  }

  getGeminiApiKey(): string {
    return this.configService.get<string>('GEMINI_API_KEY');
  }

  getOllamaApiUrl(): string {
    return this.configService.get<string>(
      'OLLAMA_API_URL',
      'http://localhost:11434',
    );
  }

  getEventStoreDriver(): string {
    return this.configService
      .get<string>('EVENT_STORE_DRIVER', 'postgres')
      .toLowerCase();
  }

  getClickHouseUrl(): string {
    return this.configService.get<string>('CLICKHOUSE_URL');
  }
}
