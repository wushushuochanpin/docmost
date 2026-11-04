import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { TokenService } from '../../auth/services/token.service';
import { IntegrationTokenRepo } from '../repos/integration-token.repo';
import { CreateIntegrationTokenDto } from '../dto/create-integration-token.dto';
import { ListIntegrationTokensDto } from '../dto/list-integration-tokens.dto';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';
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
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import * as z from 'zod/v4';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { AgentOAuthService } from '../../agent-oauth/agent-oauth.service';
import { OAUTH_SCOPES } from '../../agent-oauth/oauth-contract';
import { agentPolicy } from '../../document-command/agent-quota';
import { openCursor, sealCursor } from '../../document-command/agent-cursor';

type TokenListMode = 'personal' | 'workspace';

@Injectable()
export class IntegrationTokenService {
  constructor(
    private readonly tokenRepo: IntegrationTokenRepo,
    private readonly tokenService: TokenService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly members: SpaceMemberRepo,
    private readonly oauth: AgentOAuthService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectKysely() private readonly db: KyselyDB,
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
    const restrictToAdmins = workspaceSettings?.api?.restrictToAdmins === true;
    const ability = this.workspaceAbility.createForUser(user, workspace);

    if (
      restrictToAdmins &&
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)
    ) {
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

  async revokePersonalToken(user: User, workspace: Workspace, tokenId: string) {
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

  async validateApiToken(
    req: any,
    payload: { apiKeyId: string; sub: string; workspaceId: string },
  ) {
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

    // A scoped MCP token is a different credential class: it must never widen
    // into the legacy HTTP API. Legacy tokens keep their original behaviour.
    if ((token as any).credentialType === 'mcp_scoped') {
      const rawUrl =
        (req.raw && (req.raw.url || req.raw.originalUrl)) || req.url || '';
      const pathname = String(rawUrl).split('?')[0];
      if (pathname !== '/mcp' && pathname !== '/mcp/')
        throw new ForbiddenException('MCP_TOKEN_HTTP_SCOPE_DENIED');
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

    return { user, workspace, apiToken: token };
  }


  // ---------------------------------------------------------------------------
  // MCP-scoped token lifecycle. These methods intentionally do not touch the
  // legacy token create/revoke/list paths above.
  // ---------------------------------------------------------------------------

  private mcpTx<T>(
    actor: { workspaceId: string; userId: string; sessionId: string },
    write: boolean,
    fn: (trx: KyselyTransaction) => Promise<T>,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('app.workspace_id',${actor.workspaceId},true),set_config('lock_timeout','2s',true),set_config('statement_timeout','5s',true)`.execute(
        trx,
      );
      if (write)
        await sql`select pg_advisory_xact_lock(20261018,1)`.execute(trx);
      else
        await sql`select pg_advisory_xact_lock_shared(20261018,1)`.execute(trx);
      await this.oauth.assertSession(trx, actor);
      return fn(trx);
    });
  }

  private parseMcp<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('INVALID_ARGUMENT');
    return parsed.data;
  }

  private async accessibleSpaces(
    trx: KyselyTransaction,
    userId: string,
    workspaceId: string,
  ) {
    return (
      await sql<{ id: string; name: string }>`select s.id,s.name from spaces s
        where s.workspace_id=${workspaceId}::uuid
        and exists(
          select 1 from space_members m left join group_users gu on gu.group_id=m.group_id
          where m.space_id=s.id and (m.user_id=${userId}::uuid or gu.user_id=${userId}::uuid)
        )
        order by s.name,s.id limit 200`.execute(trx)
    ).rows;
  }

  private async assertSpaces(
    trx: KyselyTransaction,
    userId: string,
    workspaceId: string,
    spaceIds: string[],
  ) {
    if (
      !spaceIds.length ||
      spaceIds.length > 100 ||
      new Set(spaceIds).size !== spaceIds.length
    )
      throw new BadRequestException('INVALID_SPACE_SCOPE');
    const spaces = await trx
      .selectFrom('spaces')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('id', 'in', spaceIds)
      .execute();
    if (spaces.length !== spaceIds.length)
      throw new BadRequestException('INVALID_SPACE_SCOPE');
    for (const spaceId of spaceIds) {
      const roles = await this.members.getUserSpaceRoles(
        userId,
        spaceId,
        trx,
      );
      if (!roles?.length) throw new BadRequestException('INVALID_SPACE_SCOPE');
    }
  }

  private assertScopes(scopes: string[]) {
    if (
      !scopes.length ||
      scopes.length > OAUTH_SCOPES.length ||
      new Set(scopes).size !== scopes.length ||
      !scopes.includes('knowledge.read') ||
      scopes.some((scope) => !OAUTH_SCOPES.includes(scope as any))
    )
      throw new BadRequestException('INVALID_SCOPE');
  }

  private async assertWritePolicy(
    trx: KyselyTransaction,
    workspaceId: string,
    scopes: string[],
  ) {
    if (scopes.some((scope) => scope !== 'knowledge.read')) {
      const policy = await agentPolicy(trx, workspaceId);
      if (!policy.enabled)
        throw new ForbiddenException('WORKSPACE_WRITE_DISABLED');
    }
  }

  private mcpExpiry(value: string | null | undefined) {
    const expiresAt = value ? new Date(value) : new Date(Date.now() + 90 * 86400000);
    if (Number.isNaN(expiresAt.getTime()))
      throw new BadRequestException('INVALID_EXPIRATION');
    const now = Date.now();
    if (expiresAt.getTime() <= now)
      throw new BadRequestException('EXPIRATION_MUST_BE_FUTURE');
    if (expiresAt.getTime() > now + 365 * 86400000)
      throw new BadRequestException('EXPIRATION_TOO_FAR');
    return expiresAt;
  }

  private mcpTokenResult(
    row: any,
    csrf_token: string,
    rawToken?: string,
  ) {
    return {
      id: row.id,
      name: row.name,
      credentialType: row.credentialType,
      tokenPrefix: row.tokenPrefix,
      spaceIds: row.spaceIds ?? [],
      scopes: row.scopes ?? [],
      version: String(row.version ?? 1),
      status: row.status,
      expiresAt: row.expiresAt ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      createdAt: row.createdAt,
      csrf_token,
      ...(rawToken ? { token: rawToken } : {}),
    };
  }

  async mcpCapabilities(
    user: User,
    workspace: Workspace,
    actor: { workspaceId: string; userId: string; sessionId: string },
  ) {
    return this.mcpTx(actor, false, async (trx) => {
      const policy = await agentPolicy(trx, workspace.id);
      return {
        enabled: true,
        credential_type: 'mcp_scoped',
        scopes: [...OAUTH_SCOPES],
        default_scopes: ['knowledge.read'],
        spaces: await this.accessibleSpaces(trx, user.id, workspace.id),
        writes_enabled: policy.enabled,
        max_expiry_days: 365,
        csrf_token: this.oauth.managementCsrf(actor),
      };
    });
  }

  async listMcpTokens(
    user: User,
    workspace: Workspace,
    actor: { workspaceId: string; userId: string; sessionId: string },
    query: unknown,
  ) {
    const p = this.parseMcp(
      z.strictObject({
        cursor: z.string().max(8192).optional(),
        page_size: z.coerce.number().int().min(1).max(100).default(20),
      }),
      query,
    );
    const binding = {
      tool: 'mcp_tokens',
      workspace: workspace.id,
      user: user.id,
    };
    const after = p.cursor ? String(openCursor(p.cursor, binding)) : '';
    return this.mcpTx(actor, false, async (trx) => {
      const rows = (
        await sql<any>`select id,name,credential_type,scopes,space_ids,version::text,status,expires_at,revoked_at,last_used_at,created_at
          from sc_api_tokens
          where workspace_id=${workspace.id}::uuid and owner_user_id=${user.id}::uuid
            and credential_type='mcp_scoped' and id::text>${after}
          order by id limit ${p.page_size + 1}`.execute(trx)
      ).rows;
      const page = rows.slice(0, p.page_size);
      const spaceIds = Array.from(
        new Set(page.flatMap((row: any) => row.spaceIds ?? [])),
      );
      const spaces = spaceIds.length
        ? await trx
            .selectFrom('spaces')
            .select(['id', 'name'])
            .where('workspaceId', '=', workspace.id)
            .where('id', 'in', spaceIds)
            .execute()
        : [];
      const names = new Map(spaces.map((space) => [space.id, space.name]));
      return {
        items: page.map((row: any) => ({
          id: row.id,
          name: row.name,
          credentialType: row.credentialType,
          scopes: row.scopes ?? [],
          spaceIds: row.spaceIds ?? [],
          spaces: (row.spaceIds ?? []).map((id: string) => ({
            id,
            name: names.get(id) ?? id,
          })),
          version: String(row.version ?? 1),
          status:
            row.status === 'revoked' || row.revokedAt
              ? 'revoked'
              : row.expiresAt && +new Date(row.expiresAt) <= Date.now()
                ? 'expired'
                : 'active',
          expiresAt: row.expiresAt ?? null,
          lastUsedAt: row.lastUsedAt ?? null,
          createdAt: row.createdAt,
        })),
        next_cursor:
          rows.length > p.page_size
            ? sealCursor(binding, page[page.length - 1].id)
            : null,
        csrf_token: this.oauth.managementCsrf(actor),
      };
    });
  }

  async mcpTokenDetail(
    user: User,
    workspace: Workspace,
    actor: { workspaceId: string; userId: string; sessionId: string },
    id: string,
  ) {
    if (!z.uuid().safeParse(id).success)
      throw new BadRequestException('INVALID_ARGUMENT');
    return this.mcpTx(actor, false, async (trx) => {
      const row = (
        await sql<any>`select id,name,credential_type,scopes,space_ids,version::text,status,expires_at,revoked_at,last_used_at,created_at
          from sc_api_tokens where id=${id}::uuid and workspace_id=${workspace.id}::uuid
          and owner_user_id=${user.id}::uuid and credential_type='mcp_scoped' for share`.execute(
          trx,
        )
      ).rows[0];
      if (!row) throw new NotFoundException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      const spaces = row.spaceIds?.length
        ? await trx
            .selectFrom('spaces')
            .select(['id', 'name'])
            .where('workspaceId', '=', workspace.id)
            .where('id', 'in', row.spaceIds)
            .execute()
        : [];
      return {
        ...this.mcpTokenResult(row, this.oauth.managementCsrf(actor)),
        spaces,
        status:
          row.status === 'revoked' || row.revokedAt
            ? 'revoked'
            : row.expiresAt && +new Date(row.expiresAt) <= Date.now()
              ? 'expired'
              : 'active',
      };
    });
  }

  async createMcpToken(
    user: User,
    workspace: Workspace,
    actor: { workspaceId: string; userId: string; sessionId: string },
    input: unknown,
  ) {
    const p = this.parseMcp(
      z.strictObject({
        name: z.string().trim().min(1).max(64),
        expiresAt: z.string().max(80).optional().nullable(),
        spaceIds: z.array(z.uuid()).min(1).max(100),
        scopes: z.array(z.enum(OAUTH_SCOPES)).min(1).max(4).default(['knowledge.read']),
        requestId: z.string().min(8).max(128),
      }),
      input,
    );
    this.assertScopes(p.scopes);
    const expiresAt = this.mcpExpiry(p.expiresAt);
    const tokenId = uuidv7();
    const rawToken = await this.tokenService.generateApiToken({
      apiKeyId: tokenId,
      user,
      workspaceId: workspace.id,
      expiresIn: Math.max(
        1,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      ),
    });
    const tokenPrefix = rawToken.slice(0, 12);
    const tokenHash = this.hashToken(rawToken);
    return this.mcpTx(actor, true, async (trx) => {
      const duplicate = (
        await sql`select id from sc_api_tokens where workspace_id=${workspace.id}::uuid and request_id=${p.requestId}`.execute(
          trx,
        )
      ).rows[0];
      if (duplicate) throw new ConflictException('CREATE_RESULT_UNKNOWN');
      await this.assertSpaces(trx, user.id, workspace.id, p.spaceIds);
      await this.assertWritePolicy(trx, workspace.id, p.scopes);
      const row = (
        await sql<any>`insert into sc_api_tokens(
          id,workspace_id,owner_user_id,creator_user_id,name,token_prefix,token_hash,scope_json,
          is_workspace_managed,status,expires_at,last_used_at,last_used_ip,revoked_at,
          credential_type,space_ids,scopes,version,request_id
        ) values(
          ${tokenId}::uuid,${workspace.id}::uuid,${user.id}::uuid,${user.id}::uuid,
          ${p.name},${tokenPrefix},${tokenHash},${JSON.stringify(p.scopes)}::text::jsonb,
          false,'active',${expiresAt},null,null,null,'mcp_scoped',${p.spaceIds}::uuid[],
          ${p.scopes},1,${p.requestId}
        ) returning id,name,credential_type,scopes,space_ids,version::text,status,expires_at,last_used_at,created_at,token_prefix`.execute(
          trx,
        )
      ).rows[0];
      await this.tokenRepo.insertTokenEvent(
        {
          workspaceId: workspace.id,
          apiTokenId: tokenId,
          eventType: 'created',
          actorUserId: user.id,
          metadata: {
            credentialType: 'mcp_scoped',
            scopes: p.scopes,
            spaceIds: p.spaceIds,
            requestId: p.requestId,
          },
        },
        trx,
      );
      await this.auditService.log({
        event: AuditEvent.API_KEY_CREATED,
        resourceType: AuditResource.API_KEY,
        resourceId: tokenId,
        changes: {
          before: {},
          after: {
            name: p.name,
            credentialType: 'mcp_scoped',
            scopes: p.scopes,
            spaceIds: p.spaceIds,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      const spaces = await trx
        .selectFrom('spaces')
        .select(['id', 'name'])
        .where('workspaceId', '=', workspace.id)
        .where('id', 'in', p.spaceIds)
        .execute();
      return {
        ...this.mcpTokenResult(
          {
            ...row,
            tokenPrefix: row.token_prefix ?? row.tokenPrefix,
          },
          this.oauth.managementCsrf(actor),
          rawToken,
        ),
        spaces,
      };
    });
  }

  async updateMcpToken(
    user: User,
    workspace: Workspace,
    actor: { workspaceId: string; userId: string; sessionId: string },
    input: unknown,
  ) {
    const p = this.parseMcp(
      z.strictObject({
        tokenId: z.uuid(),
        expectedVersion: z.string().regex(/^\d+$/),
        scopes: z.array(z.enum(OAUTH_SCOPES)).min(1).max(4),
        spaceIds: z.array(z.uuid()).min(1).max(100),
        confirmUpgrade: z.boolean().default(false),
      }),
      input,
    );
    this.assertScopes(p.scopes);
    return this.mcpTx(actor, true, async (trx) => {
      const row = (
        await sql<any>`select * from sc_api_tokens where id=${p.tokenId}::uuid
          and workspace_id=${workspace.id}::uuid and owner_user_id=${user.id}::uuid
          for update`.execute(trx)
      ).rows[0];
      if (!row || row.credentialType !== 'mcp_scoped')
        throw new NotFoundException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      if (row.status === 'revoked' || row.revokedAt)
        throw new ConflictException('CREDENTIAL_REVOKED');
      if (row.expiresAt && +new Date(row.expiresAt) <= Date.now())
        throw new ConflictException('CREDENTIAL_EXPIRED');
      if (String(row.version) !== p.expectedVersion)
        throw new ConflictException('REVISION_CONFLICT');
      await this.assertSpaces(trx, user.id, workspace.id, p.spaceIds);
      await this.assertWritePolicy(trx, workspace.id, p.scopes);
      const before = {
        scopes: row.scopes ?? [],
        spaceIds: row.spaceIds ?? [],
      };
      const addedScopes = p.scopes.filter(
        (scope) => !before.scopes.includes(scope),
      );
      const addedSpaces = p.spaceIds.filter(
        (space) => !before.spaceIds.includes(space),
      );
      const upgrade = addedScopes.length > 0 || addedSpaces.length > 0;
      if (upgrade && !p.confirmUpgrade)
        throw new BadRequestException('UPGRADE_CONFIRMATION_REQUIRED');
      const next = (
        await sql<any>`update sc_api_tokens
          set scopes=${p.scopes},space_ids=${p.spaceIds}::uuid[],scope_json=${JSON.stringify(p.scopes)}::text::jsonb,
            version=version+1,last_scope_change=${JSON.stringify({
              before,
              after: { scopes: p.scopes, spaceIds: p.spaceIds },
              at: new Date().toISOString(),
            })}::text::jsonb,
            confirmed_by_user_id=${upgrade ? user.id : null}::uuid,confirmed_at=${upgrade ? new Date() : null}
          where id=${p.tokenId}::uuid
          returning id,name,credential_type,scopes,space_ids,version::text,status,expires_at,last_used_at,created_at,token_prefix`.execute(
          trx,
        )
      ).rows[0];
      await this.tokenRepo.insertTokenEvent(
        {
          workspaceId: workspace.id,
          apiTokenId: p.tokenId,
          eventType: upgrade
            ? 'permissions_upgraded'
            : 'permissions_reduced',
          actorUserId: user.id,
          metadata: {
            before,
            after: { scopes: p.scopes, spaceIds: p.spaceIds },
            confirmUpgrade: upgrade ? p.confirmUpgrade : false,
          },
        },
        trx,
      );
      await this.auditService.log({
        event: AuditEvent.API_KEY_UPDATED,
        resourceType: AuditResource.API_KEY,
        resourceId: p.tokenId,
        changes: {
          before,
          after: { scopes: p.scopes, spaceIds: p.spaceIds },
        },
      });
      return this.mcpTokenResult(
        next,
        this.oauth.managementCsrf(actor),
      );
    });
  }

  async revokeMcpToken(
    user: User,
    workspace: Workspace,
    actor: { workspaceId: string; userId: string; sessionId: string },
    input: unknown,
  ) {
    const p = this.parseMcp(
      z.strictObject({ tokenId: z.uuid() }),
      input,
    );
    return this.mcpTx(actor, true, async (trx) => {
      const row = (
        await sql<any>`select * from sc_api_tokens where id=${p.tokenId}::uuid
          and workspace_id=${workspace.id}::uuid and owner_user_id=${user.id}::uuid
          for update`.execute(trx)
      ).rows[0];
      if (!row || row.credentialType !== 'mcp_scoped')
        throw new NotFoundException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      if (row.status === 'revoked' || row.revokedAt)
        return { id: p.tokenId, status: 'revoked' };
      await sql`update sc_api_tokens set status='revoked',revoked_at=clock_timestamp(),version=version+1
        where id=${p.tokenId}::uuid`.execute(trx);
      await this.tokenRepo.insertTokenEvent(
        {
          workspaceId: workspace.id,
          apiTokenId: p.tokenId,
          eventType: 'revoked',
          actorUserId: user.id,
          metadata: { credentialType: 'mcp_scoped' },
        },
        trx,
      );
      await this.auditService.log({
        event: AuditEvent.API_KEY_DELETED,
        resourceType: AuditResource.API_KEY,
        resourceId: p.tokenId,
      });
      return { id: p.tokenId, status: 'revoked' };
    });
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

  private async revokeToken(
    workspaceId: string,
    tokenId: string,
    actorUserId: string,
  ) {
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
