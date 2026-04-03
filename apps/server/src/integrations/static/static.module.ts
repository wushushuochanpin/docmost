import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { join, resolve, sep } from 'path';
import * as fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import { EnvironmentService } from '../environment/environment.service';

@Module({})
export class StaticModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async onModuleInit() {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const app = httpAdapter.getInstance();

    const clientDistPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'client/dist',
    );

    const indexFilePath = join(clientDistPath, 'index.html');

    if (fs.existsSync(clientDistPath) && fs.existsSync(indexFilePath)) {
      const IMMUTABLE_ASSET_CACHE_CONTROL =
        'public, max-age=31536000, immutable';
      const DEFAULT_STATIC_CACHE_CONTROL = 'public, max-age=300';
      const NO_STORE_CACHE_CONTROL = 'no-store';
      const windowVar = '<!--window-config-->';

      const configString = {
        ENV: this.environmentService.getNodeEnv(),
        APP_URL: this.environmentService.getConfiguredAppUrl(),
        CLOUD: this.environmentService.isCloud(),
        FILE_UPLOAD_SIZE_LIMIT:
          this.environmentService.getFileUploadSizeLimit(),
        FILE_IMPORT_SIZE_LIMIT:
          this.environmentService.getFileImportSizeLimit(),
        DRAWIO_URL: this.environmentService.getDrawioUrl(),
        BACKUP_ENABLED: this.environmentService.isBackupEnabled(),
        BACKUP_S3_ENABLED: this.environmentService.isBackupS3Enabled(),
        SUBDOMAIN_HOST: this.environmentService.isCloud()
          ? this.environmentService.getSubdomainHost()
          : undefined,
        COLLAB_URL: this.environmentService.getCollabUrl(),
        BILLING_TRIAL_DAYS: this.environmentService.isCloud()
          ? this.environmentService.getBillingTrialDays()
          : undefined,
        POSTHOG_HOST: this.environmentService.getPostHogHost(),
        POSTHOG_KEY: this.environmentService.getPostHogKey(),
        SHARE_LEGACY_ROUTE_MODE:
          this.environmentService.getShareLegacyRouteMode(),
      };

      const windowScriptContent = `<script>window.CONFIG=${JSON.stringify(configString)};</script>`;
      const indexHtml = fs.readFileSync(indexFilePath, 'utf8');
      const transformedIndexHtml = indexHtml.includes(windowVar)
        ? indexHtml.replace(windowVar, windowScriptContent)
        : indexHtml;

      const RENDER_PATH = '*';

      await app.register(fastifyStatic, {
        root: clientDistPath,
        serve: false,
        setHeaders: (res, filePath) => {
          const normalizedPath = filePath.replace(/\\/g, '/');

          if (normalizedPath.endsWith('/index.html')) {
            res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
            return;
          }

          if (normalizedPath.includes('/assets/')) {
            res.setHeader('Cache-Control', IMMUTABLE_ASSET_CACHE_CONTROL);
            return;
          }

          res.setHeader('Cache-Control', DEFAULT_STATIC_CACHE_CONTROL);
        },
      });

      app.get(RENDER_PATH, (req: any, res: any) => {
        const requestPath = (req.raw?.url ?? req.url ?? '').split('?')[0];
        const relativePath = requestPath.replace(/^\/+/, '');

        if (relativePath) {
          const absolutePath = resolve(clientDistPath, relativePath);
          const isWithinClientDist =
            absolutePath === clientDistPath ||
            absolutePath.startsWith(`${clientDistPath}${sep}`);

          if (
            isWithinClientDist &&
            fs.existsSync(absolutePath) &&
            fs.statSync(absolutePath).isFile()
          ) {
            if (relativePath.startsWith('assets/')) {
              return res.sendFile(relativePath, {
                maxAge: '365d',
                immutable: true,
              });
            }

            return res.sendFile(relativePath, {
              maxAge: requestPath.endsWith('/index.html') ? 0 : '5m',
              immutable: false,
            });
          }
        }

        res
          .header('Cache-Control', NO_STORE_CACHE_CONTROL)
          .type('text/html')
          .send(transformedIndexHtml);
      });
    }
  }
}
