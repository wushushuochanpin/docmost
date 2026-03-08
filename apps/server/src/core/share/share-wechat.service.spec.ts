import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { ShareWechatService } from './share-wechat.service';

describe('ShareWechatService', () => {
  function buildService(config: Record<string, string>) {
    const configService = new ConfigService(config);
    const environmentService = new EnvironmentService(configService);
    return new ShareWechatService(environmentService);
  }

  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns disabled when WeChat share config is missing', async () => {
    const service = buildService({});

    await expect(
      service.createSignature('https://example.com/share/demo'),
    ).resolves.toEqual({
      enabled: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches WeChat credentials and signs the current page URL without hash', async () => {
    const service = buildService({
      WECHAT_APP_ID: 'wx-app-id',
      WECHAT_APP_SECRET: 'wx-secret',
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          expires_in: 7200,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ticket: 'jsapi-ticket',
          expires_in: 7200,
        }),
      });

    const result = await service.createSignature(
      'https://example.com/share/demo#section-2',
    );

    expect(result.enabled).toBe(true);
    expect(result.appId).toBe('wx-app-id');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const expectedSignature = createHash('sha1')
      .update(
        `jsapi_ticket=jsapi-ticket&noncestr=${result.nonceStr}&timestamp=${result.timestamp}&url=https://example.com/share/demo`,
      )
      .digest('hex');

    expect(result.signature).toBe(expectedSignature);

    const cachedResult = await service.createSignature(
      'https://example.com/share/demo#section-3',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cachedResult.enabled).toBe(true);
  });
});
