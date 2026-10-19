import { createHash } from 'node:crypto';
import { openCursor, sealCursor } from '../document-command/agent-cursor';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Attachment, Page } from '@docmost/db/types/entity.types';
import { SearchService } from '../search/search.service';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import {
  FetchMode,
  ImageReturnMode,
  McpAttachmentResult,
  McpFetchInput,
  McpGetPageInput,
  McpListPagesInput,
  McpSearchInput,
  McpToolContext,
} from './mcp.types';
import { validate as isValidUUID } from 'uuid';
import { getPageTitle } from '../../common/helpers';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import {
  jsonToHtml,
  jsonToMarkdown,
} from '../../collaboration/collaboration.util';

type PageScopeRow = {
  id: string;
  parentPageId: string | null;
  depth: number;
};

type PageListRow = {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  parentPageId: string | null;
  spaceId: string;
  spaceSlug: string | null;
  updatedAt: Date | null;
  nodeType: string | null;
  depth: number;
};

type FetchPage = Page & {
  nodeType?: string | null;
  textContent?: string | null;
  space?: { id: string; name: string; slug: string } | null;
};

const DEFAULT_SEARCH_TOP_K = 8;
const MAX_SEARCH_TOP_K = 20;
const MAX_SEARCH_CANDIDATES = 100;
const DEFAULT_FETCH_MAX_TOKENS = 3000;
const MAX_FETCH_TOKENS = 12000;
const DEFAULT_INLINE_IMAGE_BYTES = 1024 * 1024;
const MAX_CHILDREN_TO_FETCH = 25;

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly searchService: SearchService,
    private readonly pageService: PageService,
    private readonly pageAccessService: PageAccessService,
    private readonly storageService: StorageService,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  private async agentCanRead(
    pageId: string,
    spaceId: string,
    context: McpToolContext,
  ) {
    if (!context.agent) return true;
    if (!context.agent.spaceIds.includes(spaceId)) return false;
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('app.workspace_id',${context.workspace.id},true),pg_advisory_xact_lock_shared(20261018,1)`.execute(
        trx,
      );
      const grant =
        await sql`select 1 from document_agent_grants g join users u on u.id=g.user_id and u.workspace_id=g.workspace_id join agent_oauth_families f on f.grant_id=g.id join agent_oauth_tokens t on t.family_id=f.id join agent_oauth_clients c on c.id=f.client_id where g.id=${context.agent.grantId}::uuid and g.user_id=${context.user.id}::uuid and g.client_id=${context.agent.clientId} and g.revoked_at is null and g.expires_at>clock_timestamp() and ${spaceId}::uuid=any(g.space_ids) and 'knowledge.read'=any(g.scopes) and not f.revoked and c.active and 'knowledge.read'=any(c.scopes) and t.access_hash=${context.agent.tokenHash} and t.access_expires_at>clock_timestamp() and t.metadata->'scope' @> '["knowledge.read"]'::jsonb and u.deleted_at is null and u.deactivated_at is null`.execute(
          trx,
        );
      if (!grant.rows.length) return false;
      const page = await trx
        .selectFrom('pages')
        .select('id')
        .where('id', '=', pageId)
        .where('spaceId', '=', spaceId)
        .where('workspaceId', '=', context.workspace.id)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (
        !page ||
        !(
          await this.spaceMemberRepo.getUserSpaceRoles(
            context.user.id,
            spaceId,
            trx,
          )
        )?.length
      )
        return false;
      return (
        await this.pagePermissionRepo.canUserEditPage(
          context.user.id,
          pageId,
          trx,
        )
      ).canAccess;
    });
  }
  private async agentSearch(
    input: McpSearchInput,
    context: McpToolContext,
    topK: number,
  ) {
    const spaces = input.space_id
      ? [await this.resolveSpaceId(input.space_id, context)]
      : context.agent.spaceIds;
    if (spaces.some((id) => !context.agent.spaceIds.includes(id)))
      throw new ForbiddenException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    if (!spaces.length) return { items: [] };
    const scoped = await this.getScopedPageIds(input, context);
    const rows = await this.db
      .selectFrom('pages as p')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .select([
        'p.id',
        'p.title',
        'p.slugId',
        'p.textContent',
        'p.updatedAt',
        'p.spaceId',
        's.slug as spaceSlug',
        's.name as spaceName',
      ])
      .where('p.workspaceId', '=', context.workspace.id)
      .where('p.spaceId', 'in', spaces)
      .where('p.deletedAt', 'is', null)
      .where(
        sql<boolean>`to_tsvector('simple',coalesce(p.title,'') || ' ' || coalesce(p.text_content,'')) @@ plainto_tsquery('simple',${input.query})`,
      )
      .$if(!!scoped, (q) =>
        q.where(
          'p.id',
          'in',
          scoped?.length ? scoped : ['00000000-0000-0000-0000-000000000000'],
        ),
      )
      .orderBy('p.updatedAt', 'desc')
      .orderBy('p.id')
      .limit(100)
      .execute();
    const items = [];
    for (const row of rows) {
      if (await this.agentCanRead(row.id, row.spaceId, context))
        items.push({
          id: this.toMcpPageId(row.id),
          page_id: row.id,
          title: getPageTitle(row.title),
          snippet: (row.textContent ?? '').slice(0, 500),
          space_id: row.spaceId,
          space_name: row.spaceName,
          score: 1,
          updated_at: row.updatedAt,
          url: this.buildPageUrl(context.baseUrl, row.spaceSlug, row.slugId),
        });
      if (items.length === topK) break;
    }
    return { items };
  }

  async search(input: McpSearchInput, context: McpToolContext) {
    const topK = this.clampNumber(
      input.top_k,
      DEFAULT_SEARCH_TOP_K,
      1,
      MAX_SEARCH_TOP_K,
    );
    const query = input.query?.trim();

    if (!query) {
      return { items: [] };
    }

    if (context.agent) return this.agentSearch(input, context, topK);
    const scopedPageIds = await this.getScopedPageIds(input, context);
    const candidateLimit = scopedPageIds
      ? Math.min(MAX_SEARCH_CANDIDATES, Math.max(topK * 5, 25))
      : topK;

    const results = await this.searchService.searchPage(
      {
        query,
        spaceId: input.space_id,
        limit: candidateLimit,
        offset: 0,
      },
      {
        userId: context.user.id,
        workspaceId: context.workspace.id,
      },
    );

    const allowedPageIds = scopedPageIds ? new Set(scopedPageIds) : null;
    const items = results.items
      .filter((item) => !allowedPageIds || allowedPageIds.has(item.id))
      .slice(0, topK)
      .map((item) => ({
        id: this.toMcpPageId(item.id),
        title: getPageTitle(item.title),
        snippet: this.cleanSnippet(item.highlight),
        page_id: item.id,
        space_id: item.space?.id ?? null,
        space_name: item.space?.name ?? null,
        score: Number(item.rank ?? 0),
        updated_at: item.updatedAt?.toISOString?.() ?? item.updatedAt,
        url: this.buildPageUrl(context.baseUrl, item.space?.slug, item.slugId),
      }));

    return { items };
  }

  async fetch(input: McpFetchInput, context: McpToolContext) {
    const pageId = this.parseMcpPageId(input.id);
    const mode = input.mode ?? 'section';
    const imageMode = input.include_images ?? 'metadata';
    const maxTokens = this.resolveFetchTokenLimit(mode, input.max_tokens);
    const includeChildren = input.include_children === true;
    const maxDepth = this.clampNumber(input.max_depth, 0, 0, 5);

    const rootPage = await this.getReadablePage(pageId, context);
    const pages = includeChildren
      ? await this.getReadablePageTree(rootPage, context, maxDepth)
      : [rootPage];

    const selectedPages = pages.slice(0, MAX_CHILDREN_TO_FETCH + 1);
    const pageIds = selectedPages.map((page) => page.id);
    const attachments =
      imageMode === 'none'
        ? []
        : await this.getImageAttachments(pageIds, context, imageMode);

    const content = this.renderPages(selectedPages, input.format, maxTokens);
    const textBlock = {
      type: 'text' as const,
      text: content.text,
    };

    const imageBlocks =
      imageMode === 'inline'
        ? await this.buildInlineImageBlocks(attachments)
        : [];

    return {
      content: [textBlock, ...imageBlocks],
      structuredContent: {
        id: this.toMcpPageId(rootPage.id),
        page_id: rootPage.id,
        snapshot_revision: createHash('sha256')
          .update(
            JSON.stringify([
              rootPage.id,
              rootPage.updatedAt,
              rootPage.title,
              rootPage.content,
            ]),
          )
          .digest('hex'),
        title: getPageTitle(rootPage.title),
        content: content.text,
        format: input.format ?? 'markdown',
        mode,
        truncated: content.truncated,
        included_children: Math.max(0, selectedPages.length - 1),
        updated_at: rootPage.updatedAt?.toISOString?.() ?? rootPage.updatedAt,
        url: this.buildPageUrl(
          context.baseUrl,
          rootPage.space?.slug,
          rootPage.slugId,
        ),
        metadata: {
          max_tokens: maxTokens,
          include_images: imageMode,
          include_children: includeChildren,
          max_depth: maxDepth,
        },
        attachments,
      },
    };
  }

  async getPage(input: McpGetPageInput, context: McpToolContext) {
    const rawId = this.resolvePageIdFromGetPageInput(input);
    if (!rawId) {
      throw new NotFoundException('MCP_DOCUMENT_NOT_FOUND');
    }

    return this.fetch(
      {
        id: rawId,
        format: input.format,
        mode: input.mode,
        max_tokens: input.max_tokens,
        include_images: input.include_images,
        include_children: input.include_children,
        max_depth: input.max_depth,
      },
      context,
    );
  }

  async listPages(input: McpListPagesInput, context: McpToolContext) {
    const maxResults = this.clampNumber(input.max_results, 50, 1, 100);
    const maxDepth = this.clampNumber(input.max_depth, 2, 0, 5);

    const binding = {
      tool: 'list_pages',
      grant: context.agent?.grantId,
      spaces: context.agent?.spaceIds,
      space: input.space_id,
      parent: input.parent_page_id,
      depth: maxDepth,
      size: maxResults,
    };
    const position = input.cursor
      ? JSON.parse(String(openCursor(input.cursor, binding)))
      : null;
    const window = context.agent
      ? { after: position, limit: maxResults + 1 }
      : undefined;
    let rows: PageListRow[] = [];

    if (input.parent_page_id) {
      const parentId = this.parseMcpPageId(input.parent_page_id);
      const parentPage = await this.getReadablePage(parentId, context);
      rows = await this.getPageListRowsFromParent(
        parentPage.id,
        context,
        maxDepth,
        window,
      );
    } else if (input.space_id) {
      const spaceId = await this.resolveSpaceId(input.space_id, context);
      rows = await this.getPageListRowsFromSpace(
        spaceId,
        context,
        maxDepth,
        window,
      );
    } else {
      return { items: [] };
    }

    if (rows.length === 0) {
      return { items: [] };
    }

    const more = !!context.agent && rows.length > maxResults;
    const last = rows[maxResults - 1];
    const next_cursor = more
      ? sealCursor(binding, JSON.stringify([last.depth, last.slugId, last.id]))
      : null;
    if (context.agent) rows = rows.slice(0, maxResults);
    let accessibleSet: Set<string>;
    if (context.agent) {
      const allowed = [];
      for (const row of rows) {
        if (await this.agentCanRead(row.id, row.spaceId, context))
          allowed.push(row);
      }
      rows = allowed;
      accessibleSet = new Set(rows.map((row) => row.id));
    } else {
      accessibleSet = new Set(
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds: rows.map((row) => row.id),
          userId: context.user.id,
          spaceId: rows[0]?.spaceId,
        }),
      );
    }
    const items = rows
      .filter((r) => accessibleSet.has(r.id))
      .slice(0, maxResults)
      .map((r) => ({
        id: this.toMcpPageId(r.id),
        title: getPageTitle(r.title),
        slug_id: r.slugId,
        page_id: r.id,
        parent_page_id: r.parentPageId
          ? this.toMcpPageId(r.parentPageId)
          : null,
        space_id: r.spaceId,
        node_type: r.nodeType ?? 'file',
        depth: r.depth,
        updated_at: r.updatedAt?.toISOString?.() ?? r.updatedAt ?? null,
        url: this.buildPageUrl(
          context.baseUrl,
          r.spaceSlug ?? undefined,
          r.slugId,
        ),
      }));

    return { items, ...(context.agent ? { next_cursor } : {}) };
  }

  private resolvePageIdFromGetPageInput(input: McpGetPageInput): string | null {
    if (input.slug_id) {
      return this.extractStableSlugId(input.slug_id);
    }
    if (input.url) {
      return this.parseSlugIdFromUrl(input.url);
    }
    return null;
  }

  /**
   * Extracts the stable slugId (e.g. "ppWKvRMSRW") from composite inputs:
   *   "untitled-ppWKvRMSRW"       → "ppWKvRMSRW"
   *   "三观一致测试-ppWKvRMSRW"    → "ppWKvRMSRW"
   *   "ppWKvRMSRW"                → "ppWKvRMSRW"
   *   "page:untitled-ppWKvRMSRW"  → "ppWKvRMSRW"
   *   UUID string                 → unchanged (passed through to findById)
   */
  private extractStableSlugId(input: string): string {
    if (!input) return input;
    const raw = input.startsWith('page:') ? input.slice(5) : input;
    if (isValidUUID(raw)) return raw;
    const parts = raw.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : raw;
  }

  private parseSlugIdFromUrl(url: string): string | null {
    let segment: string | null = null;
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\/p\/([^/?#]+)/);
      segment = match ? match[1] : null;
    } catch {
      const match = url.match(/\/p\/([^/?#\s]+)/);
      segment = match ? match[1] : null;
    }
    return segment ? this.extractStableSlugId(segment) : null;
  }

  private async resolveSpaceId(
    spaceId: string,
    context: McpToolContext,
  ): Promise<string> {
    if (isValidUUID(spaceId)) {
      return spaceId;
    }
    const space = await this.db
      .selectFrom('spaces')
      .select('id')
      .where(sql`LOWER(slug)`, '=', sql`LOWER(${spaceId})`)
      .where('workspaceId', '=', context.workspace.id)
      .executeTakeFirst();
    if (!space) {
      throw new NotFoundException('MCP_SPACE_NOT_FOUND');
    }
    return space.id;
  }

  private async getPageListRowsFromParent(
    rootPageId: string,
    context: McpToolContext,
    maxDepth: number,
    window?: { after: any; limit: number },
  ): Promise<PageListRow[]> {
    return this.queryPageListRows(
      { rootPageId },
      context.workspace.id,
      maxDepth,
      window,
    );
  }

  private async getPageListRowsFromSpace(
    spaceId: string,
    context: McpToolContext,
    maxDepth: number,
    window?: { after: any; limit: number },
  ): Promise<PageListRow[]> {
    return this.queryPageListRows(
      { spaceId },
      context.workspace.id,
      maxDepth,
      window,
    );
  }

  private async queryPageListRows(
    scope: { rootPageId?: string; spaceId?: string },
    workspaceId: string,
    maxDepth: number,
    window?: { after: any; limit: number },
  ): Promise<PageListRow[]> {
    const anchorCondition = scope.rootPageId
      ? sql`p.id = ${scope.rootPageId} AND p.workspace_id = ${workspaceId} AND p.deleted_at IS NULL`
      : sql`p.space_id = ${scope.spaceId} AND p.workspace_id = ${workspaceId} AND p.parent_page_id IS NULL AND p.deleted_at IS NULL`;

    const result = await sql<PageListRow>`
      WITH RECURSIVE page_hierarchy AS (
        SELECT
          p.id,
          p.slug_id AS "slugId",
          p.title,
          p.icon,
          p.parent_page_id AS "parentPageId",
          p.space_id AS "spaceId",
          p.updated_at AS "updatedAt",
          COALESCE(pnm.node_type, 'file') AS "nodeType",
          0::int AS depth
        FROM pages p
        LEFT JOIN page_node_meta pnm ON pnm.page_id = p.id
        WHERE ${anchorCondition}
        UNION ALL
        SELECT
          c.id,
          c.slug_id AS "slugId",
          c.title,
          c.icon,
          c.parent_page_id AS "parentPageId",
          c.space_id AS "spaceId",
          c.updated_at AS "updatedAt",
          COALESCE(pnm2.node_type, 'file') AS "nodeType",
          ph.depth + 1 AS depth
        FROM pages c
        LEFT JOIN page_node_meta pnm2 ON pnm2.page_id = c.id
        INNER JOIN page_hierarchy ph ON c.parent_page_id = ph.id
        WHERE c.workspace_id = ${workspaceId}
          AND c.deleted_at IS NULL
          AND ph.depth < ${maxDepth}
      )
      SELECT ph.*, s.slug AS "spaceSlug"
      FROM page_hierarchy ph
      LEFT JOIN spaces s ON s.id = ph."spaceId"
      ${window?.after ? sql`WHERE (ph.depth,ph."slugId",ph.id)>(${window.after[0]}::int,${window.after[1]},${window.after[2]}::uuid)` : sql``}
      ORDER BY ph.depth ASC, ph."slugId" ASC, ph.id ASC
      ${window ? sql`LIMIT ${window.limit}` : sql``}
    `.execute(this.db);

    return result.rows;
  }

  private async getScopedPageIds(
    input: McpSearchInput,
    context: McpToolContext,
  ): Promise<string[] | null> {
    if (!input.parent_page_id) {
      return null;
    }

    const pageId = this.parseMcpPageId(input.parent_page_id);
    const rootPage = await this.getReadablePage(pageId, context);

    if (!input.include_children) {
      return [rootPage.id];
    }

    const maxDepth = this.clampNumber(input.max_depth, 1, 1, 5);
    const rows = await this.getPageScopeRows(rootPage.id, context, maxDepth);
    return rows.map((row) => row.id);
  }

  private async getReadablePage(
    pageId: string,
    context: McpToolContext,
  ): Promise<FetchPage> {
    const page = await this.pageService.getPageInfo(
      pageId,
      context.workspace.id,
      {
        includeContent: true,
        includeSpace: true,
        includeTextContent: true,
      },
    );

    if (context.agent && (!page || page.deletedAt))
      throw new ForbiddenException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    if (!page || page.deletedAt) {
      throw new NotFoundException('MCP_DOCUMENT_NOT_FOUND');
    }

    if (
      context.agent &&
      !(await this.agentCanRead(page.id, page.spaceId, context))
    )
      throw new ForbiddenException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    // OAuth reads already checked current membership and inherited ACL in one transaction.
    if (!context.agent)
      await this.pageAccessService.validateCanView(page, context.user);
    return page as FetchPage;
  }

  private async getReadablePageTree(
    rootPage: FetchPage,
    context: McpToolContext,
    maxDepth: number,
  ): Promise<FetchPage[]> {
    const rows = await this.getPageScopeRows(rootPage.id, context, maxDepth);
    const childRows = rows
      .filter((row) => row.id !== rootPage.id)
      .sort((a, b) => a.depth - b.depth)
      .slice(0, MAX_CHILDREN_TO_FETCH);

    const pages: FetchPage[] = [rootPage];
    for (const row of childRows) {
      try {
        pages.push(await this.getReadablePage(row.id, context));
      } catch (err) {
        if (
          err instanceof ForbiddenException ||
          err instanceof NotFoundException
        ) {
          continue;
        }
        throw err;
      }
    }

    return pages;
  }

  private async getPageScopeRows(
    rootPageId: string,
    context: McpToolContext,
    maxDepth: number,
  ): Promise<PageScopeRow[]> {
    const result = await sql<PageScopeRow>`
      with recursive page_hierarchy as (
        select
          id,
          parent_page_id as "parentPageId",
          0::int as depth
        from pages
        where id = ${rootPageId}
          and workspace_id = ${context.workspace.id}
          and deleted_at is null
        union all
        select
          p.id,
          p.parent_page_id as "parentPageId",
          ph.depth + 1 as depth
        from pages p
        inner join page_hierarchy ph on p.parent_page_id = ph.id
        where p.workspace_id = ${context.workspace.id}
          and p.deleted_at is null
          and ph.depth < ${maxDepth}
      )
      select id, "parentPageId", depth
      from page_hierarchy
    `.execute(this.db);

    return result.rows;
  }

  private async getImageAttachments(
    pageIds: string[],
    context: McpToolContext,
    imageMode: ImageReturnMode,
  ): Promise<McpAttachmentResult[]> {
    if (pageIds.length === 0) {
      return [];
    }

    const attachments = await this.db
      .selectFrom('attachments')
      .select(['id', 'fileName', 'filePath', 'fileSize', 'mimeType', 'pageId'])
      .where('workspaceId', '=', context.workspace.id)
      .where('pageId', 'in', pageIds)
      .where('deletedAt', 'is', null)
      .where('mimeType', 'like', 'image/%')
      .execute();

    return attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.fileName,
      mime_type: attachment.mimeType,
      file_size:
        attachment.fileSize === null ||
        typeof attachment.fileSize === 'undefined'
          ? null
          : Number(attachment.fileSize),
      ...(imageMode === 'url' || imageMode === 'inline'
        ? { url: `${context.baseUrl}/files/by-id/${attachment.id}` }
        : {}),
    }));
  }

  private async buildInlineImageBlocks(attachments: McpAttachmentResult[]) {
    const blocks = [];

    for (const attachment of attachments) {
      if ((attachment.file_size ?? 0) > DEFAULT_INLINE_IMAGE_BYTES) {
        attachment.inline = false;
        attachment.inline_omitted_reason = 'IMAGE_TOO_LARGE';
        continue;
      }

      const record = await this.db
        .selectFrom('attachments')
        .select(['filePath', 'mimeType'])
        .where('id', '=', attachment.id)
        .executeTakeFirst();

      if (!record) {
        attachment.inline = false;
        attachment.inline_omitted_reason = 'IMAGE_NOT_FOUND';
        continue;
      }

      const data = await this.readStreamAsBase64(record.filePath);
      blocks.push({
        type: 'image' as const,
        data,
        mimeType: record.mimeType,
      });
      attachment.inline = true;
    }

    return blocks;
  }

  private async readStreamAsBase64(filePath: string): Promise<string> {
    const stream = await this.storageService.readStream(filePath);
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('base64');
  }

  private renderPages(
    pages: FetchPage[],
    format: 'markdown' | 'html' = 'markdown',
    maxTokens: number,
  ) {
    const sections = pages.map((page, index) => {
      const headingPrefix = index === 0 ? '#' : '##';
      const body = this.renderPageContent(page, format);
      return `${headingPrefix} ${getPageTitle(page.title)}\n\n${body}`.trim();
    });

    return this.truncateToApproxTokens(sections.join('\n\n'), maxTokens);
  }

  private renderPageContent(page: FetchPage, format: 'markdown' | 'html') {
    if (page.nodeType === 'folder') {
      return '_Folder page. No document body._';
    }

    const content = getProsemirrorContent(page.content);
    if (!content) {
      return page.textContent ?? '';
    }

    return format === 'html' ? jsonToHtml(content) : jsonToMarkdown(content);
  }

  private resolveFetchTokenLimit(mode: FetchMode, requested?: number) {
    const defaultByMode = mode === 'snippet' ? 1000 : DEFAULT_FETCH_MAX_TOKENS;
    const maxByMode =
      mode === 'full' ? MAX_FETCH_TOKENS : DEFAULT_FETCH_MAX_TOKENS;
    return this.clampNumber(requested, defaultByMode, 200, maxByMode);
  }

  private truncateToApproxTokens(text: string, maxTokens: number) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) {
      return { text, truncated: false };
    }

    return {
      text: `${text.slice(0, maxChars).trimEnd()}\n\n[Truncated by MCP max_tokens=${maxTokens}]`,
      truncated: true,
    };
  }

  private parseMcpPageId(id: string) {
    return this.extractStableSlugId(id);
  }

  private toMcpPageId(pageId: string) {
    return `page:${pageId}`;
  }

  private cleanSnippet(snippet?: string | null) {
    return (snippet ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildPageUrl(baseUrl: string, spaceSlug?: string, pageSlug?: string) {
    if (!spaceSlug || !pageSlug) {
      return baseUrl;
    }

    return `${baseUrl}/s/${spaceSlug}/p/${pageSlug}`;
  }

  private clampNumber(
    value: number | undefined,
    defaultValue: number,
    min: number,
    max: number,
  ) {
    if (!Number.isFinite(value)) {
      return defaultValue;
    }

    return Math.min(max, Math.max(min, Math.floor(value as number)));
  }
}
