import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ShareService } from './share.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { join } from 'path';
import * as fs from 'node:fs';
import { validate as isValidUUID } from 'uuid';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { Workspace } from '@docmost/db/types/entity.types';
import { ShareAccessMode, ShareLegacyRouteMode } from './share.constants';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SharePreviewMetaService } from './share-preview-meta.service';

@Controller('share')
export class ShareSeoController {
  constructor(
    private readonly shareService: ShareService,
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
    private readonly pageRepo: PageRepo,
    private readonly sharePreviewMetaService: SharePreviewMetaService,
  ) {}

  /*
   * add meta tags to publicly shared pages
   */
  @Get([':shareId/p/:pageSlug', 'p/:pageSlug', ':shareId/:pageSlug'])
  async getShare(
    @Res({ passthrough: false }) res: FastifyReply,
    @Req() req: FastifyRequest,
    @Param('shareId') shareId: string,
    @Param('pageSlug') pageSlug: string,
  ) {
    // Nestjs does not to apply middlewares to paths excluded from the global /api prefix
    // https://github.com/nestjs/nest/issues/9124
    // https://github.com/nestjs/nest/issues/11572
    // https://github.com/nestjs/nest/issues/13401
    // we have to duplicate the DomainMiddleware code here as a workaround

    let workspace: Workspace = null;
    if (this.environmentService.isSelfHosted()) {
      workspace = await this.workspaceRepo.findFirst();
    } else {
      const header = req.raw.headers.host;
      const subdomain = header.split('.')[0];
      workspace = await this.workspaceRepo.findByHostname(subdomain);
    }

    const clientDistPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'client/dist',
    );

    if (fs.existsSync(clientDistPath)) {
      const indexFilePath = join(clientDistPath, 'index.html');

      if (!workspace) {
        return this.sendIndex(indexFilePath, res);
      }

      const origin = this.getRequestOrigin(req);
      const currentPathname = this.getRequestPathname(req, origin);
      const pageId = this.extractPageSlugId(pageSlug);
      const hasShareId = Boolean(shareId);
      const legacyMode = this.environmentService.getShareLegacyRouteMode();

      if (!hasShareId && legacyMode === ShareLegacyRouteMode.Removed) {
        return res.code(404).send('');
      }

      const share = await this.shareService.getShareForPage(
        pageId,
        workspace.id,
        hasShareId ? { shareId } : undefined,
      );

      if (!share) {
        return this.sendIndex(indexFilePath, res);
      }

      const page = await this.pageRepo.findById(pageId, {
        workspaceId: workspace.id,
        includeTextContent: true,
      });

      if (!page || page.deletedAt) {
        return this.sendIndex(indexFilePath, res);
      }

      const canonicalPath = this.sharePreviewMetaService.buildCanonicalPath({
        shareKey: share.key,
        pageSlugId: page.slugId,
        pageTitle: page.title,
      });

      if (!hasShareId) {
        if (share.accessMode === ShareAccessMode.PasswordExpiring) {
          if (
            legacyMode === ShareLegacyRouteMode.ProtectedBlock ||
            legacyMode === ShareLegacyRouteMode.RedirectPublic ||
            legacyMode === ShareLegacyRouteMode.Removed
          ) {
            return res.code(404).send('');
          }
        }

        if (
          legacyMode === ShareLegacyRouteMode.RedirectPublic &&
          share.accessMode === ShareAccessMode.Public
        ) {
          return res.redirect(canonicalPath, 302);
        }
      }

      // Avoid leaking protected page metadata in public SEO payload.
      if (share.accessMode === ShareAccessMode.PasswordExpiring) {
        return this.sendIndex(indexFilePath, res);
      }

      if (hasShareId && currentPathname !== canonicalPath) {
        return res.redirect(canonicalPath, 302);
      }

      const previewMeta = this.sharePreviewMetaService.buildPublicMeta({
        origin,
        shareKey: share.key,
        pageSlugId: page.slugId,
        pageTitle: page.title,
        textContent: page.textContent,
        searchIndexing: share.searchIndexing,
      });

      const metaTagVar = '<!--meta-tags-->';

      const html = fs.readFileSync(indexFilePath, 'utf8');
      const transformedHtml = html
        .replace(
          /<title>[\s\S]*?<\/title>/i,
          `<title>${previewMeta.title}</title>`,
        )
        .replace(metaTagVar, previewMeta.metaTags);

      res.type('text/html').send(transformedHtml);
    }
  }

  sendIndex(indexFilePath: string, res: FastifyReply) {
    const stream = fs.createReadStream(indexFilePath);
    res.type('text/html').send(stream);
  }

  extractPageSlugId(slug: string): string {
    if (!slug) {
      return undefined;
    }
    if (isValidUUID(slug)) {
      return slug;
    }
    const parts = slug.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : slug;
  }

  private getRequestOrigin(req: FastifyRequest) {
    const host = req.headers.host;
    if (!host) {
      return this.environmentService.getAppUrl();
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol =
      (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
        ?.toString()
        ?.split(',')[0]
        ?.trim() ||
      req.protocol ||
      (this.environmentService.isHttps() ? 'https' : 'http');

    return `${protocol}://${host}`;
  }

  private getRequestPathname(req: FastifyRequest, origin: string) {
    const rawUrl = req.raw.url || '/';

    try {
      return new URL(rawUrl, origin).pathname;
    } catch {
      return rawUrl.split('?')[0] || '/';
    }
  }
}
