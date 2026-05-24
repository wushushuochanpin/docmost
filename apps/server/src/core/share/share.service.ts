import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CreateShareDto,
  SharePageSegmentDto,
  UpdateShareDto,
  ShareInfoDto,
} from './dto/share.dto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  comparePasswordHash,
  hashPassword,
  nanoIdGen,
} from '../../common/helpers';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { TokenService } from '../auth/services/token.service';
import { jsonToNode } from '../../collaboration/collaboration.util';
import {
  getAttachmentIds,
  getProsemirrorContent,
  isAttachmentNode,
  removeMarkTypeFromDoc,
} from '../../common/helpers/prosemirror/utils';
import { Node } from '@tiptap/pm/model';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { updateAttachmentAttr } from './share.util';
import { Page, Share } from '@docmost/db/types/entity.types';
import { validate as isValidUUID } from 'uuid';
import { sql } from 'kysely';
import { JwtShareAccessPayload, JwtType } from '../auth/dto/jwt-payload';
import {
  MAX_PROTECTED_SHARE_TTL_MINUTES,
  MIN_PROTECTED_SHARE_TTL_MINUTES,
  ShareAccessMode,
  ShareErrorCode,
  ShareLegacyRouteMode,
} from './share.constants';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  ShareVerifyRateLimitedError,
  ShareVerifyRateLimiter,
} from './share-rate-limit';
import { randomInt } from 'crypto';
import { ShareStaticRendererService } from './share-static-renderer.service';
import { PageNodeMetaRepo } from '@docmost/db/repos/page/page-node-meta.repo';
import { canUseStaticShareRender } from './share-rendered.util';
import { TransclusionService } from '../page/transclusion/transclusion.service';
import { TransclusionLookup } from '../page/transclusion/transclusion.types';

const PROTECTED_SHARE_PASSWORD_LENGTH = 8;
const PROTECTED_SHARE_PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export interface SharedPageResponsePage {
  id: string;
  slugId: string;
  title: string;
  nodeType: 'file' | 'folder';
  excerpt?: string;
  content?: unknown;
}

type SharedPageTreeResponse = Awaited<
  ReturnType<PageRepo['getPageAndDescendants']>
