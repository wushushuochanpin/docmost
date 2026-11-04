import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { IntegrationTokenService } from '../services/integration-token.service';
import { ListIntegrationTokensDto } from '../dto/list-integration-tokens.dto';
import { CreateIntegrationTokenDto } from '../dto/create-integration-token.dto';
import { RevokeIntegrationTokenDto } from '../dto/revoke-integration-token.dto';
import { AgentOAuthService } from '../../agent-oauth/agent-oauth.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class IntegrationTokenController {
  constructor(
    private readonly integrationTokenService: IntegrationTokenService,
    private readonly oauth: AgentOAuthService,
  ) {}

  private actor(
    req: FastifyRequest,
    user: User,
    workspace: Workspace,
    write = false,
  ) {
    const actor = {
      userId: user.id,
      workspaceId: workspace.id,
      sessionId: (req.raw as any).sessionId,
    };
    if (
      write &&
      (req.headers.origin !== this.oauth.origin ||
        req.headers['x-csrf-token'] !== this.oauth.managementCsrf(actor))
    )
      throw new ForbiddenException('CSRF_REJECTED');
    return actor;
  }

  @HttpCode(HttpStatus.OK)
  @Get('/integration-keys/mcp/capabilities')
  async mcpCapabilities(
    @Req() req: FastifyRequest,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.mcpCapabilities(
      user,
      workspace,
      this.actor(req, user, workspace),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/mcp/list')
  async listMcp(
    @Req() req: FastifyRequest,
    @Body() query: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.listMcpTokens(
      user,
      workspace,
      this.actor(req, user, workspace),
      query,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get('/integration-keys/mcp/:id')
  async detailMcp(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.mcpTokenDetail(
      user,
      workspace,
      this.actor(req, user, workspace),
      id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/mcp/create')
  async createMcp(
    @Req() req: FastifyRequest,
    @Body() body: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.createMcpToken(
      user,
      workspace,
      this.actor(req, user, workspace, true),
      body,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/mcp/update')
  async updateMcp(
    @Req() req: FastifyRequest,
    @Body() body: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.updateMcpToken(
      user,
      workspace,
      this.actor(req, user, workspace, true),
      body,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/mcp/revoke')
  async revokeMcp(
    @Req() req: FastifyRequest,
    @Body() body: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.revokeMcpToken(
      user,
      workspace,
      this.actor(req, user, workspace, true),
      body,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/list')
  async listPersonal(
    @Body() pagination: ListIntegrationTokensDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.listPersonalTokens(
      user,
      workspace,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/create')
  async createPersonal(
    @Body() dto: CreateIntegrationTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.createPersonalToken(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/integration-keys/revoke')
  async revokePersonal(
    @Body() dto: RevokeIntegrationTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.integrationTokenService.revokePersonalToken(
      user,
      workspace,
      dto.tokenId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/admin/integration-keys/list')
  async listWorkspace(
    @Body() pagination: ListIntegrationTokensDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.listWorkspaceTokens(
      user,
      workspace,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/admin/integration-keys/create')
  async createWorkspace(
    @Body() dto: CreateIntegrationTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.integrationTokenService.createWorkspaceToken(
      user,
      workspace,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/admin/integration-keys/revoke')
  async revokeWorkspace(
    @Body() dto: RevokeIntegrationTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.integrationTokenService.revokeWorkspaceToken(
      user,
      workspace,
      dto.tokenId,
    );
  }
}
