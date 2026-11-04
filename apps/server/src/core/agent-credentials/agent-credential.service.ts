import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { ScApiToken } from '../../database/types/entity.types';
import { AgentOAuthService } from '../agent-oauth/agent-oauth.service';
import {
  AgentCredential,
  AgentCredentialKind,
} from './agent-credential.types';

type CredentialLike = Partial<AgentCredential> & {
  workspaceId: string;
  userId: string;
  tokenHash?: string;
  credentialId?: string;
  grantId?: string;
  clientId?: string;
  apiTokenId?: string;
  kind?: AgentCredentialKind;
};

const denied = () => {
  throw new ForbiddenException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
};

@Injectable()
export class AgentCredentialService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly oauth: AgentOAuthService,
  ) {}

  /** Build a projection from a freshly validated API token row. */
  fromApiToken(token: ScApiToken): AgentCredential {
    const row = token as ScApiToken & {
      credentialType?: string;
      scopes?: string[] | null;
      spaceIds?: string[] | null;
    };
    if (row.credentialType !== 'mcp_scoped')
      throw new UnauthorizedException('MCP_SCOPED_TOKEN_REQUIRED');
    return {
      kind: 'api_token',
      credentialId: row.id,
      apiTokenId: row.id,
      workspaceId: row.workspaceId,
      userId: row.ownerUserId,
      tokenHash: row.tokenHash,
      scopes: Array.isArray(row.scopes)
        ? row.scopes
        : Array.isArray(row.scopeJson)
          ? (row.scopeJson as string[])
          : [],
      spaceIds: Array.isArray(row.spaceIds) ? row.spaceIds : [],
      version: String((row as any).version ?? 1),
    };
  }

  /** Read the current credential state before a tool call. */
  async resolve(
    actor: CredentialLike,
    origin?: string,
  ): Promise<AgentCredential> {
    if (this.kind(actor) === 'oauth') {
      if (!actor.tokenHash) throw new UnauthorizedException();
      const principal = await this.oauth.authenticateHash(
        actor.tokenHash,
        origin,
      );
      return {
        kind: 'oauth',
        credentialId: principal.grantId,
        grantId: principal.grantId,
        clientId: principal.clientId,
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        tokenHash: principal.tokenHash,
        scopes: principal.scopes,
        spaceIds: principal.spaceIds,
        version: String((principal as any).grantVersion ?? '1'),
      };
    }
    if (!actor.credentialId || !actor.tokenHash)
      throw new UnauthorizedException();
    const row = (
      await sql<any>`select id,owner_user_id,workspace_id,token_hash,status,revoked_at,expires_at,
        credential_type,scopes,space_ids,version::text
        from sc_api_tokens where id=${actor.credentialId}::uuid and workspace_id=${actor.workspaceId}::uuid`.execute(
        this.db,
      )
    ).rows[0];
    if (
      !row ||
      row.tokenHash !== actor.tokenHash ||
      row.status !== 'active' ||
      row.revokedAt ||
      (row.expiresAt && new Date(row.expiresAt) <= new Date()) ||
      row.credentialType !== 'mcp_scoped' ||
      row.ownerUserId !== actor.userId
    )
      throw new UnauthorizedException();
    const user = (
      await sql`select 1 from users where id=${actor.userId}::uuid and workspace_id=${actor.workspaceId}::uuid
        and deleted_at is null and deactivated_at is null`.execute(this.db)
    ).rows[0];
    if (!user) throw new UnauthorizedException();
    return {
      kind: 'api_token',
      credentialId: row.id,
      apiTokenId: row.id,
      workspaceId: row.workspaceId,
      userId: row.ownerUserId,
      tokenHash: row.tokenHash,
      scopes: row.scopes ?? [],
      spaceIds: row.spaceIds ?? [],
      version: String(row.version ?? 1),
    };
  }

  /**
   * Final commit barrier. Must run inside the document transaction, before the
   * operation is marked committed. It locks the current credential row so a
   * concurrent revoke/downgrade either wins before this check (deny) or waits
   * for the already-authorized write (allow, auditable).
   */
  async assertScope(
    trx: KyselyTransaction,
    actor: CredentialLike,
    spaceId: string,
    scope: string,
  ): Promise<void> {
    const kind = this.kind(actor);
    if (kind === 'oauth') {
      if (!actor.tokenHash || !actor.grantId || !actor.clientId)
        return denied();
      const valid = await sql`select 1 from agent_oauth_tokens t
        join agent_oauth_families f on f.id=t.family_id
        join agent_oauth_clients c on c.id=f.client_id
        where t.access_hash=${actor.tokenHash}
          and t.access_expires_at>clock_timestamp()
          and not f.revoked and c.active
          and f.grant_id=${actor.grantId}::uuid
          and f.client_id=${actor.clientId}
          and f.workspace_id=${actor.workspaceId}::uuid
          and t.metadata->'scope' @> ${JSON.stringify(['knowledge.read', scope])}::text::jsonb`.execute(
        trx,
      );
      if (!valid.rows.length) return denied();
      const grant = await sql`select 1 from document_agent_grants g
        join users u on u.id=g.user_id and u.workspace_id=g.workspace_id
        where g.id=${actor.grantId}::uuid
          and g.workspace_id=${actor.workspaceId}::uuid
          and g.user_id=${actor.userId}::uuid
          and g.client_id=${actor.clientId}
          and g.revoked_at is null
          and g.expires_at>clock_timestamp()
          and ${spaceId}::uuid=any(g.space_ids)
          and ARRAY['knowledge.read',${scope}]::text[] <@ g.scopes
          and u.deleted_at is null and u.deactivated_at is null
          for share of g`.execute(trx);
      if (!grant.rows.length) return denied();
      return;
    }
    if (!actor.credentialId || !actor.tokenHash) return denied();
    const token = await sql`select 1 from sc_api_tokens t
      join users u on u.id=t.owner_user_id and u.workspace_id=t.workspace_id
      where t.id=${actor.credentialId}::uuid
        and t.workspace_id=${actor.workspaceId}::uuid
        and t.owner_user_id=${actor.userId}::uuid
        and t.token_hash=${actor.tokenHash}
        and t.credential_type='mcp_scoped'
        and t.status='active'
        and t.revoked_at is null
        and (t.expires_at is null or t.expires_at>clock_timestamp())
        and ${spaceId}::uuid=any(t.space_ids)
        and ARRAY['knowledge.read',${scope}]::text[] <@ t.scopes
        and u.deleted_at is null and u.deactivated_at is null
        for share of t`.execute(trx);
    if (!token.rows.length) return denied();
  }

  async spaceIds(
    trx: KyselyTransaction,
    actor: CredentialLike,
  ): Promise<string[]> {
    if (this.kind(actor) === 'oauth') {
      if (!actor.grantId || !actor.clientId || !actor.tokenHash)
        return denied();
      const row = (
        await sql<{
          spaceIds: string[];
        }>`select g.space_ids from document_agent_grants g
          join agent_oauth_families f on f.grant_id=g.id
          join agent_oauth_tokens t on t.family_id=f.id
          join agent_oauth_clients c on c.id=f.client_id
          where g.id=${actor.grantId}::uuid and g.workspace_id=${actor.workspaceId}::uuid
            and g.user_id=${actor.userId}::uuid and g.client_id=${actor.clientId}
            and g.revoked_at is null and g.expires_at>clock_timestamp()
            and 'knowledge.read'=any(g.scopes)
            and not f.revoked and c.active and 'knowledge.read'=any(c.scopes)
            and t.access_hash=${actor.tokenHash} and t.access_expires_at>clock_timestamp()
            and t.metadata->'scope' @> '["knowledge.read"]'::jsonb
          for share of g`.execute(trx)
      ).rows[0];
      if (!row) return denied();
      return row.spaceIds;
    }
    if (!actor.credentialId || !actor.tokenHash) return denied();
    const row = (
      await sql<{
        spaceIds: string[];
      }>`select t.space_ids from sc_api_tokens t
        where t.id=${actor.credentialId}::uuid and t.workspace_id=${actor.workspaceId}::uuid
          and t.owner_user_id=${actor.userId}::uuid and t.token_hash=${actor.tokenHash}
          and t.credential_type='mcp_scoped' and t.status='active' and t.revoked_at is null
          and (t.expires_at is null or t.expires_at>clock_timestamp())
          and 'knowledge.read'=any(t.scopes)
        for share of t`.execute(trx)
    ).rows[0];
    if (!row) return denied();
    return row.spaceIds;
  }

  async displayName(
    trx: KyselyTransaction,
    actor: CredentialLike,
  ): Promise<string> {
    if (this.kind(actor) === 'oauth' && actor.clientId) {
      if (!actor.tokenHash) return actor.clientId;
      const row = (
        await sql<{
          name: string;
        }>`select name from agent_oauth_clients where id=${actor.clientId}::uuid`.execute(
          trx,
        )
      ).rows[0];
      return row?.name ?? actor.clientId;
    }
    if (actor.credentialId) {
      const row = (
        await sql<{
          name: string;
        }>`select name from sc_api_tokens where id=${actor.credentialId}::uuid`.execute(
          trx,
        )
      ).rows[0];
      return row?.name ?? actor.credentialId;
    }
    return 'API token';
  }

  private kind(actor: CredentialLike): AgentCredentialKind {
    return actor.kind ?? (actor.apiTokenId ? 'api_token' : 'oauth');
  }
}
