import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import * as z from 'zod/v4';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { AgentOAuthService } from './agent-oauth.service';
import { OAUTH_SCOPES } from './oauth-contract';
import { agentPolicy, QUOTA_LIMITS } from '../document-command/agent-quota';
import { openCursor, sealCursor } from '../document-command/agent-cursor';

type Actor = { workspaceId: string; userId: string; sessionId: string };
const pageSchema = z.strictObject({
  cursor: z.string().max(8192).optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
const version = z.string().regex(/^\d+$/);
const shrinkSchema = z.strictObject({
  expected_version: version,
  scopes: z.array(z.enum(OAUTH_SCOPES)).min(1).max(4),
  space_ids: z.array(z.uuid()).min(1).max(100),
});
const policySchema = z.strictObject({
  expected_version: version,
  enabled: z.boolean(),
  max_grant_days: z.number().int().min(1).max(90),
  quota_limits: z.record(z.string(), z.number().int().min(1)),
  timezone: z.string().max(80).default('Asia/Shanghai'),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new BadRequestException('INVALID_ARGUMENT');
  return p.data;
}
@Injectable()
export class AgentManagementService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly oauth: AgentOAuthService,
  ) {}
  private tx<T>(
    a: Actor,
    write: boolean,
    fn: (trx: KyselyTransaction) => Promise<T>,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('app.workspace_id',${a.workspaceId},true),set_config('lock_timeout','2s',true),set_config('statement_timeout','5s',true)`.execute(
        trx,
      );
      if (write)
        await sql`select pg_advisory_xact_lock(20261018,1)`.execute(trx);
      else
        await sql`select pg_advisory_xact_lock_shared(20261018,1)`.execute(trx);
      await this.oauth.assertSession(trx, a);
      return fn(trx);
    });
  }
  private async admin(trx: KyselyTransaction, a: Actor) {
    const user = await trx
      .selectFrom('users')
      .select('role')
      .where('id', '=', a.userId)
      .where('workspaceId', '=', a.workspaceId)
      .executeTakeFirst();
    if (!user || !['owner', 'admin'].includes(user.role))
      throw new ForbiddenException('FORBIDDEN');
  }
  private async grant(trx: KyselyTransaction, a: Actor, id: string) {
    const row = (
      await sql<any>`select g.id,g.client_id,g.scopes,g.space_ids,g.expires_at,g.revoked_at,g.created_at,g.version::text,c.name,c.active,
      (select max(t.last_used_at) from agent_oauth_tokens t join agent_oauth_families f on f.id=t.family_id where f.grant_id=g.id) as last_used_at,
      case when g.revoked_at is not null then 'revoked' when g.expires_at<=clock_timestamp() then 'expired' when not c.active then 'suspended' else 'active' end as status
      from document_agent_grants g join agent_oauth_clients c on c.id::text=g.client_id where g.id=${id}::uuid and g.workspace_id=${a.workspaceId}::uuid and g.user_id=${a.userId}::uuid`.execute(
        trx,
      )
    ).rows[0];
    if (!row) throw new NotFoundException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    const spaces = await trx
      .selectFrom('spaces')
      .select(['id', 'name'])
      .where('workspaceId', '=', a.workspaceId)
      .where('id', 'in', row.spaceIds)
      .execute();
    return { ...row, spaces, csrf_token: this.oauth.managementCsrf(a) };
  }
  list(a: Actor, query: unknown) {
    const p = parse(pageSchema, query),
      binding = {
        tool: 'connections',
        workspace: a.workspaceId,
        user: a.userId,
      };
    const after = p.cursor ? String(openCursor(p.cursor, binding)) : '';
    return this.tx(a, false, async (trx) => {
      const rows = (
        await sql<any>`select g.id,c.name,g.version::text,g.scopes,g.space_ids,g.expires_at,g.revoked_at,
        case when g.revoked_at is not null then 'revoked' when g.expires_at<=clock_timestamp() then 'expired' when not c.active then 'suspended' else 'active' end as status
        from document_agent_grants g join agent_oauth_clients c on c.id::text=g.client_id where g.workspace_id=${a.workspaceId}::uuid and g.user_id=${a.userId}::uuid and g.id::text>${after} order by g.id limit ${p.page_size + 1}`.execute(
          trx,
        )
      ).rows;
      return {
        items: rows.slice(0, p.page_size),
        next_cursor:
          rows.length > p.page_size
            ? sealCursor(binding, rows[p.page_size - 1].id)
            : null,
      };
    });
  }
  detail(a: Actor, id: string) {
    return this.tx(a, false, (trx) => this.grant(trx, a, id));
  }
  change(a: Actor, id: string, input: unknown, revoke = false) {
    const p = revoke
      ? parse(z.strictObject({ expected_version: version }), input)
      : parse(shrinkSchema, input);
    return this.tx(a, true, async (trx) => {
      const g = await this.grant(trx, a, id);
      if (revoke && g.revokedAt) return g;
      if (g.version !== p.expected_version)
        throw new ConflictException('REVISION_CONFLICT');
      if (g.status !== 'active') throw new ConflictException('GRANT_INACTIVE');
      if (revoke) {
        await sql`update document_agent_grants set revoked_at=clock_timestamp(),version=version+1 where id=${id}::uuid`.execute(
          trx,
        );
        await sql`update agent_oauth_families set revoked=true where grant_id=${id}::uuid`.execute(
          trx,
        );
      } else {
        const shrink = p as z.infer<typeof shrinkSchema>;
        if (
          !shrink.scopes.includes('knowledge.read') ||
          shrink.scopes.some((s) => !g.scopes.includes(s)) ||
          shrink.space_ids.some((s) => !g.spaceIds.includes(s)) ||
          new Set(shrink.scopes).size !== shrink.scopes.length ||
          new Set(shrink.space_ids).size !== shrink.space_ids.length
        )
          throw new BadRequestException('SCOPE_EXPANSION_FORBIDDEN');
        await sql`update document_agent_grants set scopes=${shrink.scopes},space_ids=${shrink.space_ids}::uuid[],version=version+1 where id=${id}::uuid`.execute(
          trx,
        );
      }
      await sql`insert into agent_management_audit(workspace_id,user_id,grant_id,action) values(${a.workspaceId}::uuid,${a.userId}::uuid,${id}::uuid,${revoke ? 'revoke' : 'shrink'})`.execute(
        trx,
      );
      return this.grant(trx, a, id);
    });
  }
  policy(a: Actor) {
    return this.tx(a, false, async (trx) => {
      await this.admin(trx, a);
      return {
        ...(await agentPolicy(trx, a.workspaceId)),
        csrf_token: this.oauth.managementCsrf(a),
        hard_limits: QUOTA_LIMITS,
      };
    });
  }
  async updatePolicy(a: Actor, input: unknown) {
    const p = parse(policySchema, input);
    if (
      Object.entries(p.quota_limits).some(
        ([key, value]) =>
          !Object.prototype.hasOwnProperty.call(QUOTA_LIMITS, key) ||
          value > QUOTA_LIMITS[key],
      )
    )
      throw new BadRequestException('QUOTA_HARD_LIMIT');
    try {
      new Intl.DateTimeFormat('en', { timeZone: p.timezone }).format();
    } catch {
      throw new BadRequestException('INVALID_TIMEZONE');
    }
    return this.tx(a, true, async (trx) => {
      await this.admin(trx, a);
      const old = await agentPolicy(trx, a.workspaceId);
      if (old.version !== p.expected_version)
        throw new ConflictException('REVISION_CONFLICT');
      await sql`insert into agent_policies(workspace_id,enabled,max_grant_days,quota_limits,timezone) values(${a.workspaceId}::uuid,${p.enabled},${p.max_grant_days},${JSON.stringify(p.quota_limits)}::text::jsonb,${p.timezone}) on conflict(workspace_id) do update set enabled=excluded.enabled,max_grant_days=excluded.max_grant_days,quota_limits=excluded.quota_limits,timezone=excluded.timezone,version=agent_policies.version+1`.execute(
        trx,
      );
      if (old.timezone !== p.timezone) {
        // Carry the current usage to the next complete boundary in the new zone, never reset a partial day.
        await sql`update agent_quota_buckets set bucket_end=(date_trunc('day',bucket_end at time zone ${p.timezone})+
          case when bucket_end=(date_trunc('day',bucket_end at time zone ${p.timezone}) at time zone ${p.timezone}) then interval '0 day' else interval '1 day' end) at time zone ${p.timezone}
          where workspace_id=${a.workspaceId}::uuid and kind in ('create','edit') and bucket_end>clock_timestamp()`.execute(
          trx,
        );
      }
      await sql`insert into agent_management_audit(workspace_id,user_id,action) values(${a.workspaceId}::uuid,${a.userId}::uuid,'policy')`.execute(
        trx,
      );
      return {
        ...(await agentPolicy(trx, a.workspaceId)),
        csrf_token: this.oauth.managementCsrf(a),
        hard_limits: QUOTA_LIMITS,
      };
    });
  }
  activity(a: Actor, id: string | undefined, query: unknown) {
    const p = parse(
      pageSchema.extend({
        client_id: z.uuid().optional(),
        user_id: z.uuid().optional(),
        status: z
          .enum(['pending', 'running', 'committed', 'rejected', 'recovering'])
          .optional(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
      }),
      query,
    );
    const binding = {
      tool: 'activity',
      workspace: a.workspaceId,
      user: a.userId,
      grant: id ?? null,
      client: p.client_id,
      status: p.status,
      actor: p.user_id,
      from: p.from,
      to: p.to,
    };
    const cursor = p.cursor
      ? JSON.parse(String(openCursor(p.cursor, binding)))
      : null;
    return this.tx(a, false, async (trx) => {
      if (id) await this.grant(trx, a, id);
      else await this.admin(trx, a);
      const rows = (
        await sql<any>`select o.id,o.user_id,o.client_id,o.grant_id,o.page_id,o.tool,o.status,o.created_at,o.committed_at,
        o.result->>'changed' as changed,c.name as application,coalesce(to_jsonb(u)->>'name','用户') as actor_name,
        (select revision::text from document_recovery_snapshots s where s.operation_id=o.id and side='before') as before_revision,
        (select revision::text from document_recovery_snapshots s where s.operation_id=o.id and side='after') as after_revision
        from document_operations o left join agent_oauth_clients c on c.id::text=o.client_id left join users u on u.id=o.user_id and u.workspace_id=o.workspace_id
        where o.workspace_id=${a.workspaceId}::uuid ${id ? sql`and o.grant_id=${id}::uuid and o.user_id=${a.userId}::uuid` : sql``}
        ${p.client_id ? sql`and o.client_id=${p.client_id}` : sql``} ${p.user_id ? sql`and o.user_id=${p.user_id}::uuid` : sql``}
        ${p.status ? sql`and o.status=${p.status}` : sql``} ${p.from ? sql`and o.created_at>=${p.from}::timestamptz` : sql``} ${p.to ? sql`and o.created_at<=${p.to}::timestamptz` : sql``}
        ${cursor ? sql`and (o.created_at,o.id)<(${cursor[0]}::timestamptz,${cursor[1]}::uuid)` : sql``}
        order by o.created_at desc,o.id desc limit ${p.page_size + 1}`.execute(
          trx,
        )
      ).rows;
      const last = rows[p.page_size - 1];
      return {
        items: rows.slice(0, p.page_size),
        next_cursor:
          rows.length > p.page_size
            ? sealCursor(binding, JSON.stringify([last.createdAt, last.id]))
            : null,
      };
    });
  }
}
