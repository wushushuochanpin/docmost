import { Injectable } from '@nestjs/common';
import { htmlEscape } from '../../common/helpers/html-escaper';
import slugify = require('@sindresorhus/slugify');

type BuildPublicMetaInput = {
  origin: string;
  shareKey: string;
  pageSlugId: string;
  pageTitle?: string;
  textContent?: string;
  searchIndexing?: boolean;
};

@Injectable()
export class SharePreviewMetaService {
  buildCanonicalPath(opts: {
    shareKey: string;
    pageSlugId: string;
    pageTitle?: string;
  }) {
    const { shareKey, pageSlugId, pageTitle } = opts;
    return `/share/${shareKey}/${this.buildPageSlug(pageSlugId, pageTitle)}`;
  }

  buildPublicMeta(input: BuildPublicMetaInput) {
    const canonicalUrl = new URL(
      this.buildCanonicalPath({
        shareKey: input.shareKey,
        pageSlugId: input.pageSlugId,
        pageTitle: input.pageTitle,
      }),
      input.origin,
    ).toString();
    const title = this.truncate(this.normalizeText(input.pageTitle) || 'untitled', 80);
    const description = this.truncate(
      this.normalizeText(input.textContent),
      160,
    );
    const previewImageUrl = new URL('/icons/app-icon-512x512.png', input.origin)
      .toString();

    const metaTags = [
      `<meta name="description" content="${htmlEscape(description || title)}" />`,
      `<meta property="og:title" content="${htmlEscape(title)}" />`,
      description
        ? `<meta property="og:description" content="${htmlEscape(description)}" />`
        : '',
      `<meta property="og:type" content="article" />`,
      `<meta property="og:url" content="${htmlEscape(canonicalUrl)}" />`,
      `<meta property="og:image" content="${htmlEscape(previewImageUrl)}" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${htmlEscape(title)}" />`,
      description
        ? `<meta name="twitter:description" content="${htmlEscape(description)}" />`
        : '',
      `<meta name="twitter:image" content="${htmlEscape(previewImageUrl)}" />`,
      `<link rel="canonical" href="${htmlEscape(canonicalUrl)}" />`,
      !input.searchIndexing ? `<meta name="robots" content="noindex" />` : '',
    ]
      .filter(Boolean)
      .join('\n    ');

    return {
      title,
      metaTags,
    };
  }

  private buildPageSlug(pageSlugId: string, pageTitle?: string) {
    const titleSlug =
      slugify(pageTitle?.substring(0, 70) || 'untitled', {
        customReplacements: [
          ['♥', ''],
          ['🦄', ''],
        ],
      }) || 'untitled';

    return `${titleSlug}-${pageSlugId}`;
  }

  private normalizeText(value?: string) {
    return value?.replace(/\s+/g, ' ').trim() || '';
  }

  private truncate(value: string, max: number) {
    if (!value) {
      return '';
    }

    if (value.length <= max) {
      return value;
    }

    return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }
}
