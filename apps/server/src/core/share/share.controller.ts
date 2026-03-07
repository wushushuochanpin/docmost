import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { ShareService } from './share.service';
import {
  CreateShareDto,
  RegenerateProtectedShareDto,
  ShareIdDto,
  ShareInfoDto,
  SharePageSegmentDto,
  SharePageIdDto,
  UpdateShareDto,
  VerifyShareAccessDto,
} from './dto/share.dto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { hasLicenseOrEE } from '../../common/helpers';
import { FastifyRequest } from 'fastify';
import { ShareErrorCode } from './share.constants';

@UseGuards(JwtAuthGuard)
@Controller('shares')
export class ShareController {
  constructor(
    private readonly shareService: ShareService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly shareRepo: ShareRepo,
    private readonly pageRepo: PageRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async getShares(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() pagination: PaginationOptions,
  ) {
    return this.shareRepo.getShares(user.id, workspace.id, pagination);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('/page-info')
  async getSharedPageInfo(
    @Body() dto: ShareInfoDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!dto.pageId && !dto.shareId) {
      throw new BadRequestException();
    }

    const shareData = await this.shareService.getSharedPage(dto, workspace.id);

    const sharingAllowed = await this.shareService.isSharingAllowed(
      workspace.id,
      shareData.share.spaceId,
    );
    if (!sharingAllowed) {
      throw this.shareNotFoundException();
    }

    return {
      ...shareData,
      hasLicenseKey: hasLicenseOrEE({
        licenseKey: workspace.licenseKey,
        isCloud: this.environmentService.isCloud(),
        plan: workspace.plan,
      }),
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('/page-segment')
  async getSharedPageSegment(
    @Body() dto: SharePageSegmentDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!dto.pageId || !dto.cursor) {
      throw new BadRequestException();
    }

    const segment = await this.shareService.getSharedPageSegment(
      dto,
      workspace.id,
    );

    return segment;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getShare(
    @Body() dto: ShareIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const share = await this.shareRepo.findById(dto.shareId, {
      workspaceId: workspace.id,
      includeSharedPage: true,
    });

    if (!share) {
      throw this.shareNotFoundException();
    }

    const sharingAllowed = await this.shareService.isSharingAllowed(
      share.workspaceId,
      share.spaceId,
    );
    if (!sharingAllowed) {
      throw this.shareNotFoundException();
    }

    if (!dto.metadataOnly) {
      await this.shareService.assertShareAccess(share, dto.accessToken, {
        hasShareId: true,
      });
    }

    return share;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/for-page')
  async getShareForPage(
    @Body() dto: SharePageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!page) {
      throw this.shareNotFoundException();
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Share)) {
      throw new ForbiddenException();
    }

    return this.shareService.getShareForPage(page.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() createShareDto: CreateShareDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(createShareDto.pageId, {
      workspaceId: workspace.id,
    });

    if (!page || workspace.id !== page.workspaceId) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Share)) {
      throw new ForbiddenException();
    }

    const sharingAllowed = await this.shareService.isSharingAllowed(
      workspace.id,
      page.spaceId,
    );
    if (!sharingAllowed) {
      throw new ForbiddenException('Public sharing is disabled');
    }

    return this.shareService.createShare({
      page,
      authUserId: user.id,
      workspaceId: workspace.id,
      createShareDto,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() updateShareDto: UpdateShareDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const share = await this.shareRepo.findById(updateShareDto.shareId, {
      workspaceId: workspace.id,
    });

    if (!share) {
      throw this.shareNotFoundException();
    }

    const ability = await this.spaceAbility.createForUser(user, share.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Share)) {
      throw new ForbiddenException();
    }

    return this.shareService.updateShare(share.id, updateShareDto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('regenerate-protected')
  async regenerateProtectedShare(
    @Body() dto: RegenerateProtectedShareDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.handleReshare(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reshare')
  async reShare(
    @Body() dto: RegenerateProtectedShareDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.handleReshare(dto, user, workspace);
  }

  private async handleReshare(
    dto: RegenerateProtectedShareDto,
    user: User,
    workspace: Workspace,
  ) {
    const share = await this.shareRepo.findById(dto.shareId, {
      workspaceId: workspace.id,
    });

    if (!share) {
      throw this.shareNotFoundException();
    }

    const ability = await this.spaceAbility.createForUser(user, share.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Share)) {
      throw new ForbiddenException();
    }

    return this.shareService.regenerateProtectedShare({
      shareId: share.id,
      accessMode: dto.accessMode,
      includeSubPages: dto.includeSubPages,
      searchIndexing: dto.searchIndexing,
      keepLink: dto.keepLink,
      expiresInMinutes: dto.expiresInMinutes,
      workspaceId: workspace.id,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() shareIdDto: ShareIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const share = await this.shareRepo.findById(shareIdDto.shareId, {
      workspaceId: workspace.id,
    });

    if (!share) {
      throw this.shareNotFoundException();
    }

    const ability = await this.spaceAbility.createForUser(user, share.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Share)) {
      throw new ForbiddenException();
    }

    await this.shareRepo.deleteShare(share.id, workspace.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('/verify-access')
  async verifyShareAccess(
    @Body() dto: VerifyShareAccessDto,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    const ip = req.ip ?? req.raw?.socket?.remoteAddress ?? 'unknown';
    const rateLimitKey = `${workspace.id}:${dto.shareId}:${ip}`;
    this.shareService.assertVerifyRateLimit(rateLimitKey);

    const share = await this.shareRepo.findById(dto.shareId, {
      workspaceId: workspace.id,
    });
    if (!share) {
      throw this.shareNotFoundException();
    }

    const sharingAllowed = await this.shareService.isSharingAllowed(
      workspace.id,
      share.spaceId,
    );
    if (!sharingAllowed) {
      throw this.shareNotFoundException();
    }

    const verified = await this.shareService.verifyProtectedShareAccess(
      share.id,
      dto.password,
      workspace.id,
    );
    this.shareService.clearVerifyRateLimit(rateLimitKey);
    return verified;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('/tree')
  async getSharePageTree(
    @Body() dto: ShareIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const treeData = await this.shareService.getShareTree(
      dto.shareId,
      workspace.id,
    );

    const sharingAllowed = await this.shareService.isSharingAllowed(
      workspace.id,
      treeData.share.spaceId,
    );
    if (!sharingAllowed) {
      throw this.shareNotFoundException();
    }

    await this.shareService.assertShareAccess(treeData.share, dto.accessToken, {
      hasShareId: true,
    });

    return {
      ...treeData,
      hasLicenseKey: hasLicenseOrEE({
        licenseKey: workspace.licenseKey,
        isCloud: this.environmentService.isCloud(),
        plan: workspace.plan,
      }),
    };
  }

  private shareNotFoundException() {
    return new NotFoundException({
      code: ShareErrorCode.ShareNotFound,
      message: 'Share not found',
    });
  }
}
