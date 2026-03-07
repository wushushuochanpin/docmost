import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import { createHash } from 'crypto';
import { sanitizeUrl } from '@braintree/sanitize-url';
import slugify = require('@sindresorhus/slugify');
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { jsonToHtml } from '../../collaboration/collaboration.util';

export interface ShareRenderedTocItem {
  id: string;
  text: string;
  level: number;
  segmentIndex?: number;
}

export interface ShareRenderedInteractiveBlock {
  id: string;
  type: 'drawio' | 'excalidraw' | 'embed';
}

export interface ShareRenderedSegmentPayload {
  html: string;
  nextCursor?: string | null;
  segmentIndex: number;
  interactiveBlocks: ShareRenderedInteractiveBlock[];
}

export interface ShareRenderedPayload {
  html?: string | null;
  headHtml?: string | null;
  deliveryMode: 'full' | 'segmented';
  nextCursor?: string | null;
  segmentCount?: number;
  generatedAt: string;
  contentHash: string;
  toc: ShareRenderedTocItem[];
  interactiveBlocks: ShareRenderedInteractiveBlock[];
  rendererVersion: string;
  legacyFallbackReason?: string | null;
}

const INTERACTIVE_BLOCK_TYPES = new Set(['drawio', 'excalidraw', 'embed']);
const UNSUPPORTED_BLOCK_TYPES = new Set(['subpages']);
const FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link'];
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'poster',
  'data-src',
  'data-attachment-url',
]);
const RENDERER_VERSION = 'share-static-v2';
const RENDER_CACHE_TTL_MS = 5 * 60 * 1000;
const RENDER_CACHE_MAX_ENTRIES = 200;
const SEGMENT_TRIGGER_BLOCK_COUNT = 60;
const SEGMENT_TRIGGER_HTML_LENGTH = 90000;
const SEGMENT_MAX_BLOCK_COUNT = 24;
const SEGMENT_MAX_HTML_LENGTH = 36000;
const SEGMENT_CURSOR_PREFIX = 'seg:';

interface ShareRenderedSegmentCacheEntry extends ShareRenderedSegmentPayload {
  headingIds: string[];
}

interface ShareRenderedCacheEntry {
  payload: ShareRenderedPayload;
  segments: ShareRenderedSegmentCacheEntry[];
  expiresAt: number;
}

@Injectable()
export class ShareStaticRendererService {
  private readonly renderCache = new Map<string, ShareRenderedCacheEntry>();

  render(content: any): ShareRenderedPayload {
    return this.clonePayload(this.getOrCreateRenderCacheEntry(content).payload);
  }

  getSegment(
    content: any,
    cursor: string,
  ): ShareRenderedSegmentPayload | null {
    const cacheEntry = this.getOrCreateRenderCacheEntry(content);
    const segmentIndex = this.parseSegmentCursor(cursor);

    if (segmentIndex == null) {
      return null;
    }

    const segment = cacheEntry.segments[segmentIndex];
    if (!segment) {
      return null;
    }

    return this.cloneSegment(segment);
  }

  private getOrCreateRenderCacheEntry(content: any): ShareRenderedCacheEntry {
    const normalizedContent = getProsemirrorContent(content);
    const contentHash = `sha256:${createHash('sha256')
      .update(JSON.stringify(normalizedContent))
      .digest('hex')}`;
    const cacheKey = `${RENDERER_VERSION}:${contentHash}`;
    const cachedEntry = this.getCachedEntry(cacheKey);

    if (cachedEntry) {
      return cachedEntry;
    }

    const html = jsonToHtml(normalizedContent);
    const cacheEntry = this.buildRenderCacheEntry(html, contentHash);
    this.setCachedEntry(cacheKey, cacheEntry);

    return this.cloneCacheEntry(cacheEntry);
  }

