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

const PROTECTED_SHARE_PASSWORD_LENGTH = 8;
const PROTECTED_SHARE_PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export interface SharedPageResponsePage {
  id: string;
  slugId: string;
  title: string;
  excerpt?: string;
  content?: unknown;
}

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
  ) {}

  async getShareTree(shareId: string, workspaceId: string) {
    const share = await this.shareRepo.findById(shareId, { workspaceId });
    if (!share) {
      throw this.shareNotFoundException();
    }

    if (share.includeSubPages) {
      const pageList = await this.pageRepo.getPageAndDescendants(share.pageId, {
        includeContent: false,
        workspaceId,
      });

      return { share, pageTree: pageList };
    } else {
      return { share, pageTree: [] };
    }
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
      const shares = await this.shareRepo.findByPageId(page.id, { workspaceId });
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
      if (
        updateShareDto.accessMode ||
        updateShareDto.expiresInMinutes
      ) {
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

    page.content = await this.updatePublicAttachments(page);
    const rendered = this.shareStaticRendererService.render(page.content);
    const hasStaticRenderableOutput = Boolean(rendered.html || rendered.headHtml);
    const responsePage: SharedPageResponsePage = {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      excerpt: this.buildShareExcerpt(page.textContent),
      ...(hasStaticRenderableOutput ? {} : { content: page.content }),
    };

    return {
      page: responsePage,
      share,
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
      return undefined;
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
    const spaceDisabled = (result.spaceSettings as any)?.sharing?.disabled === true;

    return !workspaceDisabled && !spaceDisabled;
  }

  async updatePublicAttachments(page: Page): Promise<any> {
    const prosemirrorJson = getProsemirrorContent(page.content);
    const attachmentIds = getAttachmentIds(prosemirrorJson);
    const attachmentMap = new Map<string, string>();

    await Promise.all(
      attachmentIds.map(async (attachmentId: string) => {
        const token = await this.tokenService.generateAttachmentToken({
          attachmentId,
          pageId: page.id,
          workspaceId: page.workspaceId,
        });
        attachmentMap.set(attachmentId, token);
      }),
    );

    const doc = jsonToNode(prosemirrorJson);

    doc?.descendants((node: Node) => {
      if (!isAttachmentNode(node.type.name)) return;

      const attachmentId = node.attrs.attachmentId;
      const token = attachmentMap.get(attachmentId);
      if (!token) return;

      updateAttachmentAttr(node, 'src', token);
      updateAttachmentAttr(node, 'url', token);
    });

    const removeCommentMarks = removeMarkTypeFromDoc(doc, 'comment');
    return removeCommentMarks.toJSON();
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

    if (!share.includeSubPages) {
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
