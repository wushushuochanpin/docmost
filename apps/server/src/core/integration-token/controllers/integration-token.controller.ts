import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { IntegrationTokenService } from '../services/integration-token.service';
import { ListIntegrationTokensDto } from '../dto/list-integration-tokens.dto';
import { CreateIntegrationTokenDto } from '../dto/create-integration-token.dto';
import { RevokeIntegrationTokenDto } from '../dto/revoke-integration-token.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class IntegrationTokenController {
  constructor(
    private readonly integrationTokenService: IntegrationTokenService,
  ) {}

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