  private buildRenderCacheEntry(
    html: string,
    contentHash: string,
  ): ShareRenderedCacheEntry {
    const $ = load(`<div id="share-render-root">${html}</div>`, null, false);
    const root = $('#share-render-root');
    let interactiveIndex = 0;
    let hasUnsupportedBlock = false;

    for (const tag of FORBIDDEN_TAGS) {
      root.find(tag).remove();
    }

    root.find('*').each((_, element) => {
      const $element = $(element);
      const attributes = { ...(element.attribs ?? {}) };

      for (const [name, value] of Object.entries(attributes)) {
        if (/^on/i.test(name) || name === 'srcdoc') {
          $element.removeAttr(name);
          continue;
        }

        if (name === 'style') {
          $element.removeAttr(name);
          continue;
        }

        if (URL_ATTRIBUTES.has(name)) {
          $element.attr(name, sanitizeUrl(value));
        }
      }

      if ($element.is('a')) {
        const target = $element.attr('target');
        if (target === 'blank') {
          $element.attr('target', '_blank');
        }

        if ($element.attr('target') === '_blank') {
          $element.attr('rel', 'noopener noreferrer');
        }
      }

      const blockType = $element.attr('data-type');
      if (!blockType) {
        return;
      }

      if (UNSUPPORTED_BLOCK_TYPES.has(blockType)) {
        hasUnsupportedBlock = true;
      }

      if (INTERACTIVE_BLOCK_TYPES.has(blockType)) {
        interactiveIndex += 1;
        $element.attr('data-share-block', blockType);
        $element.attr('data-share-block-id', `share-block-${interactiveIndex}`);
      }
    });

    this.decorateCodeBlocks($, root);

    const toc = this.collectToc($, root);
    const segments = this.buildSegments($, root);
    const headingSegmentMap = new Map<string, number>();

    for (const segment of segments) {
      for (const headingId of segment.headingIds) {
        if (!headingSegmentMap.has(headingId)) {
          headingSegmentMap.set(headingId, segment.segmentIndex);
        }
      }
    }

    const deliveryMode = segments.length > 1 ? 'segmented' : 'full';
    const payload: ShareRenderedPayload = {
      html: deliveryMode === 'full' ? (root.html() ?? '') : null,
      headHtml: deliveryMode === 'segmented' ? segments[0]?.html ?? '' : null,
      deliveryMode,
      nextCursor: segments.length > 1 ? this.createSegmentCursor(1) : null,
      segmentCount: segments.length,
      generatedAt: new Date().toISOString(),
      contentHash,
      toc: toc.map((item) => ({
        ...item,
        segmentIndex: headingSegmentMap.get(item.id) ?? 0,
      })),
      interactiveBlocks:
        segments[0]?.interactiveBlocks.map((item) => ({ ...item })) ?? [],
      rendererVersion: RENDERER_VERSION,
      legacyFallbackReason: hasUnsupportedBlock
        ? 'contains_unsupported_blocks'
        : null,
    };

    return {
      payload,
      segments,
      expiresAt: Date.now() + RENDER_CACHE_TTL_MS,
    };
  }

  private collectToc(
    $: ReturnType<typeof load>,
    root: ReturnType<typeof $>,
  ): ShareRenderedTocItem[] {
    const toc: ShareRenderedTocItem[] = [];
    const seenIds = new Set<string>();

    root.find('h1, h2, h3').each((index, element) => {
      const $element = $(element);
      const text = $element.text().trim();
      if (!text) {
        return;
      }

      const rawId = ($element.attr('id') || '').trim();
      const id = this.ensureUniqueHeadingId(
        rawId || this.createHeadingId(text, index),
        seenIds,
      );
      const level = Number(element.tagName?.slice(1) || '0');

      $element.attr('id', id);

      if (!Number.isFinite(level) || level < 1 || level > 3) {
        return;
      }

      toc.push({
        id,
        text,
        level,
      });
    });

    return toc;
  }

