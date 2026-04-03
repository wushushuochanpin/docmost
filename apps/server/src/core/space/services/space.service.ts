import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSpaceDto } from '../dto/create-space.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { Space, User } from '@docmost/db/types/entity.types';
import { UpdateSpaceDto } from '../dto/update-space.dto';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { SpaceMemberService } from './space-member.service';
import { SpaceRole } from '../../../common/helpers/types/permission';
import { QueueJob, QueueName } from 'src/integrations/queue/constants';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { CursorPaginationResult } from '@docmost/db/pagination/cursor-pagination';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { LicenseCheckService } from '../../../integrations/environment/license-check.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import { diffAuditTrackedFields } from '../../../common/helpers';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { SpaceSidebarCategoryRepo } from '@docmost/db/repos/space/space-sidebar-category.repo';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { SpaceSidebarCategory } from '@docmost/db/types/entity.types';

@Injectable()
export class SpaceService {
  private static readonly MAX_SIDEBAR_CATEGORIES = 20;

  constructor(
    private spaceRepo: SpaceRepo,
    private spaceSidebarCategoryRepo: SpaceSidebarCategoryRepo,
    private spaceMemberService: SpaceMemberService,
    private shareRepo: ShareRepo,
    private workspaceRepo: WorkspaceRepo,
    private licenseCheckService: LicenseCheckService,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async createSpace(
    authUser: User,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
  ): Promise<Space> {
    let space = null;

    await executeTx(
      this.db,
      async (trx) => {
        space = await this.create(
          authUser.id,
          workspaceId,
          createSpaceDto,
          trx,
        );

        await this.spaceMemberService.addUserToSpace(
          authUser.id,
          space.id,
          SpaceRole.ADMIN,
          workspaceId,
          trx,
        );
      },
      trx,
    );

    this.auditService.log({
      event: AuditEvent.SPACE_CREATED,
      resourceType: AuditResource.SPACE,
      resourceId: space.id,
      spaceId: space.id,
      changes: {
        after: {
          name: space.name,
          slug: space.slug,
        },
      },
    });

    return { ...space, memberCount: 1 };
  }

  async create(
    userId: string,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
  ): Promise<Space> {
    const slugExists = await this.spaceRepo.slugExists(
      createSpaceDto.slug,
      workspaceId,
      trx,
    );
    if (slugExists) {
      throw new BadRequestException(
        'Space slug exists. Please use a unique space slug',
      );
    }

    return await this.spaceRepo.insertSpace(
      {
        name: createSpaceDto.name ?? 'untitled space',
        description: createSpaceDto.description ?? '',
        creatorId: userId,
        workspaceId: workspaceId,
        slug: createSpaceDto.slug,
      },
      trx,
    );
  }

  async updateSpace(
    updateSpaceDto: UpdateSpaceDto,
    workspaceId: string,
  ): Promise<Space> {
    if (updateSpaceDto?.slug) {
      const slugExists = await this.spaceRepo.slugExists(
        updateSpaceDto.slug,
        workspaceId,
      );

      if (slugExists) {
        throw new BadRequestException(
          'Space slug exists. Please use a unique space slug',
        );
      }
    }

    if (typeof updateSpaceDto.disablePublicSharing !== 'undefined') {
      const workspace = await this.workspaceRepo.findById(workspaceId, {
        withLicenseKey: true,
      });

      if (!this.licenseCheckService.isValidEELicense(workspace.licenseKey)) {
        throw new ForbiddenException(
          'This feature requires a valid enterprise license',
        );
      }
    }

    const spaceBefore = await this.spaceRepo.findById(
      updateSpaceDto.spaceId,
      workspaceId,
    );
    const settingsBefore = (spaceBefore?.settings ?? {}) as Record<string, any>;

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    let updatedSpace: Space;

    await executeTx(this.db, async (trx) => {
      if (typeof updateSpaceDto.disablePublicSharing !== 'undefined') {
        const prev = settingsBefore?.sharing?.disabled ?? false;
        if (prev !== updateSpaceDto.disablePublicSharing) {
          before.disablePublicSharing = prev;
          after.disablePublicSharing = updateSpaceDto.disablePublicSharing;
        }

        await this.spaceRepo.updateSharingSettings(
          updateSpaceDto.spaceId,
          workspaceId,
          'disabled',
          updateSpaceDto.disablePublicSharing,
          trx,
        );

        if (updateSpaceDto.disablePublicSharing) {
          await this.shareRepo.deleteBySpaceId(
            updateSpaceDto.spaceId,
            workspaceId,
          );
        }
      }

      updatedSpace = await this.spaceRepo.updateSpace(
        {
          name: updateSpaceDto.name,
          description: updateSpaceDto.description,
          slug: updateSpaceDto.slug,
        },
        updateSpaceDto.spaceId,
        workspaceId,
        trx,
      );
    });

    const columnChanges = diffAuditTrackedFields(
      ['name', 'slug', 'description'],
      updateSpaceDto,
      spaceBefore,
      updatedSpace,
    );
    if (columnChanges) {
      Object.assign(before, columnChanges.before);
      Object.assign(after, columnChanges.after);
    }

    if (Object.keys(after).length > 0) {
      this.auditService.log({
        event: AuditEvent.SPACE_UPDATED,
        resourceType: AuditResource.SPACE,
        resourceId: updateSpaceDto.spaceId,
        spaceId: updateSpaceDto.spaceId,
        changes: { before, after },
      });
    }

    return updatedSpace;
  }

  async getSpaceInfo(spaceId: string, workspaceId: string): Promise<Space> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId, {
      includeMemberCount: true,
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    return space;
  }

  async getWorkspaceSpaces(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Space>> {
    return this.spaceRepo.getSpacesInWorkspace(workspaceId, pagination);
  }

  async deleteSpace(spaceId: string, workspaceId: string): Promise<void> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    await this.spaceRepo.deleteSpace(spaceId, workspaceId);
    await this.attachmentQueue.add(QueueJob.DELETE_SPACE_ATTACHMENTS, space);

    this.auditService.log({
      event: AuditEvent.SPACE_DELETED,
      resourceType: AuditResource.SPACE,
      resourceId: spaceId,
      spaceId: spaceId,
      changes: {
        before: {
          name: space.name,
          slug: space.slug,
          description: space.description,
        },
      },
    });
  }

  async listSidebarCategories(
    spaceId: string,
    workspaceId: string,
  ): Promise<SpaceSidebarCategory[]> {
    await this.getSpaceInfo(spaceId, workspaceId);
    return this.spaceSidebarCategoryRepo.listBySpace(spaceId, workspaceId);
  }

  async getSidebarCategory(
    categoryId: string,
    workspaceId: string,
  ): Promise<SpaceSidebarCategory> {
    const category = await this.spaceSidebarCategoryRepo.findById(
      categoryId,
      workspaceId,
    );
    if (!category) {
      throw new NotFoundException('Sidebar category not found');
    }
    return category;
  }

  async createSidebarCategory(
    user: User,
    workspaceId: string,
    payload: { spaceId: string; name: string },
  ): Promise<SpaceSidebarCategory> {
    await this.getSpaceInfo(payload.spaceId, workspaceId);

    const count = await this.spaceSidebarCategoryRepo.countBySpace(
      payload.spaceId,
      workspaceId,
    );
    if (count >= SpaceService.MAX_SIDEBAR_CATEGORIES) {
      throw new BadRequestException('SIDEBAR_CATEGORY_LIMIT_EXCEEDED');
    }

    const normalizedName = payload.name.trim();
    const exists = await this.spaceSidebarCategoryRepo.nameExists(
      payload.spaceId,
      normalizedName,
      workspaceId,
    );
    if (exists) {
      throw new BadRequestException('SIDEBAR_CATEGORY_NAME_DUPLICATED');
    }

    const existing = await this.spaceSidebarCategoryRepo.listBySpace(
      payload.spaceId,
      workspaceId,
    );
    const lastSortKey = existing[existing.length - 1]?.sortKey ?? null;

    return this.spaceSidebarCategoryRepo.insertCategory({
      workspaceId,
      spaceId: payload.spaceId,
      name: normalizedName,
      sortKey: generateJitteredKeyBetween(lastSortKey, null),
      createdBy: user.id,
    });
  }

  async updateSidebarCategory(
    categoryId: string,
    payload: { name: string },
    workspaceId: string,
  ): Promise<SpaceSidebarCategory> {
    const category = await this.getSidebarCategory(categoryId, workspaceId);
    const normalizedName = payload.name.trim();

    const exists = await this.spaceSidebarCategoryRepo.nameExists(
      category.spaceId,
      normalizedName,
      workspaceId,
      categoryId,
    );
    if (exists) {
      throw new BadRequestException('SIDEBAR_CATEGORY_NAME_DUPLICATED');
    }

    const updated = await this.spaceSidebarCategoryRepo.updateCategory(
      categoryId,
      { name: normalizedName },
      workspaceId,
    );
    if (!updated) {
      throw new NotFoundException('Sidebar category not found');
    }

    return updated;
  }

  async deleteSidebarCategory(
    categoryId: string,
    workspaceId: string,
  ): Promise<{ categoryId: string; unassignedRootCount: number }> {
    const category = await this.getSidebarCategory(categoryId, workspaceId);

    return executeTx(this.db, async (trx) => {
      const { count } = await trx
        .selectFrom('pageNodeMeta')
        .select((eb) => eb.fn.count('pageId').as('count'))
        .where('workspaceId', '=', workspaceId)
        .where('spaceId', '=', category.spaceId)
        .where('sidebarCategoryId', '=', categoryId)
        .executeTakeFirstOrThrow();

      const unassignedRootCount = Number(count ?? 0);

      await trx
        .updateTable('pageNodeMeta')
        .set({
          sidebarCategoryId: null,
          updatedAt: new Date(),
        })
        .where('workspaceId', '=', workspaceId)
        .where('spaceId', '=', category.spaceId)
        .where('sidebarCategoryId', '=', categoryId)
        .execute();

      await this.spaceSidebarCategoryRepo.deleteCategory(
        categoryId,
        workspaceId,
        trx,
      );

      return {
        categoryId,
        unassignedRootCount,
      };
    });
  }

  async reorderSidebarCategories(
    spaceId: string,
    orderedCategoryIds: string[],
    workspaceId: string,
  ): Promise<SpaceSidebarCategory[]> {
    const categories = await this.spaceSidebarCategoryRepo.listBySpace(
      spaceId,
      workspaceId,
    );

    if (!categories.length) {
      throw new BadRequestException('SIDEBAR_CATEGORIES_NOT_FOUND');
    }

    if (orderedCategoryIds.length !== categories.length) {
      throw new BadRequestException('SIDEBAR_CATEGORY_REORDER_INVALID');
    }

    const categoryIdSet = new Set(categories.map((item) => item.id));
    const orderedIdSet = new Set(orderedCategoryIds);
    if (
      orderedIdSet.size !== categories.length ||
      orderedCategoryIds.some((id) => !categoryIdSet.has(id))
    ) {
      throw new BadRequestException('SIDEBAR_CATEGORY_REORDER_INVALID');
    }

    await executeTx(this.db, async (trx) => {
      let previousSortKey: string | null = null;

      for (const categoryId of orderedCategoryIds) {
        previousSortKey = generateJitteredKeyBetween(previousSortKey, null);
        await this.spaceSidebarCategoryRepo.updateCategory(
          categoryId,
          { sortKey: previousSortKey },
          workspaceId,
          trx,
        );
      }
    });

    return this.spaceSidebarCategoryRepo.listBySpace(spaceId, workspaceId);
  }
}
