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

    expect(service.getShareLegacyRouteMode()).toBe(ShareLegacyRouteMode.Observe);
  });
});