  private decorateCodeBlocks(
    $: ReturnType<typeof load>,
    root: ReturnType<typeof $>,
  ): void {
    root.find('pre').each((_, element) => {
      const $pre = $(element);

      if ($pre.parent().hasClass('share-code-block')) {
        return;
      }

      const $code = $pre.children('code').first();
      if (!$code.length) {
        return;
      }

      const language = this.getCodeBlockLanguage($code.attr('class'));
      const label = this.getCodeBlockLabel(language);
      const $wrapper = $('<section></section>')
        .addClass('share-code-block')
        .attr('data-language', language || 'plain-text');
      const $meta = $('<div></div>')
        .addClass('share-code-block__meta')
        .text(label);
      const $content = $pre.clone();

      $content
        .children('code')
        .first()
        .attr('data-language', language || 'plain-text');
      $wrapper.append($meta, $content);
      $pre.replaceWith($wrapper);
    });
  }

  private buildSegments(
    $: ReturnType<typeof load>,
    root: ReturnType<typeof $>,
  ): ShareRenderedSegmentCacheEntry[] {
    const fullHtml = root.html() ?? '';
    const topLevelNodes = root.children().toArray();

    if (!this.shouldSegment(topLevelNodes.length, fullHtml.length)) {
      return [this.createSegmentEntry(fullHtml, 0, null)];
    }

    const segmentHtmlParts: string[] = [];
    let currentSegment: string[] = [];
    let currentBlockCount = 0;
    let currentHtmlLength = 0;

    const flushCurrentSegment = () => {
      if (!currentSegment.length) {
        return;
      }

      segmentHtmlParts.push(currentSegment.join(''));
      currentSegment = [];
      currentBlockCount = 0;
      currentHtmlLength = 0;
    };

    for (const node of topLevelNodes) {
      const nodeHtml = $.html(node) ?? '';
      if (!nodeHtml.trim()) {
        continue;
      }

      const shouldFlush =
        currentSegment.length > 0 &&
        (currentBlockCount >= SEGMENT_MAX_BLOCK_COUNT ||
          currentHtmlLength + nodeHtml.length > SEGMENT_MAX_HTML_LENGTH);

      if (shouldFlush) {
        flushCurrentSegment();
      }

      currentSegment.push(nodeHtml);
      currentBlockCount += 1;
      currentHtmlLength += nodeHtml.length;
    }

    flushCurrentSegment();

    if (!segmentHtmlParts.length) {
      return [this.createSegmentEntry(fullHtml, 0, null)];
    }

    return segmentHtmlParts.map((segmentHtml, index) =>
      this.createSegmentEntry(
        segmentHtml,
        index,
        index + 1 < segmentHtmlParts.length
          ? this.createSegmentCursor(index + 1)
          : null,
      ),
    );
  }

  private createSegmentEntry(
    html: string,
    segmentIndex: number,
    nextCursor: string | null,
  ): ShareRenderedSegmentCacheEntry {
    const $ = load(`<div id="share-segment-root">${html}</div>`, null, false);
    const root = $('#share-segment-root');
    const headingIds = root
      .find('h1, h2, h3')
      .map((_, element) => {
        const id = $(element).attr('id');
        return typeof id === 'string' ? id.trim() : '';
      })
      .get()
      .filter(Boolean);

    return {
      html: root.html() ?? '',
      nextCursor,
      segmentIndex,
      headingIds,
      interactiveBlocks: this.collectInteractiveBlocks($, root),
    };
  }

  private collectInteractiveBlocks(
    $: ReturnType<typeof load>,
    root: ReturnType<typeof $>,
  ): ShareRenderedInteractiveBlock[] {
    const blocks: ShareRenderedInteractiveBlock[] = [];

    root.find('[data-share-block][data-share-block-id]').each((_, element) => {
      const $element = $(element);
      const type = $element.attr('data-share-block');
      const id = $element.attr('data-share-block-id');

      if (!id || !type || !INTERACTIVE_BLOCK_TYPES.has(type)) {
        return;
      }

      blocks.push({
        id,
        type: type as ShareRenderedInteractiveBlock['type'],
      });
    });

    return blocks;
  }

  private shouldSegment(topLevelBlockCount: number, htmlLength: number): boolean {
    return (
      topLevelBlockCount > SEGMENT_TRIGGER_BLOCK_COUNT ||
      htmlLength > SEGMENT_TRIGGER_HTML_LENGTH
    );
  }

