import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageAccessService } from './page-access/page-access.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { MovePageDto, MovePageToSpaceDto } from './dto/move-page.dto';
import {
  DeletePageDto,
  PageHistoryIdDto,
  PageIdDto,
  PageInfoDto,
  PageRenderSegmentDto,
} from './dto/page.dto';
import { PageHistoryService } from './services/page-history.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SidebarPageDto } from './dto/sidebar-page.dto';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { RecentPageDto } from './dto/recent-page.dto';
import { DuplicatePageDto } from './dto/duplicate-page.dto';
import { DeletedPageDto } from './dto/deleted-page.dto';
import { BatchMovePageDto } from './dto/batch-move-page.dto';
import { PinPageDto } from './dto/pin-page.dto';
import {
  RollbackFolderMigrationDto,
  StartFolderMigrationDto,
} from './dto/folder-migration.dto';
import { UserRole } from '../../common/helpers/types/permission';
import {
  jsonToHtml,
  jsonToMarkdown,
} from '../../collaboration/collaboration.util';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';
import { ShareStaticRendererService } from '../share/share-static-renderer.service';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PageController {
  constructor(
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly pageHistoryService: PageHistoryService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    private readonly shareStaticRendererService: ShareStaticRendererService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getPage(
    @Body() dto: PageInfoDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const includeSpace = dto.includeSpace ?? true;
    const includeContent = dto.includeContent ?? true;
    const includeRendered = dto.includeRendered === true;
    const preferStaticReadonly = dto.preferStaticReadonly === true;
    const requiresFormattedContent = Boolean(dto.format && dto.format !== 'json');
    const shouldLoadRawContent =
      includeContent || includeRendered || preferStaticReadonly || requiresFormattedContent;

    const page = await this.pageService.getPageInfo(dto.pageId, workspace.id, {
      includeSpace,
      includeContent: shouldLoadRawContent,
      includeTextContent: true,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const permissions =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);
    const shouldAttachRendered =
      includeRendered || (preferStaticReadonly && !permissions.canEdit);
    const rendered =
      shouldAttachRendered && page.content
        ? this.shareStaticRendererService.render(page.content)
        : null;
    const hasStaticRenderableOutput = Boolean(
      rendered?.html || rendered?.headHtml,
    );
    const shouldPreferRenderedPayload =
      shouldAttachRendered &&
      hasStaticRenderableOutput &&
      (!includeContent || (preferStaticReadonly && !permissions.canEdit));
    const shouldReturnRawContent =
      requiresFormattedContent ||
      (includeContent && !shouldPreferRenderedPayload) ||
      (shouldAttachRendered && !hasStaticRenderableOutput);

    if (dto.format && dto.format !== 'json' && page.content) {
      const contentOutput =
        dto.format === 'markdown'
          ? jsonToMarkdown(page.content)
          : jsonToHtml(page.content);
      const response = {
        ...page,
        content: contentOutput,
        ...(rendered ? { rendered } : {}),
        permissions,
      };
      return response;
    }

    const response = {
      ...page,
      ...(rendered ? { rendered } : {}),
      permissions,
    };

    if (!shouldReturnRawContent) {
      delete response.content;
    }

    return response;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/render-segment')
  async getPageRenderSegment(
    @Body() dto: PageRenderSegmentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageService.findById(
      dto.pageId,
      true,
      false,
      false,
      workspace.id,
    );

    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    const segment = this.shareStaticRendererService.getSegment(
      page.content,
      dto.cursor,
    );

    if (!segment) {
      throw new BadRequestException('Invalid page segment cursor');
    }

    return segment;
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() createPageDto: CreatePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (createPageDto.parentPageId) {
      const parentPage = await this.pageRepo.findById(
        createPageDto.parentPageId,
        {
          workspaceId: workspace.id,
        },
      );
      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== createPageDto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }

      await this.pageAccessService.validateCanEdit(parentPage, user);
    } else {
      const ability = await this.spaceAbility.createForUser(
        user,
        createPageDto.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const page = await this.pageService.create(
      user.id,
      workspace.id,
      createPageDto,
    );
    const permissions =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);

    this.auditService.log({
      event: AuditEvent.PAGE_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: {
          title: getPageTitle(page.title),
          spaceId: page.spaceId,
        },
      },
    });

    if (
      createPageDto.format &&
      createPageDto.format !== 'json' &&
      page.content
    ) {
      const contentOutput =
        createPageDto.format === 'markdown'
          ? jsonToMarkdown(page.content)
          : jsonToHtml(page.content);
      return { ...page, content: contentOutput, permissions };
    }

    return { ...page, permissions };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() updatePageDto: UpdatePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(updatePageDto.pageId, {
      workspaceId: workspace.id,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const { hasRestriction } = await this.pageAccessService.validateCanEdit(
      page,
      user,
    );

    const updatedPage = await this.pageService.update(
      page,
      updatePageDto,
      user,
    );
    const permissions = { canEdit: true, hasRestriction };

    if (
      updatePageDto.format &&
      updatePageDto.format !== 'json' &&
      updatedPage.content
    ) {
      const contentOutput =
        updatePageDto.format === 'markdown'
          ? jsonToMarkdown(updatedPage.content)
          : jsonToHtml(updatedPage.content);
      return { ...updatedPage, content: contentOutput, permissions };
    }

    return { ...updatedPage, permissions };
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() deletePageDto: DeletePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(deletePageDto.pageId, {
      workspaceId: workspace.id,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);

    if (deletePageDto.permanentlyDelete) {
      // Permanent deletion requires space admin permissions
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException(
          'Only space admins can permanently delete pages',
        );
      }
      await this.pageService.forceDelete(deletePageDto.pageId, workspace.id);

      this.auditService.log({
        event: AuditEvent.PAGE_DELETED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        changes: {
          before: {
            pageId: page.id,
            slugId: page.slugId,
            title: getPageTitle(page.title),
            spaceId: page.spaceId,
          },
        },
      });
    } else {
      await this.pageAccessService.validateCanEdit(page, user);
      await this.pageService.removePage(
        deletePageDto.pageId,
        user.id,
        workspace.id,
      );

      this.auditService.log({
        event: AuditEvent.PAGE_TRASHED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        changes: {
          before: {
            pageId: page.id,
            slugId: page.slugId,
            title: getPageTitle(page.title),
            spaceId: page.spaceId,
          },
        },
      });
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('restore')
  async restore(
    @Body() pageIdDto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(pageIdDto.pageId, {
      workspaceId: workspace.id,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.pageAccessService.validateCanEdit(page, user);

    await this.pageRepo.restorePage(pageIdDto.pageId, workspace.id);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTORED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: {
          title: getPageTitle(page.title),
          spaceId: page.spaceId,
        },
      },
    });

    return this.pageRepo.findById(pageIdDto.pageId, {
      workspaceId: workspace.id,
      includeHasChildren: true,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('recent')
  async getRecentPages(
    @Body() recentPageDto: RecentPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (recentPageDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        recentPageDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.getRecentSpacePages(
        recentPageDto.spaceId,
        user.id,
        pagination,
        workspace.id,
      );
    }

    return this.pageService.getRecentPages(user.id, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('trash')
  async getDeletedPages(
    @Body() deletedPageDto: DeletedPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (deletedPageDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        deletedPageDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.getDeletedSpacePages(
        deletedPageDto.spaceId,
        user.id,
        pagination,
        workspace.id,
      );
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history')
  async getPageHistory(
    @Body() dto: PageIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return this.pageHistoryService.findHistoryByPageId(
      page.id,
      pagination,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history/info')
  async getPageHistoryInfo(
    @Body() dto: PageHistoryIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const history = await this.pageHistoryService.findById(
      dto.historyId,
      workspace.id,
    );
    if (!history) {
      throw new NotFoundException('Page history not found');
    }

    const page = await this.pageRepo.findById(history.pageId, {
      workspaceId: workspace.id,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);
    return history;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/sidebar-pages')
  async getSidebarPages(
    @Body() dto: SidebarPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!dto.spaceId && !dto.pageId) {
      throw new BadRequestException(
        'Either spaceId or pageId must be provided',
      );
    }
    let spaceId = dto.spaceId;

    if (dto.pageId) {
      const page = await this.pageRepo.findById(dto.pageId, {
        workspaceId: workspace.id,
      });
      if (!page) {
        throw new ForbiddenException();
      }

      spaceId = page.spaceId;
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    const spaceCanEdit = ability.can(
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );

    return this.pageService.getSidebarPages(
      spaceId,
      pagination,
      workspace.id,
      dto.pageId,
      user.id,
      spaceCanEdit,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('move-to-space')
  async movePageToSpace(
    @Body() dto: MovePageToSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const movedPage = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!movedPage) {
      throw new NotFoundException('Page to move not found');
    }
    if (movedPage.spaceId === dto.spaceId) {
      throw new BadRequestException('Page is already in this space');
    }

    const abilities = await Promise.all([
      this.spaceAbility.createForUser(user, movedPage.spaceId),
      this.spaceAbility.createForUser(user, dto.spaceId),
    ]);

    if (
      abilities.some((ability) =>
        ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
      )
    ) {
      throw new ForbiddenException();
    }

    await this.pageAccessService.validateCanEdit(movedPage, user);

    const { childPageIds } = await this.pageService.movePageToSpace(
      movedPage,
      dto.spaceId,
      user.id,
    );

    this.auditService.log({
      event: AuditEvent.PAGE_MOVED_TO_SPACE,
      resourceType: AuditResource.PAGE,
      resourceId: movedPage.id,
      spaceId: movedPage.spaceId,
      changes: {
        before: { spaceId: movedPage.spaceId },
        after: { spaceId: dto.spaceId },
      },
      metadata: {
        title: getPageTitle(movedPage.title),
        ...(childPageIds.length > 0 && { childPageIds }),
      },
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('duplicate')
  async duplicatePage(
    @Body() dto: DuplicatePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const copiedPage = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!copiedPage) {
      throw new NotFoundException('Page to copy not found');
    }

    await this.pageAccessService.validateCanView(copiedPage, user);

    // If spaceId is provided, it's a copy to different space
    if (dto.spaceId) {
      const abilities = await Promise.all([
        this.spaceAbility.createForUser(user, copiedPage.spaceId),
        this.spaceAbility.createForUser(user, dto.spaceId),
      ]);

      if (
        abilities.some((ability) =>
          ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
        )
      ) {
        throw new ForbiddenException();
      }

      const duplicatedPage = await this.pageService.duplicatePage(
        copiedPage,
        dto.spaceId,
        user,
      );

      this.auditService.log({
        event: AuditEvent.PAGE_DUPLICATED,
        resourceType: AuditResource.PAGE,
        resourceId: duplicatedPage.id,
        spaceId: dto.spaceId,
        metadata: {
          sourcePageId: copiedPage.id,
          title: getPageTitle(copiedPage.title),
          sourceSpaceId: copiedPage.spaceId,
          targetSpaceId: dto.spaceId,
          ...(duplicatedPage.childPageIds?.length && {
            childPageIds: duplicatedPage.childPageIds,
          }),
        },
      });

      return duplicatedPage;
    } else {
      // If no spaceId, it's a duplicate in same space
      const ability = await this.spaceAbility.createForUser(
        user,
        copiedPage.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      const duplicatedPage = await this.pageService.duplicatePage(
        copiedPage,
        undefined,
        user,
      );

      this.auditService.log({
        event: AuditEvent.PAGE_DUPLICATED,
        resourceType: AuditResource.PAGE,
        resourceId: duplicatedPage.id,
        spaceId: copiedPage.spaceId,
        metadata: {
          sourcePageId: copiedPage.id,
          title: getPageTitle(copiedPage.title),
          ...(duplicatedPage.childPageIds?.length && {
            childPageIds: duplicatedPage.childPageIds,
          }),
        },
      });

      return duplicatedPage;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('move')
  async movePage(
    @Body() dto: MovePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const movedPage = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!movedPage) {
      throw new NotFoundException('Moved page not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      movedPage.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.pageAccessService.validateCanEdit(movedPage, user);

    if (dto.parentPageId && dto.parentPageId !== movedPage.parentPageId) {
      const targetParent = await this.pageRepo.findById(dto.parentPageId, {
        workspaceId: workspace.id,
      });
      if (!targetParent || targetParent.deletedAt) {
        throw new NotFoundException('Target parent page not found');
      }

      await this.pageAccessService.validateCanEdit(targetParent, user);
    }

    return this.pageService.movePage(dto, movedPage);
  }

  @HttpCode(HttpStatus.OK)
  @Post('batch-move')
  async batchMovePages(
    @Body() dto: BatchMovePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageService.batchMovePages(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('folder-migration/start')
  async startFolderMigration(
    @Body() dto: StartFolderMigrationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (![UserRole.OWNER, UserRole.ADMIN].includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageService.startFolderMigration(
      dto.spaceId,
      workspace.id,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('folder-migration/rollback')
  async rollbackFolderMigration(
    @Body() dto: RollbackFolderMigrationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (![UserRole.OWNER, UserRole.ADMIN].includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }

    return this.pageService.rollbackFolderMigration(dto.jobId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('pin')
  async pinPage(
    @Body() dto: PinPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.pageAccessService.validateCanEdit(page, user);

    return this.pageService.setPagePinned(page.id, true, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unpin')
  async unpinPage(
    @Body() dto: PinPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.pageAccessService.validateCanEdit(page, user);

    return this.pageService.setPagePinned(page.id, false, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/breadcrumbs')
  async getPageBreadcrumbs(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);
    return this.pageService.getPageBreadCrumbs(page.id, workspace.id);
  }
}
