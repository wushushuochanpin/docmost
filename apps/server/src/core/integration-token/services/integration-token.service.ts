import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { TokenService } from '../../auth/services/token.service';
import { IntegrationTokenRepo } from '../repos/integration-token.repo';
import { CreateIntegrationTokenDto } from '../dto/create-integration-token.dto';
import { ListIntegrationTokensDto } from '../dto/list-integration-tokens.dto';
import { WorkspaceCaslAction, WorkspaceCaslSubject } from '../../casl/interfaces/workspace-ability.type';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { Inject } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { isUserDisabled } from '../../../common/helpers';
import { extractBearerTokenFromHeader } from '../../../common/helpers';

type TokenListMode = 'personal' | 'workspace';

@Injectable()
export class IntegrationTokenService {
  constructor(
    private readonly tokenRepo: IntegrationTokenRepo,
    private readonly tokenService: TokenService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async listPersonalTokens(
    user: User,
    workspace: Workspace,
    pagination: ListIntegrationTokensDto,
  ) {
    return this.tokenRepo.listPersonalTokens(workspace.id, user.id, pagination);
  }

  async listWorkspaceTokens(
    user: User,
    workspace: Workspace,
    pagination: ListIntegrationTokensDto,
  ) {
    this.assertWorkspaceTokenAccess(user, workspace);
    return this.tokenRepo.listWorkspaceTokens(workspace.id, pagination);
  }

  async createPersonalToken(
    user: User,
    workspace: Workspace,
    dto: CreateIntegrationTokenDto,
  ) {
    const workspaceSettings = (workspace.settings ?? {}) as Record<string, any>;
    const restrictToAdmins =
      workspaceSettings?.api?.restrictToAdmins === true;
    const ability = this.workspaceAbility.createForUser(user, workspace);

    if (restrictToAdmins && ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException('Only admins can create API keys');
    }

    if (
      ability.cannot(WorkspaceCaslAction.Create, WorkspaceCaslSubject.API) &&
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)
    ) {
      throw new ForbiddenException();
    }

    return this.createToken(user, workspace, dto, 'personal');
  }

  async createWorkspaceToken(
    user: User,
    workspace: Workspace,
    dto: CreateIntegrationTokenDto,
  ) {
    this.assertWorkspaceTokenAccess(user, workspace);
    return this.createToken(user, workspace, dto, 'workspace');
  }

  async revokePersonalToken(
    user: User,
    workspace: Workspace,
    tokenId: string,
  ) {
    const token = await this.tokenRepo.findTokenById(tokenId, workspace.id);
    if (!token || token.isWorkspaceManaged || token.ownerUserId !== user.id) {
      throw new ForbiddenException();
    }

    await this.revokeToken(workspace.id, tokenId, user.id);
  }

  async revokeWorkspaceToken(
    user: User,
    workspace: Workspace,
    tokenId: string,
  ) {
    this.assertWorkspaceTokenAccess(user, workspace);
    const token = await this.tokenRepo.findTokenById(tokenId, workspace.id);
    if (!token || !token.isWorkspaceManaged) {
      throw new BadRequestException('Token not found');
    }

    await this.revokeToken(workspace.id, tokenId, user.id);
  }

  async validateApiToken(req: any, payload: { apiKeyId: string; sub: string; workspaceId: string }) {
    const rawToken = extractBearerTokenFromHeader(req);
    if (!rawToken) {
      throw new UnauthorizedException();
    }

    const token = await this.tokenRepo.findTokenById(
      payload.apiKeyId,
      payload.workspaceId,
    );

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    const expectedHash = this.hashToken(rawToken);
    if (token.tokenHash !== expectedHash) {
      throw new UnauthorizedException('Token signature mismatch');
    }

    if (token.status !== 'active' || token.revokedAt) {
      throw new UnauthorizedException('Token revoked');
    }

    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
      throw new UnauthorizedException('Token expired');
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);

    if (!workspace || !user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    await this.tokenRepo.updateToken(token.id, workspace.id, {
      lastUsedAt: new Date(),
      lastUsedIp: req.ip ?? req.headers?.['x-real-ip'] ?? null,
    });

    return { user, workspace };
  }

  private async createToken(
    user: User,
    workspace: Workspace,
    dto: CreateIntegrationTokenDto,
    mode: TokenListMode,
  ) {
    const expiresAt = this.parseExpiresAt(dto.expiresAt);
    const tokenId = uuidv7();
    const rawToken = await this.tokenService.generateApiToken({
      apiKeyId: tokenId,
      user,
      workspaceId: workspace.id,
      expiresIn: expiresAt
        ? Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
        : undefined,
    });

    const tokenPrefix = rawToken.slice(0, 12);
    const tokenHash = this.hashToken(rawToken);

    await this.tokenRepo.insertToken({
      id: tokenId,
      workspaceId: workspace.id,
      ownerUserId: user.id,
      creatorUserId: user.id,
      name: dto.name.trim(),
      tokenPrefix,
      tokenHash,
      scopeJson: [],
      isWorkspaceManaged: mode === 'workspace',
      status: 'active',
      expiresAt,
      lastUsedAt: null,
      lastUsedIp: null,
      revokedAt: null,
    });

    await this.tokenRepo.insertTokenEvent({
      workspaceId: workspace.id,
      apiTokenId: tokenId,
      eventType: 'created',
      actorUserId: user.id,
      metadata: { mode },
    });

    await this.auditService.log({
      event: AuditEvent.API_KEY_CREATED,
      resourceType: AuditResource.API_KEY,
      resourceId: tokenId,
      changes: {
        before: {},
        after: {
          name: dto.name.trim(),
          isWorkspaceManaged: mode === 'workspace',
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      },
    });

    return {
      id: tokenId,
      name: dto.name.trim(),
      token: rawToken,
      tokenPrefix,
      expiresAt: expiresAt?.toISOString() ?? null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      isWorkspaceManaged: mode === 'workspace',
      creator: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      owner: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      status: 'active',
    };
  }

  private async revokeToken(workspaceId: string, tokenId: string, actorUserId: string) {
    await this.tokenRepo.updateToken(tokenId, workspaceId, {
      status: 'revoked',
      revokedAt: new Date(),
    });

    await this.tokenRepo.insertTokenEvent({
      workspaceId,
      apiTokenId: tokenId,
      eventType: 'revoked',
      actorUserId,
      metadata: null,
    });

    await this.auditService.log({
      event: AuditEvent.API_KEY_DELETED,
      resourceType: AuditResource.API_KEY,
      resourceId: tokenId,
    });
  }

  private assertWorkspaceTokenAccess(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException();
    }
  }

  private parseExpiresAt(expiresAt?: string): Date | null {
    if (!expiresAt) return null;
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid expiration date');
    }
    if (parsed.getTime() <= Date.now()) {
      throw new BadRequestException('Expiration date must be in the future');
    }
    return parsed;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
