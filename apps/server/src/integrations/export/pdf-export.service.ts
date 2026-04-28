import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { load } from 'cheerio';
import { existsSync } from 'fs';
import { InjectKysely } from 'nestjs-kysely';
import puppeteer from 'puppeteer-core';
import { Page } from '@docmost/db/types/entity.types';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { getPageTitle } from '../../common/helpers';
import {
  getAttachmentIds,
  getProsemirrorContent,
} from '../../common/helpers/prosemirror/utils';
import { ShareStaticRendererService } from '../../core/share/share-static-renderer.service';
import { DomainService } from '../environment/domain.service';
import { EnvironmentService } from '../environment/environment.service';
import { StorageService } from '../storage/storage.service';
import { streamToBuffer } from '../storage/storage.utils';
import { ExportService } from './export.service';

type AttachmentRecord = {
  id: string;
  filePath: string;
  fileName: string;
  mimeType: string;
};

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    private readonly environmentService: EnvironmentService,
    private readonly domainService: DomainService,
    private readonly shareStaticRendererService: ShareStaticRendererService,
    private readonly exportService: ExportService,
  ) {}

  async exportPagePdf(page: Page, userId: string): Promise<Buffer> {
    const baseUrl = await this.getWorkspaceBaseUrl(page.workspaceId);
    const content = await this.exportService.turnPageMentionsToLinks(
      getProsemirrorContent(page.content),
      page.workspaceId,
      baseUrl,
      userId,
    );
    const renderedHtml = this.renderAllSegments(content);
    const hydratedHtml = await this.hydrateDocumentHtml(
      renderedHtml,
      content,
      page.workspaceId,
      baseUrl,
    );

    return this.renderPdf(
      this.wrapHtmlDocument(getPageTitle(page.title), hydratedHtml),
    );
  }

  private renderAllSegments(content: any): string {
    const rendered = this.shareStaticRendererService.render(content);

    if (rendered.deliveryMode === 'full') {
      return rendered.html ?? '';
    }

    let html = rendered.headHtml ?? '';
    let nextCursor = rendered.nextCursor ?? null;

    while (nextCursor) {
      const segment = this.shareStaticRendererService.getSegment(
        content,
        nextCursor,
      );

      if (!segment) {
        break;
      }

      html += segment.html;
      nextCursor = segment.nextCursor ?? null;
    }

    return html;
  }

  private async hydrateDocumentHtml(
    bodyHtml: string,
    content: any,
    workspaceId: string,
    baseUrl: string,
  ): Promise<string> {
    const $ = load(`<div id="pdf-root">${bodyHtml}</div>`, null, false);
    const root = $('#pdf-root');
    const attachments = await this.loadAttachments(content, workspaceId);

    await this.inlineAttachmentImages($, root, attachments);
    this.replaceVideosWithPlaceholders($, root, attachments);
    this.rewriteAttachmentLinks($, root, attachments, baseUrl);
    this.rewriteRelativeUrls($, root, baseUrl);

    return root.html() ?? '';
  }

  private async loadAttachments(
    content: any,
    workspaceId: string,
  ): Promise<Map<string, AttachmentRecord>> {
    const attachmentIds = getAttachmentIds(content);

    if (!attachmentIds.length) {
      return new Map();
    }

    const attachments = await this.db
      .selectFrom('attachments')
      .select(['id', 'filePath', 'fileName', 'mimeType'])
      .where('workspaceId', '=', workspaceId)
      .where('id', 'in', attachmentIds)
      .execute();

    return new Map(
      attachments.map((attachment) => [
        attachment.id,
        attachment as AttachmentRecord,
      ]),
    );
  }

  private async inlineAttachmentImages(
    $: ReturnType<typeof load>,
    root: any,
    attachments: Map<string, AttachmentRecord>,
  ): Promise<void> {
    const imageElements = root.find('img[data-attachment-id]').toArray();

    for (const element of imageElements) {
      const image = $(element);
      const attachmentId = image.attr('data-attachment-id');

      if (!attachmentId) {
        continue;
      }

      const attachment = attachments.get(attachmentId);
      if (!attachment || !attachment.mimeType.startsWith('image/')) {
        continue;
      }

      try {
        const dataUrl = await this.readAttachmentAsDataUrl(attachment);
        if (dataUrl) {
          image.attr('src', dataUrl);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to inline image attachment ${attachmentId}: ${String(error)}`,
        );
      }
    }
  }

  private replaceVideosWithPlaceholders(
    $: ReturnType<typeof load>,
    root: any,
    attachments: Map<string, AttachmentRecord>,
  ): void {
    root.find('video[data-attachment-id]').each((_, element) => {
      const video = $(element);
      const attachmentId = video.attr('data-attachment-id') || '';
      const attachment = attachments.get(attachmentId);
      const label = attachment?.fileName || video.attr('title') || 'Video';
      const placeholder = $('<div class="pdf-media-placeholder"></div>').text(
        `Video: ${label}`,
      );

      video.replaceWith(placeholder);
    });
  }

  private rewriteAttachmentLinks(
    $: ReturnType<typeof load>,
    root: any,
    attachments: Map<string, AttachmentRecord>,
    baseUrl: string,
  ): void {
    root.find('div[data-type="attachment"] a').each((_, element) => {
      const anchor = $(element);
      const attachmentId =
        anchor.closest('[data-attachment-id]').attr('data-attachment-id') || '';
      const attachment = attachments.get(attachmentId);
      const href =
        anchor.attr('href') ||
        anchor.attr('data-attachment-url') ||
        (attachment
          ? `/api/files/${attachment.id}/${attachment.fileName}`
          : null);

      if (!href) {
        return;
      }

      const absoluteHref = this.toAbsoluteUrl(href, baseUrl);
      anchor.attr('href', absoluteHref);
      anchor.attr('data-attachment-url', absoluteHref);
    });
  }

  private rewriteRelativeUrls(
    $: ReturnType<typeof load>,
    root: any,
    baseUrl: string,
  ): void {
    root.find('[href], [src], [poster], [data-src]').each((_, element) => {
      const node = $(element);

      for (const attribute of ['href', 'src', 'poster', 'data-src']) {
        const value = node.attr(attribute);
        if (!value) {
          continue;
        }

        node.attr(attribute, this.toAbsoluteUrl(value, baseUrl));
      }
    });
  }

  private async readAttachmentAsDataUrl(
    attachment: AttachmentRecord,
  ): Promise<string | null> {
    const fileStream = await this.storageService.readStream(
      attachment.filePath,
    );
    const buffer = await streamToBuffer(fileStream);

    if (!buffer.length) {
      return null;
    }

    return `data:${attachment.mimeType};base64,${buffer.toString('base64')}`;
  }

  private wrapHtmlDocument(title: string, bodyHtml: string): string {
    const safeTitle = this.escapeHtml(title);

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      @page {
        size: A4;
        margin: 16mm 14mm 18mm;
      }

      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        color: #111827;
        background: #ffffff;
        font-family: "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC",
          "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC",
          "WenQuanYi Micro Hei", Arial, sans-serif;
        font-size: 12px;
        line-height: 1.72;
      }

      .pdf-title {
        margin: 0 0 18px;
        font-size: 24px;
        line-height: 1.25;
        font-weight: 700;
      }

      #pdf-root > :first-child {
        margin-top: 0;
      }

      p,
      ul,
      ol,
      blockquote,
      figure,
      pre,
      table,
      details {
        margin-top: 0;
        margin-bottom: 0.9em;
      }

      h1,
      h2,
      h3 {
        margin: 1.2em 0 0.5em;
        line-height: 1.25;
        font-weight: 700;
        page-break-after: avoid;
      }

      h1 {
        font-size: 22px;
      }

      h2 {
        font-size: 18px;
      }

      h3 {
        font-size: 15px;
      }

      ul,
      ol {
        padding-left: 1.4rem;
      }

      li + li {
        margin-top: 0.3em;
      }

      a {
        color: #1d4ed8;
        text-decoration: none;
      }

      img {
        display: block;
        max-width: 100%;
        height: auto;
        page-break-inside: avoid;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        page-break-inside: auto;
      }

      th,
      td {
        border: 1px solid #d1d5db;
        padding: 8px 10px;
        vertical-align: top;
        text-align: left;
        word-break: break-word;
      }

      th {
        background: #f3f4f6;
        font-weight: 700;
      }

      code,
      pre,
      kbd,
      samp {
        font-family: "Noto Sans Mono CJK SC", "Sarasa Mono SC", Consolas,
          "SFMono-Regular", monospace;
      }

      pre {
        padding: 12px 14px;
        border: 1px solid #dbe3ee;
        border-radius: 8px;
        background: #f8fafc;
        white-space: pre-wrap;
        word-break: break-word;
      }

      :not(pre) > code {
        padding: 0.08rem 0.28rem;
        border-radius: 4px;
        background: #f3f4f6;
      }

      blockquote {
        padding-left: 12px;
        border-left: 3px solid #cbd5e1;
        color: #475569;
      }

      hr {
        border: none;
        border-top: 1px solid #d1d5db;
        margin: 1.2em 0;
      }

      .tableWrapper {
        overflow: visible;
      }

      [data-type="attachment"] a {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border: 1px solid #d1d5db;
        border-radius: 999px;
        color: #111827;
      }

      .share-code-block {
        border: 1px solid #d6dce7;
        border-radius: 10px;
        background: #f8fafc;
        overflow: hidden;
        page-break-inside: avoid;
      }

      .share-code-block__meta {
        padding: 8px 12px;
        border-bottom: 1px solid #d6dce7;
        background: #eef2f7;
        color: #475569;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .share-code-block pre {
        margin: 0;
        border: none;
        border-radius: 0;
        background: transparent;
      }

      .pdf-media-placeholder {
        padding: 10px 12px;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        color: #475569;
        background: #f8fafc;
      }
    </style>
  </head>
  <body>
    <main>
      <h1 class="pdf-title">${safeTitle}</h1>
      <article id="pdf-root">${bodyHtml}</article>
    </main>
  </body>
</html>`;
  }

  private async renderPdf(documentHtml: string): Promise<Buffer> {
    const executablePath = this.resolveChromiumExecutablePath();

    if (!executablePath) {
      throw new InternalServerErrorException(
        'Chromium executable not found for PDF export.',
      );
    }

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(documentHtml, {
        waitUntil: 'domcontentloaded',
      });
      await page
        .waitForFunction(
          () => Array.from(document.images).every((image) => image.complete),
          { timeout: 5000 },
        )
        .catch(() => null);

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private resolveChromiumExecutablePath(): string | null {
    const configuredPath =
      this.environmentService.getPdfExportChromiumPath()?.trim() || '';
    const candidates = [
      configuredPath,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async getWorkspaceBaseUrl(workspaceId: string): Promise<string> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('hostname')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return this.domainService.getUrl(workspace?.hostname);
  }

  private toAbsoluteUrl(value: string, baseUrl: string): string {
    if (
      !value ||
      value.startsWith('data:') ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('mailto:') ||
      value.startsWith('tel:') ||
      value.startsWith('#')
    ) {
      return value;
    }

    try {
      return new URL(value, `${baseUrl}/`).toString();
    } catch {
      return value;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
