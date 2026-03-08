import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuditLogService } from '../services/audit-log.service';
import { ListAuditEventsDto } from '../dto/list-audit-events.dto';
import { UpdateAuditRetentionDto } from '../dto/update-audit-retention.dto';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import { WorkspaceCaslAction, WorkspaceCaslSubject } from '../../casl/interfaces/workspace-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('/audit-events')
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/list')
  async list(
    @Body() filters: ListAuditEventsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }

    return this.auditLogService.listEvents(workspace.id, filters);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/retention')
  async getRetention(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }

    return this.auditLogService.getRetention(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/retention/update')
  async updateRetention(
    @Body() dto: UpdateAuditRetentionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }

    await this.auditLogService.updateRetention(workspace.id, dto.retentionDays);
    return this.auditLogService.getRetention(workspace.id);
  }
}
