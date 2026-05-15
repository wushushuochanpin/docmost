import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { User, Workspace } from '@docmost/db/types/entity.types';
import {
  AcquireEditorSessionDto,
  HeartbeatEditorSessionDto,
  ReleaseEditorSessionDto,
} from './dto/editor-session.dto';
import { EditorSessionService } from './editor-session.service';

@UseGuards(JwtAuthGuard)
@Controller('editor-sessions')
export class EditorSessionController {
  constructor(private readonly editorSessionService: EditorSessionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('acquire')
  async acquire(
    @Body() dto: AcquireEditorSessionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    return this.editorSessionService.acquire({
      workspaceId: workspace.id,
      user,
      sessionId: (req.raw as any).sessionId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      clientId: dto.clientId,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('takeover')
  async takeover(
    @Body() dto: AcquireEditorSessionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    return this.editorSessionService.takeover({
      workspaceId: workspace.id,
      user,
      sessionId: (req.raw as any).sessionId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      clientId: dto.clientId,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('heartbeat')
  async heartbeat(
    @Body() dto: HeartbeatEditorSessionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.editorSessionService.heartbeat({
      workspaceId: workspace.id,
      userId: user.id,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      editSession: dto.editSession,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('release')
  async release(
    @Body() dto: ReleaseEditorSessionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.editorSessionService.release({
      workspaceId: workspace.id,
      userId: user.id,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      editSession: dto.editSession,
      reason: dto.reason,
    });
  }
}