>;

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);
  private readonly verifyRateLimiter = new ShareVerifyRateLimiter();

  constructor(
    private readonly shareRepo: ShareRepo,
    private readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly tokenService: TokenService,
    private readonly environmentService: EnvironmentService,
    private readonly shareStaticRendererService: ShareStaticRendererService,
    private readonly pageNodeMetaRepo: PageNodeMetaRepo,
    private readonly transclusionService: TransclusionService,
  ) {}

  async getShareTree(shareId: string, workspaceId: string) {
    const share = await this.shareRepo.findById(shareId, { workspaceId });
    if (!share) {
      throw this.shareNotFoundException();
    }

    const sharedPageNodeType = await this.getPageNodeType(share.pageId);
    const pageTree = await this.getSharedPageTreePayload(
      share.pageId,
      workspaceId,
      share.includeSubPages,
      sharedPageNodeType,
    );

    return { share, pageTree: pageTree ?? [] };
  }

  async createShare(opts: {
    authUserId: string;
    workspaceId: string;
    page: Page;
    createShareDto: CreateShareDto;
  }) {
    const { authUserId, workspaceId, page, createShareDto } = opts;

    try {
      const requestedAccessMode = this.getAccessMode(createShareDto.accessMode);
      const shares = await this.shareRepo.findByPageId(page.id, {
        workspaceId,
      });
      if (shares) {
        if (
          requestedAccessMode !== shares.accessMode ||
          requestedAccessMode === ShareAccessMode.PasswordExpiring
        ) {
          return this.regenerateProtectedShare({
            shareId: shares.id,
            workspaceId,
            accessMode: requestedAccessMode,
            includeSubPages: createShareDto.includeSubPages,
            searchIndexing: createShareDto.searchIndexing,
            expiresInMinutes: createShareDto.expiresInMinutes,
          });
        }

        const needsPreferenceUpdate =
          (typeof createShareDto.includeSubPages === 'boolean' &&
            createShareDto.includeSubPages !== shares.includeSubPages) ||
          (typeof createShareDto.searchIndexing === 'boolean' &&
            createShareDto.searchIndexing !== shares.searchIndexing);

        if (needsPreferenceUpdate) {
          return this.shareRepo.updateShare(
            {
              includeSubPages: createShareDto.includeSubPages,
              searchIndexing: createShareDto.searchIndexing,
            },
            shares.id,
            { workspaceId },
          );
        }

        return shares;
      }

      const protectedShareData = await this.buildProtectedShareData({
        accessMode: requestedAccessMode,
        expiresInMinutes: createShareDto.expiresInMinutes,
      });

      const createdShare = await this.shareRepo.insertShare({
        key: nanoIdGen().toLowerCase(),
        pageId: page.id,
        accessMode: requestedAccessMode,
        passwordHash: protectedShareData.passwordHash,
        expiresAt: protectedShareData.expiresAt,
        securityVersion: 1,
        includeSubPages: createShareDto.includeSubPages ?? false,
        searchIndexing: createShareDto.searchIndexing ?? false,
        creatorId: authUserId,
        spaceId: page.spaceId,
        workspaceId,
      });

      return {
        ...createdShare,
        generatedPassword: protectedShareData.generatedPassword,
      };
    } catch (err) {
      this.logger.error(err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new BadRequestException('Failed to share page');
    }
  }

  async updateShare(
    shareId: string,
    updateShareDto: UpdateShareDto,
    workspaceId?: string,
  ) {
    try {
      // Keep security-sensitive changes in explicit rotate/regenerate flow.
      if (updateShareDto.accessMode || updateShareDto.expiresInMinutes) {
        throw this.shareRegenerateRequiredException();
      }

      return this.shareRepo.updateShare(
        {
          includeSubPages: updateShareDto.includeSubPages,
          searchIndexing: updateShareDto.searchIndexing,
        },
        shareId,
        {
          workspaceId,
        },
      );
    } catch (err) {
      this.logger.error(err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new BadRequestException('Failed to update share');
    }
  }

  async regenerateProtectedShare(opts: {
    shareId: string;
    workspaceId: string;
    accessMode: ShareAccessMode;
    includeSubPages?: boolean;
    searchIndexing?: boolean;
    keepLink?: boolean;
    expiresInMinutes?: number;
  }) {
    const {
      shareId,
      workspaceId,
      accessMode,
      includeSubPages,
      searchIndexing,
      keepLink,
      expiresInMinutes,
    } = opts;

    const share = await this.shareRepo.findById(shareId, { workspaceId });
    if (!share) {
      throw this.shareNotFoundException();
    }

    const { passwordHash, expiresAt, generatedPassword } =
      await this.buildProtectedShareData({
        accessMode,
        expiresInMinutes,
      });

    const canKeepCurrentLink =
      keepLink === true &&
      this.isProtectedShare(share) &&
      accessMode === ShareAccessMode.Public;

    const reshared = await this.shareRepo.updateShare(
      {
        ...(canKeepCurrentLink ? {} : { key: nanoIdGen().toLowerCase() }),
        passwordHash,
        expiresAt,
        securityVersion: (share.securityVersion ?? 1) + 1,
        accessMode,
        includeSubPages: includeSubPages ?? share.includeSubPages,
        searchIndexing: searchIndexing ?? share.searchIndexing,
      },
      share.id,
      {
        workspaceId,
      },
    );

    return {
      ...reshared,
      generatedPassword,
    };
  }

  async verifyProtectedShareAccess(
    shareId: string,
    password: string,
    workspaceId: string,
  ) {
    const share = await this.shareRepo.findById(shareId, {
      workspaceId,
      includeSensitive: true,
    });
    if (!share) {
      throw this.shareNotFoundException();
    }

    if (!this.isProtectedShare(share)) {
      throw this.shareAccessModeForbiddenException();
    }

    this.assertNotExpired(share);

    if (!share.passwordHash) {
      throw this.sharePasswordInvalidException();
    }

    const isValidPassword = await comparePasswordHash(
      password,
      share.passwordHash,
    );

    if (!isValidPassword) {
      throw this.sharePasswordInvalidException();
    }

    const expiresInSeconds = Math.max(
      1,
      Math.floor((share.expiresAt.getTime() - Date.now()) / 1000),
    );

    const accessToken = await this.tokenService.generateShareAccessToken({
      shareId: share.id,
      workspaceId: share.workspaceId,
      securityVersion: share.securityVersion ?? 1,
      expiresIn: expiresInSeconds,
    });

    return {
      accessToken,
      expiresAt: share.expiresAt,
    };
  }

  async assertShareAccess(
    share: Pick<
      Share,
      'id' | 'workspaceId' | 'accessMode' | 'expiresAt' | 'securityVersion'
    >,
    accessToken?: string,
    opts?: {
      hasShareId?: boolean;
    },
  ) {
    if (!this.isProtectedShare(share)) {
      return;
    }

    // Prevent weak pageId-only access for protected shares.
    if (
      !opts?.hasShareId &&
      this.environmentService.getShareLegacyRouteMode() !==
        ShareLegacyRouteMode.Observe
    ) {
      throw this.shareNotFoundException();
    }

    this.assertNotExpired(share);

    if (!accessToken) {
      throw this.sharePasswordRequiredException();
    }

    let payload: JwtShareAccessPayload;
    try {
      payload = (await this.tokenService.verifyJwt(
        accessToken,
        JwtType.SHARE_ACCESS,
      )) as JwtShareAccessPayload;
    } catch (err) {
      throw this.shareAccessTokenInvalidException();
    }

    if (
      payload.shareId !== share.id ||
      payload.workspaceId !== share.workspaceId ||
      payload.securityVersion !== (share.securityVersion ?? 1)
    ) {
      throw this.shareAccessTokenInvalidException();
    }
  }

  async getSharedPage(dto: ShareInfoDto, workspaceId: string) {
    if (!dto.pageId) {
      throw new BadRequestException('pageId is required');
    }

    const share = await this.getShareForPage(dto.pageId, workspaceId, {
      shareId: dto.shareId,
    });

    if (!share) {
      throw this.shareNotFoundException();
    }

    const sharingAllowed = await this.isSharingAllowed(
      share.workspaceId,
      share.spaceId,
    );
    if (!sharingAllowed) {
      throw this.shareNotFoundException();
    }

    await this.assertShareAccess(share, dto.accessToken, {
      hasShareId: Boolean(dto.shareId),
    });

    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId,
      includeContent: true,
      includeTextContent: true,
    });

    if (!page || page.deletedAt) {
      throw this.shareNotFoundException();
    }

    const nodeType = await this.getPageNodeType(page.id);
    const responsePage: SharedPageResponsePage = {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      nodeType,
      excerpt: this.buildShareExcerpt(page.textContent),
    };
    const sharedRootNodeType =
      page.id === share.pageId
        ? nodeType
        : await this.getPageNodeType(share.pageId);
    const pageTree = await this.getSharedPageTreePayload(
      share.pageId,
      workspaceId,
      share.includeSubPages,
      sharedRootNodeType,
    );

    if (nodeType === 'folder') {
      return {
        page: responsePage,
        share,
        pageTree,
        rendered: null,
      };
    }

    page.content = await this.updatePublicAttachments(page);
    const rendered = this.shareStaticRendererService.render(page.content);
    const hasStaticRenderableOutput = canUseStaticShareRender(rendered);

    return {
      page: {
        ...responsePage,
        ...(hasStaticRenderableOutput ? {} : { content: page.content }),
      },
      share,
      pageTree,
      rendered,
    };
  }

  async getSharedPageSegment(dto: SharePageSegmentDto, workspaceId: string) {
    const share = await this.getShareForPage(dto.pageId, workspaceId, {
      shareId: dto.shareId,
    });

    if (!share) {
      throw this.shareNotFoundException();
    }

    const sharingAllowed = await this.isSharingAllowed(
      share.workspaceId,
      share.spaceId,
    );
    if (!sharingAllowed) {
      throw this.shareNotFoundException();
    }

    await this.assertShareAccess(share, dto.accessToken, {
      hasShareId: Boolean(dto.shareId),
    });

    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId,
      includeContent: true,
    });

    if (!page || page.deletedAt) {
      throw this.shareNotFoundException();
    }

    page.content = await this.updatePublicAttachments(page);
    const segment = this.shareStaticRendererService.getSegment(
      page.content,
      dto.cursor,
    );

    if (!segment) {
      throw new BadRequestException('Invalid share page segment cursor');
    }

    return segment;
  }

  private buildShareExcerpt(textContent?: string) {
    const normalized = textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!normalized) {
      return '';
    }

    if (normalized.length <= 160) {
      return normalized;
    }

    return `${normalized.slice(0, 159).trimEnd()}…`;
  }

  private async getSharedPageTreePayload(
    sharedRootPageId: string,
    workspaceId: string,
    includeSubPages: boolean,
    sharedRootNodeType?: 'file' | 'folder',
  ): Promise<SharedPageTreeResponse | undefined> {
    const effectiveNodeType =
      sharedRootNodeType ?? (await this.getPageNodeType(sharedRootPageId));

    if (!includeSubPages && effectiveNodeType !== 'folder') {
      return undefined;
    }

    return this.pageRepo.getPageAndDescendants(sharedRootPageId, {
      includeContent: false,
      workspaceId,
    });
  }

  async getShareForPage(
    pageId: string,
    workspaceId: string,
    opts?: {
      shareId?: string;
    },
  ) {
    if (opts?.shareId) {
      return this.getShareForPageByShareId(pageId, workspaceId, opts.shareId);
    }

    // here we try to check if a page was shared directly or if it inherits the share from its closest shared ancestor
    const share = await this.db
      .withRecursive('page_hierarchy', (cte) =>
        cte
          .selectFrom('pages')
          .leftJoin('shares', 'shares.pageId', 'pages.id')
          .select([
            'pages.id',
            'pages.slugId',
            'pages.title',
            'pages.icon',
            'pages.parentPageId',
            sql`0`.as('level'),
            'shares.id as shareId',
            'shares.key as shareKey',
            'shares.accessMode',
            'shares.expiresAt',
            'shares.securityVersion',
            'shares.includeSubPages',
            'shares.searchIndexing',
            'shares.creatorId',
            'shares.spaceId',
            'shares.workspaceId',
            'shares.createdAt',
            'shares.updatedAt',
          ])
          .where(isValidUUID(pageId) ? 'pages.id' : 'pages.slugId', '=', pageId)
          .where('pages.workspaceId', '=', workspaceId)
          .where('pages.deletedAt', 'is', null)
          .unionAll(
            (union) =>
              union
                .selectFrom('pages as p')
                .innerJoin('page_hierarchy as ph', 'ph.parentPageId', 'p.id')
                .leftJoin('shares as s', 's.pageId', 'p.id')
                .select([
                  'p.id',
                  'p.slugId',
                  'p.title',
                  'p.icon',
                  'p.parentPageId',
                  sql`ph.level + 1`.as('level'),
                  's.id as shareId',
                  's.key as shareKey',
                  's.accessMode',
                  's.expiresAt',
                  's.securityVersion',
                  's.includeSubPages',
                  's.searchIndexing',
                  's.creatorId',
                  's.spaceId',
                  's.workspaceId',
                  's.createdAt',
                  's.updatedAt',
                ])
                .where('p.deletedAt', 'is', null)
                .where('p.workspaceId', '=', workspaceId)
                .where(sql`ph.share_id`, 'is', null) // stop if share found
                .where(sql`ph.level`, '<', sql`25`), // prevent loop
          ),
      )
      .selectFrom('page_hierarchy')
      .selectAll()
      .where('shareId', 'is not', null)
      .limit(1)
      .executeTakeFirst();

    if (!share || share.workspaceId !== workspaceId) {
      return undefined;
    }

    if ((share.level as number) > 0 && !share.includeSubPages) {
      const sharedPageNodeType = await this.getPageNodeType(share.id);
      if (sharedPageNodeType !== 'folder') {
        return undefined;
      }
    }

    return {
      id: share.shareId,
      key: share.shareKey,
      accessMode: share.accessMode,
      expiresAt: share.expiresAt,
      securityVersion: share.securityVersion,
      includeSubPages: share.includeSubPages,
      searchIndexing: share.searchIndexing,
      pageId: share.id,
      creatorId: share.creatorId,
      spaceId: share.spaceId,
      workspaceId: share.workspaceId,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      level: share.level,
      sharedPage: {
        id: share.id,
        slugId: share.slugId,
        title: share.title,
        icon: share.icon,
      },
    };
  }

  async getShareAncestorPage(
    ancestorPageId: string,
    childPageId: string,
  ): Promise<any> {
    let ancestor = null;
    try {
      ancestor = await this.db
        .withRecursive('page_ancestors', (db) =>
          db
            .selectFrom('pages')
            .select([
              'id',
              'slugId',
              'title',
              'parentPageId',
              'spaceId',
              (eb) =>
                eb
                  .case()
                  .when(eb.ref('id'), '=', ancestorPageId)
                  .then(true)
                  .else(false)
                  .end()
                  .as('found'),
            ])
            .where(isValidUUID(childPageId) ? 'id' : 'slugId', '=', childPageId)
            .unionAll((exp) =>
              exp
                .selectFrom('pages as p')
                .select([
                  'p.id',
                  'p.slugId',
                  'p.title',
                  'p.parentPageId',
                  'p.spaceId',
                  (eb) =>
                    eb
                      .case()
                      .when(eb.ref('p.id'), '=', ancestorPageId)
                      .then(true)
                      .else(false)
                      .end()
                      .as('found'),
                ])
                .innerJoin('page_ancestors as pa', 'pa.parentPageId', 'p.id')
                // Continue recursing only when the target ancestor hasn't been found on that branch.
                .where('pa.found', '=', false),
            ),
        )
        .selectFrom('page_ancestors')
        .selectAll()
        .where('found', '=', true)
        .limit(1)
        .executeTakeFirst();
    } catch (err) {
      // empty
    }

    return ancestor;
  }

  /**
   * Resolve transclusion content for a public share viewer. Each requested
   * source page must itself be reachable via the share graph (its own share
   * or a shared ancestor with `includeSubPages`), in the same workspace as
   * the requesting share, with sharing allowed and no restricted ancestors.
   * Sources that don't qualify come back as `no_access` so the editor renders
   * the existing placeholder. The viewer's personal permissions are
   * intentionally ignored — share-served content is gated only by the share
   * graph.
   */
  async lookupTransclusionForShare(
    shareId: string,
    references: Array<{ sourcePageId: string; transclusionId: string }>,
    workspaceId: string,
  ): Promise<{ items: TransclusionLookup[] }> {
    const share = await this.shareRepo.findById(shareId);
    if (!share || share.workspaceId !== workspaceId) {
      throw new NotFoundException('Share not found');
    }
    const sharingAllowed = await this.isSharingAllowed(
      workspaceId,
      share.spaceId,
    );
    if (!sharingAllowed) {
      throw new NotFoundException('Share not found');
    }

    const candidatePageIds = Array.from(
      new Set(references.map((r) => r.sourcePageId)),
    );

    // TODO: Reduce DB round trips at scale by replacing the per-page chain
    // with bulk repo methods that take all candidate pageIds at once:
    //   - shareRepo.getSharesForPages(pageIds, workspaceId): Map<pageId, share>
    //   - pagePermissionRepo.filterRestrictedPageIds(pageIds): Set<pageId>
    //   - isSharingAllowed for the distinct spaceIds in one query
    // Brings per-request trip count from ~2N+1 (parallel) to 3 (constant)
    // for N unique candidate pages. Worth doing if profiling ever flags it.

    // Most candidates will share the host share's space, so cache by spaceId
    // and seed with the host space we just verified. Stores in-flight
    // promises so concurrent chains de-dupe at the request boundary.
    const sharingAllowedCache = new Map<string, Promise<boolean>>();
    sharingAllowedCache.set(share.spaceId, Promise.resolve(true));
    const isSharingAllowedFor = (spaceId: string) => {
      const cached = sharingAllowedCache.get(spaceId);
      if (cached) return cached;
      const p = this.isSharingAllowed(workspaceId, spaceId);
      sharingAllowedCache.set(spaceId, p);
      return p;
    };

    // Per-page chains run in parallel; wall time is the slowest chain, not
    // the sum. Each chain still does its 2–3 queries sequentially because
    // each step gates the next.
    const accessibleResults = await Promise.all(
      candidatePageIds.map(async (pageId) => {
        const sourceShare = await this.getShareForPage(pageId, workspaceId);
        if (!sourceShare) return null;
        if (!(await isSharingAllowedFor(sourceShare.spaceId))) return null;
        const restricted =
          await this.pagePermissionRepo.hasRestrictedAncestor(pageId);
        if (restricted) return null;
        return pageId;
      }),
    );
    const accessibleSet = new Set<string>(
      accessibleResults.filter((id): id is string => id !== null),
    );

    const { items } = await this.transclusionService.lookupWithAccessSet(
      references,
      accessibleSet,
      workspaceId,
    );

    // Sanitize each item's content for public delivery
    // generate per-attachment tokens scoped to the source page
    // and strip comment marks.
    const tokenized = await Promise.all(
      items.map(async (item) => {
        if ('status' in item) return item;
        const doc = await this.prepareContentForShare(
          item.content,
          item.sourcePageId,
          workspaceId,
        );
        return { ...item, content: doc?.toJSON() ?? item.content };
      }),
    );

    // Collapse `not_found` to `no_access` for share viewers so the response
    // can't be used to tell "page is shared but transclusion id doesn't
    // match" from "page isn't shared at all".
    const sanitized = tokenized.map((item) =>
      'status' in item && item.status === 'not_found'
        ? {
            sourcePageId: item.sourcePageId,
            transclusionId: item.transclusionId,
            status: 'no_access' as const,
          }
        : item,
    );

    return { items: sanitized };
  }

  async isSharingAllowed(
    workspaceId: string,
    spaceId: string,
  ): Promise<boolean> {
    const result = await this.db
      .selectFrom('workspaces')
      .innerJoin('spaces', 'spaces.workspaceId', 'workspaces.id')
      .select([
        'workspaces.settings as workspaceSettings',
        'spaces.settings as spaceSettings',
      ])
      .where('workspaces.id', '=', workspaceId)
      .where('spaces.id', '=', spaceId)
      .executeTakeFirst();

    if (!result) return false;

    const workspaceDisabled =
      (result.workspaceSettings as any)?.sharing?.disabled === true;
    const spaceDisabled =
      (result.spaceSettings as any)?.sharing?.disabled === true;

    return !workspaceDisabled && !spaceDisabled;
  }

  async updatePublicAttachments(page: Page): Promise<any> {
    const doc = await this.prepareContentForShare(
      page.content,
      page.id,
      page.workspaceId,
    );
    return doc?.toJSON() ?? page.content;
  }

  /**
   * Prepare a ProseMirror JSON doc for delivery to a public share viewer.
   * Performs the two transforms required by the share threat model:
   *
   * 1. Mint a per-attachment public token scoped to `attachmentOwnerPageId`
   *    and rewrite each attachment node's `src`/`url` to the public form
   *    (`/files/public/...?jwt=`). The receiver enforces
   *    `attachment.pageId === token.pageId`, which is why the owner page id
   *    has to be passed in explicitly: the host page for direct shared
   *    content, the source page for transcluded source-block content
   *    (attachments in a sync block were uploaded onto the source page).
   *
   * 2. Strip `comment` marks. Comments are internal-team metadata and must
   *    not leak structure (existence, location, count, resolved state, or
   *    comment ids) to public viewers.
   *
   * Both share-content paths — the host page (`updatePublicAttachments`) and
   * the share-scoped transclusion lookup (`lookupTransclusionForShare`) —
   * call into this single helper so the two paths can never drift on
   * sanitization rules.
   */
  private async prepareContentForShare(
    content: unknown,
    attachmentOwnerPageId: string,
    workspaceId: string,
  ): Promise<Node | null> {
    const pmJson = getProsemirrorContent(content);
    const attachmentIds = getAttachmentIds(pmJson);

    const tokenMap = new Map<string, string>();
    await Promise.all(
      attachmentIds.map(async (attachmentId: string) => {
        const token = await this.tokenService.generateAttachmentToken({
          attachmentId,
          pageId: attachmentOwnerPageId,
          workspaceId,
        });
        tokenMap.set(attachmentId, token);
      }),
    );

    const doc = jsonToNode(pmJson);
    doc?.descendants((node: Node) => {
      if (!isAttachmentNode(node.type.name)) return;
      const token = tokenMap.get(node.attrs.attachmentId);
      if (!token) return;
      updateAttachmentAttr(node, 'src', token);
      updateAttachmentAttr(node, 'url', token);
    });

    return doc ? removeMarkTypeFromDoc(doc, 'comment') : null;
  }

  private async getShareForPageByShareId(
    pageId: string,
    workspaceId: string,
    shareId: string,
  ) {
    const share = await this.shareRepo.findById(shareId, {
      workspaceId,
    });

    if (!share) {
      return undefined;
    }

    const requestedPage = await this.pageRepo.findById(pageId, {
      workspaceId,
      includeContent: false,
    });

    if (!requestedPage || requestedPage.deletedAt) {
      return undefined;
    }

    const sharedPage = await this.pageRepo.findById(share.pageId, {
      workspaceId,
      includeContent: false,
    });

    if (!sharedPage || sharedPage.deletedAt) {
      return undefined;
    }

    if (requestedPage.id === share.pageId) {
      return this.toShareForPage(share, sharedPage, 0);
    }

    const sharedPageNodeType = await this.getPageNodeType(share.pageId);
    if (!share.includeSubPages && sharedPageNodeType !== 'folder') {
      return undefined;
    }

    const isDescendant = await this.getShareAncestorPage(share.pageId, pageId);
    if (!isDescendant) {
      return undefined;
    }

    return this.toShareForPage(share, sharedPage, 1);
  }

  private toShareForPage(share: Share, sharedPage: Page, level: number) {
    return {
      id: share.id,
      key: share.key,
      accessMode: share.accessMode,
      expiresAt: share.expiresAt,
      securityVersion: share.securityVersion,
      includeSubPages: share.includeSubPages,
      searchIndexing: share.searchIndexing,
      pageId: share.pageId,
      creatorId: share.creatorId,
      spaceId: share.spaceId,
      workspaceId: share.workspaceId,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      level,
      sharedPage: {
        id: sharedPage.id,
        slugId: sharedPage.slugId,
        title: sharedPage.title,
        icon: sharedPage.icon,
      },
    };
  }

  private getAccessMode(accessMode?: string): ShareAccessMode {
    if (!accessMode) {
      return ShareAccessMode.Public;
    }

    return accessMode as ShareAccessMode;
  }

  private async buildProtectedShareData(opts: {
    accessMode: ShareAccessMode;
    expiresInMinutes?: number;
  }): Promise<{
    passwordHash: string | null;
    expiresAt: Date | null;
    generatedPassword: string | null;
  }> {
    if (opts.accessMode !== ShareAccessMode.PasswordExpiring) {
      return {
        passwordHash: null,
        expiresAt: null,
        generatedPassword: null,
      };
    }

    if (
      !opts.expiresInMinutes ||
      opts.expiresInMinutes < MIN_PROTECTED_SHARE_TTL_MINUTES ||
      opts.expiresInMinutes > MAX_PROTECTED_SHARE_TTL_MINUTES
    ) {
      throw this.shareTtlInvalidException();
    }

    const generatedPassword = this.generateProtectedSharePassword();
    const passwordHash = await hashPassword(generatedPassword);
    const expiresAt = new Date(Date.now() + opts.expiresInMinutes * 60 * 1000);

    return {
      passwordHash,
      expiresAt,
      generatedPassword,
    };
  }

  private generateProtectedSharePassword(): string {
    let password = '';

    for (let i = 0; i < PROTECTED_SHARE_PASSWORD_LENGTH; i += 1) {
      const nextIndex = randomInt(0, PROTECTED_SHARE_PASSWORD_CHARSET.length);
      password += PROTECTED_SHARE_PASSWORD_CHARSET[nextIndex];
    }

    return password;
  }

  private async getPageNodeType(pageId: string): Promise<'file' | 'folder'> {
    const nodeMeta = await this.pageNodeMetaRepo.findByPageId(pageId);
    return nodeMeta?.nodeType === 'folder' ? 'folder' : 'file';
  }

  private assertNotExpired(
    share: Pick<Share, 'accessMode' | 'expiresAt'>,
  ): void {
    if (!this.isProtectedShare(share)) {
      return;
    }

    if (!share.expiresAt || share.expiresAt.getTime() <= Date.now()) {
      throw this.shareExpiredException();
    }
  }

  private isProtectedShare(
    share: Pick<Share, 'accessMode'> | { accessMode?: string },
  ): boolean {
    return share?.accessMode === ShareAccessMode.PasswordExpiring;
  }

  private shareNotFoundException() {
    return new NotFoundException({
      code: ShareErrorCode.ShareNotFound,
      message: 'Share not found',
    });
  }

  private shareExpiredException() {
    return new GoneException({
      code: ShareErrorCode.ShareExpired,
      message: 'Share link has expired',
    });
  }

  private sharePasswordRequiredException() {
    return new UnauthorizedException({
      code: ShareErrorCode.SharePasswordRequired,
      message: 'Share password required',
    });
  }

  private sharePasswordInvalidException() {
    return new UnauthorizedException({
      code: ShareErrorCode.SharePasswordInvalid,
      message: 'Share password invalid',
    });
  }

  private shareAccessTokenInvalidException() {
    return new UnauthorizedException({
      code: ShareErrorCode.ShareAccessTokenInvalid,
      message: 'Share access token invalid',
    });
  }

  private shareAccessModeForbiddenException() {
    return new ForbiddenException({
      code: ShareErrorCode.ShareAccessModeForbidden,
      message: 'Protected share mode required',
    });
  }

  private shareTtlInvalidException() {
    return new BadRequestException({
      code: ShareErrorCode.ShareTtlInvalid,
      message: 'Share expiry must be between 1 and 30 minutes',
    });
  }

  private shareRegenerateRequiredException() {
    return new ConflictException({
      code: ShareErrorCode.ShareRegenerateRequired,
      message: 'Please regenerate protected share link',
    });
  }

  assertVerifyRateLimit(key: string) {
    try {
      this.verifyRateLimiter.assertAllowed(key);
    } catch (err) {
      if (err instanceof ShareVerifyRateLimitedError) {
        throw this.shareVerifyRateLimitedException();
      }
      throw err;
    }
  }

  clearVerifyRateLimit(key: string) {
    this.verifyRateLimiter.clear(key);
  }

  private shareVerifyRateLimitedException() {
    return new HttpException(
      {
        code: ShareErrorCode.ShareVerifyRateLimited,
        message: 'Too many verification attempts. Please try later.',
      },
      429,
    );
  }
}
