import {
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SearchDTO, SearchSuggestionDTO } from './dto/search.dto';
import {
  SearchResponseDto,
  SearchResultPathItemDto,
} from './dto/search-response.dto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { TokenService } from '../auth/services/token.service';
import { JwtShareAccessPayload, JwtType } from '../auth/dto/jwt-payload';
import { ShareAccessMode, ShareErrorCode } from '../share/share.constants';
import { PageNodeMetaRepo } from '@docmost/db/repos/page/page-node-meta.repo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

@Injectable()
export class SearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private pageRepo: PageRepo,
    private shareRepo: ShareRepo,
    private pageNodeMetaRepo: PageNodeMetaRepo,
    private spaceMemberRepo: SpaceMemberRepo,
    private pagePermissionRepo: PagePermissionRepo,
    private tokenService: TokenService,
  ) {}

  async searchPage(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
    },
  ): Promise<{ items: SearchResponseDto[] }> {
    const query = searchParams.query.trim();

    if (query.length < 1) {
      return { items: [] };
    }
    const searchQuery = tsquery(query + '*');
    const likeQuery = `%${query}%`;
    const shouldUseContentSubstringSearch =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
        query,
      );

    let queryResults = this.db
      .selectFrom('pages')
      .leftJoin('pageNodeMeta as pnm', 'pnm.pageId', 'pages.id')
      .select([
        'pages.id as id',
        'pages.slugId as slugId',
        'pages.title as title',
        'pages.icon as icon',
        'pages.parentPageId as parentPageId',
        'pages.creatorId as creatorId',
        'pages.createdAt as createdAt',
        'pages.updatedAt as updatedAt',
        sql<'file' | 'folder'>`COALESCE("pnm"."node_type", 'file')`.as(
          'nodeType',
        ),
        this.pagePathExpression(),
        sql<number>`ts_rank(pages.tsv, to_tsquery('english', f_unaccent(${searchQuery})))`.as(
          'rank',
        ),
        sql<string>`ts_headline('english', coalesce(pages.text_content, ''), to_tsquery('english', f_unaccent(${searchQuery})),'MinWords=9, MaxWords=10, MaxFragments=3')`.as(
          'highlight',
        ),
      ])
      .where((eb) => {
        const predicates = [
          eb(
            'pages.tsv',
            '@@',
            sql<string>`to_tsquery('english', f_unaccent(${searchQuery}))`,
          ),
          eb(
            sql`LOWER(f_unaccent(pages.title))`,
            'like',
            sql`LOWER(f_unaccent(${likeQuery}))`,
          ),
        ];

        if (shouldUseContentSubstringSearch) {
          predicates.push(
            eb(
              sql`LOWER(f_unaccent(coalesce(pages.text_content, '')))`,
              'like',
              sql`LOWER(f_unaccent(${likeQuery}))`,
            ),
          );
        }

        return eb.or(predicates);
      })
      .$if(Boolean(searchParams.creatorId), (qb) =>
        qb.where('pages.creatorId', '=', searchParams.creatorId),
      )
      .where('pages.deletedAt', 'is', null)
      .orderBy(
        sql<number>`CASE WHEN LOWER(f_unaccent(pages.title)) LIKE LOWER(f_unaccent(${likeQuery})) THEN 1 ELSE 0 END`,
        'desc',
      )
      .orderBy('rank', 'desc')
      .limit(searchParams.limit || 25)
      .offset(searchParams.offset || 0);

    if (!searchParams.shareId) {
      queryResults = queryResults.select(this.pageSpaceExpression());
    }

    if (searchParams.spaceId) {
      // search by spaceId
      queryResults = queryResults
        .where('pages.spaceId', '=', searchParams.spaceId)
        .where('pages.workspaceId', '=', opts.workspaceId);
    } else if (opts.userId && !searchParams.spaceId) {
      // only search spaces the user is a member of
      queryResults = queryResults
        .where(
          'pages.spaceId',
          'in',
          this.spaceMemberRepo.getUserSpaceIdsQueryByWorkspace(
            opts.userId,
            opts.workspaceId,
          ),
        )
        .where('pages.workspaceId', '=', opts.workspaceId);
    } else if (searchParams.shareId && !searchParams.spaceId && !opts.userId) {
      // search in shares
      const shareId = searchParams.shareId;
      const share = await this.shareRepo.findById(shareId, {
        workspaceId: opts.workspaceId,
      });
      if (!share) {
        throw new NotFoundException({
          code: ShareErrorCode.ShareNotFound,
          message: 'Share not found',
        });
      }

      await this.assertPublicShareAccess(share, searchParams.accessToken);

      const isRestricted = await this.pagePermissionRepo.hasRestrictedAncestor(
        share.pageId,
      );
      if (isRestricted) {
        return { items: [] };
      }

      const pageIdsToSearch = [];
      const sharedPageNodeMeta = await this.pageNodeMetaRepo.findByPageId(
        share.pageId,
      );
      const canSearchDescendants =
        share.includeSubPages || sharedPageNodeMeta?.nodeType === 'folder';
      if (canSearchDescendants) {
        const pageList =
          await this.pageRepo.getPageAndDescendantsExcludingRestricted(
            share.pageId,
            {
              includeContent: false,
              workspaceId: opts.workspaceId,
            },
          );

        pageIdsToSearch.push(...pageList.map((page) => page.id));
      } else {
        pageIdsToSearch.push(share.pageId);
      }

      if (pageIdsToSearch.length > 0) {
        queryResults = queryResults
          .where('pages.id', 'in', pageIdsToSearch)
          .where('pages.workspaceId', '=', opts.workspaceId);
      } else {
        return { items: [] };
      }
    } else {
      return { items: [] };
    }

    //@ts-ignore
    let results: any[] = await queryResults.execute();

    if (opts.userId && results.length > 0) {
      const pageIds = results.map((result: any) => result.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId: opts.userId,
          spaceId: searchParams.spaceId,
        });
      const accessibleSet = new Set(accessibleIds);
      results = results.filter((result: any) => accessibleSet.has(result.id));
    }

    const searchResults = results.map((result: SearchResponseDto) => {
      if (result.highlight) {
        result.highlight = result.highlight
          .replace(/\r\n|\r|\n/g, ' ')
          .replace(/\s+/g, ' ');
      }
      return result;
    });

    return { items: searchResults };
  }

  private pagePathExpression() {
    return sql<SearchResultPathItemDto[]>`
      COALESCE(
        (
          WITH RECURSIVE ancestors AS (
            SELECT
              ancestor_pages.id,
              ancestor_pages.slug_id,
              ancestor_pages.title,
              ancestor_pages.icon,
              ancestor_pages.parent_page_id,
              COALESCE(ancestor_meta.node_type, 'file') AS node_type,
              0 AS depth
            FROM pages ancestor_pages
            LEFT JOIN page_node_meta ancestor_meta
              ON ancestor_meta.page_id = ancestor_pages.id
            WHERE ancestor_pages.id = pages.parent_page_id
              AND ancestor_pages.workspace_id = pages.workspace_id
              AND ancestor_pages.deleted_at IS NULL

            UNION ALL

            SELECT
              parent_pages.id,
              parent_pages.slug_id,
              parent_pages.title,
              parent_pages.icon,
              parent_pages.parent_page_id,
              COALESCE(parent_meta.node_type, 'file') AS node_type,
              ancestors.depth + 1 AS depth
            FROM pages parent_pages
            LEFT JOIN page_node_meta parent_meta
              ON parent_meta.page_id = parent_pages.id
            INNER JOIN ancestors
              ON ancestors.parent_page_id = parent_pages.id
            WHERE parent_pages.workspace_id = pages.workspace_id
              AND parent_pages.deleted_at IS NULL
          )
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', id,
              'slugId', slug_id,
              'title', title,
              'icon', icon,
              'nodeType', node_type
            )
            ORDER BY depth DESC
          )
          FROM ancestors
        ),
        '[]'::jsonb
      )
    `.as('path');
  }

  private pageSpaceExpression() {
    return sql`
      (
        SELECT jsonb_build_object(
          'id', spaces.id,
          'name', spaces.name,
          'slug', spaces.slug
        )
        FROM spaces
        WHERE spaces.id = pages.space_id
      )
    `.as('space');
  }

  async searchSuggestions(
    suggestion: SearchSuggestionDTO,
    userId: string,
    workspaceId: string,
  ) {
    let users = [];
    let groups = [];
    let pages = [];

    const limit = suggestion?.limit || 10;
    const query = suggestion.query.toLowerCase().trim();

    if (suggestion.includeUsers) {
      const userQuery = this.db
        .selectFrom('users')
        .select(['id', 'name', 'email', 'avatarUrl'])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where((eb) =>
          eb.or([
            eb(
              sql`LOWER(f_unaccent(users.name))`,
              'like',
              sql`LOWER(f_unaccent(${`%${query}%`}))`,
            ),
            eb(sql`users.email`, 'ilike', sql`f_unaccent(${`%${query}%`})`),
          ]),
        )
        .limit(limit);

      users = await userQuery.execute();
    }

    if (suggestion.includeGroups) {
      groups = await this.db
        .selectFrom('groups')
        .select(['id', 'name', 'description'])
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(groups.name))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('workspaceId', '=', workspaceId)
        .limit(limit)
        .execute();
    }

    if (suggestion.includePages) {
      let pageSearch = this.db
        .selectFrom('pages')
        .select(['id', 'slugId', 'title', 'icon', 'spaceId'])
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(pages.title))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('deletedAt', 'is', null)
        .where('workspaceId', '=', workspaceId)
        .limit(limit);

      // only search spaces the user has access to
      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
        userId,
        workspaceId,
      );

      if (userSpaceIds?.length > 0) {
        // we need this check or the query will throw an error if the userSpaceIds array is empty
        pageSearch = pageSearch.where('spaceId', 'in', userSpaceIds);

        if (suggestion?.spaceId) {
          pageSearch = pageSearch.orderBy(
            sql`CASE WHEN pages."space_id" = ${suggestion.spaceId} THEN 0 ELSE 1 END`,
            'asc',
          );
        }

        pages = await pageSearch.execute();
      }

      if (pages.length > 0) {
        const pageIds = pages.map((page) => page.id);
        const accessibleIds =
          await this.pagePermissionRepo.filterAccessiblePageIds({
            pageIds,
            userId,
            spaceId: suggestion.spaceId,
          });
        const accessibleSet = new Set(accessibleIds);
        pages = pages.filter((page) => accessibleSet.has(page.id));
      }
    }

    return { users, groups, pages };
  }

  private async assertPublicShareAccess(
    share: {
      id: string;
      workspaceId: string;
      accessMode: string;
      expiresAt: Date | null;
      securityVersion: number;
    },
    accessToken?: string,
  ) {
    if (share.accessMode !== ShareAccessMode.PasswordExpiring) {
      return;
    }

    if (!share.expiresAt || share.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: ShareErrorCode.ShareExpired,
        message: 'Share link has expired',
      });
    }

    if (!accessToken) {
      throw new UnauthorizedException({
        code: ShareErrorCode.SharePasswordRequired,
        message: 'Share password required',
      });
    }

    let payload: JwtShareAccessPayload;
    try {
      payload = (await this.tokenService.verifyJwt(
        accessToken,
        JwtType.SHARE_ACCESS,
      )) as JwtShareAccessPayload;
    } catch (err) {
      throw new UnauthorizedException({
        code: ShareErrorCode.ShareAccessTokenInvalid,
        message: 'Share access token invalid',
      });
    }

    if (
      payload.shareId !== share.id ||
      payload.workspaceId !== share.workspaceId ||
      payload.securityVersion !== (share.securityVersion ?? 1)
    ) {
      throw new UnauthorizedException({
        code: ShareErrorCode.ShareAccessTokenInvalid,
        message: 'Share access token invalid',
      });
    }
  }
}
