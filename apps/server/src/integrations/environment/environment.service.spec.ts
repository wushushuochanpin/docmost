import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from './environment.service';
import { ShareLegacyRouteMode } from '../../core/share/share.constants';

describe('EnvironmentService', () => {
  function buildService(config: Record<string, string>) {
    const configService = new ConfigService(config);
    return new EnvironmentService(configService);
  }

  it('returns valid share legacy route mode from config', () => {
    const service = buildService({
      SHARE_LEGACY_ROUTE_MODE: ShareLegacyRouteMode.RedirectPublic,
    });

    expect(service.getShareLegacyRouteMode()).toBe(
      ShareLegacyRouteMode.RedirectPublic,
    );
  });

  it('falls back to observe for invalid share legacy route mode', () => {
    const service = buildService({
      SHARE_LEGACY_ROUTE_MODE: 'unknown_mode',
    });

    expect(service.getShareLegacyRouteMode()).toBe(
      ShareLegacyRouteMode.Observe,
    );
  });

  it('returns normalized configured app url when present', () => {
    const service = buildService({
      APP_URL: 'https://book.superchat.help/share/demo?x=1',
    });

    expect(service.getConfiguredAppUrl()).toBe('https://book.superchat.help');
  });

  it('falls back to localhost app url when app url is not configured', () => {
    const service = buildService({
      APP_URL: '',
      PORT: '3010',
    });

    expect(service.getConfiguredAppUrl()).toBeUndefined();
    expect(service.getAppUrl()).toBe('http://localhost:3010');
  });

  it('keeps backup enabled by default for existing deployments', () => {
    const service = buildService({});

    expect(service.isBackupEnabled()).toBe(true);
  });

  it('allows backup to be disabled explicitly', () => {
    const service = buildService({
      BACKUP_ENABLED: 'false',
    });

    expect(service.isBackupEnabled()).toBe(false);
  });

  it('keeps backup COS replica disabled by default', () => {
    const service = buildService({
      BACKUP_S3_ENABLED: '',
    });

    expect(service.isBackupS3Enabled()).toBe(false);
  });

  it('normalizes backup COS prefix', () => {
    const service = buildService({
      BACKUP_S3_PREFIX: '/archive/backups/',
    });

    expect(service.getBackupS3Prefix()).toBe('archive/backups');
  });
});
