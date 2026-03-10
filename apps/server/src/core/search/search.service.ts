import {
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SearchDTO, SearchSuggestionDTO } from './dto/search.dto';
import { SearchResponseDto } from './dto/search-response.dto';
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
    const { query } = searchParams;

    if (query.length < 1) {
      return { items: [] };
    }
    const searchQuery = tsquery(query.trim() + '*');

    let queryResults = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'creatorId',
        'createdAt',
        'updatedAt',
        sql<number>`ts_rank(tsv, to_tsquery('english', f_unaccent(${searchQuery})))`.as(
          'rank',
        ),
        sql<string>`ts_headline('english', text_content, to_tsquery('english', f_unaccent(${searchQuery})),'MinWords=9, MaxWords=10, MaxFragments=3')`.as(
          'highlight',
        ),
      ])
      .where(
        'tsv',
        '@@',
        sql<string>`to_tsquery('english', f_unaccent(${searchQuery}))`,
      )
      .$if(Boolean(searchParams.creatorId), (qb) =>
        qb.where('creatorId', '=', searchParams.creatorId),
      )
      .where('deletedAt', 'is', null)
      .orderBy('rank', 'desc')
      .limit(searchParams.limit || 25)
      .offset(searchParams.offset || 0);

    if (!searchParams.shareId) {
      queryResults = queryResults.select((eb) => this.pageRepo.withSpace(eb));
    }

    if (searchParams.spaceId) {
      // search by spaceId
      queryResults = queryResults
        .where('spaceId', '=', searchParams.spaceId)
        .where('workspaceId', '=', opts.workspaceId);
    } else if (opts.userId && !searchParams.spaceId) {
      // only search spaces the user is a member of
      queryResults = queryResults
        .where(
          'spaceId',
          'in',
          this.spaceMemberRepo.getUserSpaceIdsQueryByWorkspace(
            opts.userId,
            opts.workspaceId,
          ),
        )
        .where('workspaceId', '=', opts.workspaceId);
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

      const pageIdsToSearch = [];
      const sharedPageNodeMeta = await this.pageNodeMetaRepo.findByPageId(
        share.pageId,
      );
      const canSearchDescendants =
        share.includeSubPages || sharedPageNodeMeta?.nodeType === 'folder';
      if (canSearchDescendants) {
        const pageList = await this.pageRepo.getPageAndDescendants(
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
          .where('id', 'in', pageIdsToSearch)
          .where('workspaceId', '=', opts.workspaceId);
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