  private createHeadingId(text: string, index: number): string {
    const base = slugify(text).trim() || `section-${index + 1}`;
    return base;
  }

  private getCodeBlockLanguage(className?: string): string | null {
    if (!className) {
      return null;
    }

    const match = className.match(/language-([a-z0-9_-]+)/i);
    return match?.[1]?.toLowerCase() || null;
  }

  private getCodeBlockLabel(language: string | null): string {
    if (!language) {
      return 'Code';
    }

    if (language === 'mermaid') {
      return 'Mermaid source';
    }

    if (language === 'plaintext' || language === 'text') {
      return 'Plain text';
    }

    return language
      .split(/[-_]/g)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private getCachedEntry(cacheKey: string): ShareRenderedCacheEntry | null {
    const cachedEntry = this.renderCache.get(cacheKey);

    if (!cachedEntry) {
      return null;
    }

    if (cachedEntry.expiresAt <= Date.now()) {
      this.renderCache.delete(cacheKey);
      return null;
    }

    this.renderCache.delete(cacheKey);
    this.renderCache.set(cacheKey, cachedEntry);

    return this.cloneCacheEntry(cachedEntry);
  }

  private setCachedEntry(
    cacheKey: string,
    cacheEntry: ShareRenderedCacheEntry,
  ): void {
    this.pruneExpiredCacheEntries();

    if (this.renderCache.has(cacheKey)) {
      this.renderCache.delete(cacheKey);
    }

    while (this.renderCache.size >= RENDER_CACHE_MAX_ENTRIES) {
      const oldestKey = this.renderCache.keys().next().value;

      if (!oldestKey) {
        break;
      }

      this.renderCache.delete(oldestKey);
    }

    this.renderCache.set(cacheKey, this.cloneCacheEntry(cacheEntry));
  }

  private pruneExpiredCacheEntries(): void {
    const now = Date.now();

    for (const [cacheKey, cacheEntry] of this.renderCache.entries()) {
      if (cacheEntry.expiresAt <= now) {
        this.renderCache.delete(cacheKey);
      }
    }
  }

  private cloneCacheEntry(
    cacheEntry: ShareRenderedCacheEntry,
  ): ShareRenderedCacheEntry {
    return {
      payload: this.clonePayload(cacheEntry.payload),
      segments: cacheEntry.segments.map((segment) => ({
        ...this.cloneSegment(segment),
        headingIds: [...segment.headingIds],
      })),
      expiresAt: cacheEntry.expiresAt,
    };
  }

  private clonePayload(payload: ShareRenderedPayload): ShareRenderedPayload {
    return {
      ...payload,
      toc: payload.toc.map((item) => ({ ...item })),
      interactiveBlocks: payload.interactiveBlocks.map((item) => ({
        ...item,
      })),
    };
  }

  private cloneSegment(
    segment: ShareRenderedSegmentPayload,
  ): ShareRenderedSegmentPayload {
    return {
      ...segment,
      interactiveBlocks: segment.interactiveBlocks.map((item) => ({
        ...item,
      })),
    };
  }

  private parseSegmentCursor(cursor: string): number | null {
    const match = cursor.match(/^seg:(\d+)$/);
    if (!match) {
      return null;
    }

    const segmentIndex = Number.parseInt(match[1], 10);
    if (!Number.isFinite(segmentIndex) || segmentIndex < 1) {
      return null;
    }

    return segmentIndex;
  }

  private createSegmentCursor(segmentIndex: number): string {
    return `${SEGMENT_CURSOR_PREFIX}${segmentIndex}`;
  }

  private ensureUniqueHeadingId(id: string, seenIds: Set<string>): string {
    let nextId = id;
    let suffix = 2;

    while (seenIds.has(nextId)) {
      nextId = `${id}-${suffix}`;
      suffix += 1;
    }

    seenIds.add(nextId);
    return nextId;
  }
}
