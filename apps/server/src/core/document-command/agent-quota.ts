import { sql } from 'kysely';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { DocumentCommandError } from './document-candidate';

export const QUOTA_LIMITS = {
  read: 60,
  write: 10,
  query: 30,
  preview: 10,
  grant_create: 100,
  grant_edit: 500,
  workspace_create: 500,
  workspace_edit: 2000,
  grant_concurrency: 2,
  workspace_concurrency: 10,
} as const;
export class AgentRateLimitError extends DocumentCommandError {
  constructor(
    readonly reason: 'minute' | 'day' | 'concurrency',
    readonly retryAfterMs: number,
  ) {
    super('RATE_LIMITED');
  }
}
type Actor = { workspaceId: string; grantId: string };
export async function quotaLock(trx: KyselyTransaction, workspace: string) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${workspace},20261019))`.execute(
    trx,
  );
}
export async function agentPolicy(trx: KyselyTransaction, workspace: string) {
  const row = (
    await sql<any>`select *,quota_limits::text as limits_json from agent_policies where workspace_id=${workspace}::uuid`.execute(
      trx,
    )
  ).rows[0];
  return {
    enabled: row?.enabled ?? false,
    maxGrantDays: row?.maxGrantDays ?? 30,
    timezone: row?.timezone ?? 'Asia/Shanghai',
    version: String(row?.version ?? 0),
    quotaLimits: {
      ...QUOTA_LIMITS,
      ...(row?.limitsJson ? JSON.parse(row.limitsJson) : {}),
    },
  };
}
async function bucket(
  trx: KyselyTransaction,
  a: Actor,
  subject: string,
  kind: string,
  daily: boolean,
  timezone: string,
) {
  const current = (
    await sql<any>`select *, greatest(1,extract(epoch from (bucket_end-clock_timestamp()))*1000)::integer as retry from agent_quota_buckets where workspace_id=${a.workspaceId}::uuid and subject=${subject} and kind=${kind} and bucket_end>clock_timestamp() order by bucket_start desc limit 1 for update`.execute(
      trx,
    )
  ).rows[0];
  if (current) return current;
  const period = daily
    ? sql`date_trunc('day',clock_timestamp() at time zone ${timezone}) at time zone ${timezone}`
    : sql`date_trunc('minute',clock_timestamp())`;
  const end = daily
    ? sql`(date_trunc('day',clock_timestamp() at time zone ${timezone})+interval '1 day') at time zone ${timezone}`
    : sql`date_trunc('minute',clock_timestamp())+interval '1 minute'`;
  return (
    await sql<any>`insert into agent_quota_buckets(workspace_id,subject,kind,bucket_start,bucket_end) values(${a.workspaceId}::uuid,${subject},${kind},${period},${end}) returning *,greatest(1,extract(epoch from (bucket_end-clock_timestamp()))*1000)::integer as retry`.execute(
      trx,
    )
  ).rows[0];
}
export async function chargeRate(
  trx: KyselyTransaction,
  a: Actor,
  kinds: ('read' | 'write' | 'query' | 'preview')[],
) {
  await quotaLock(trx, a.workspaceId);
  const policy = await agentPolicy(trx, a.workspaceId);
  for (const kind of [...kinds].sort()) {
    const b = await bucket(trx, a, a.grantId, kind, false, policy.timezone);
    if (b.used >= policy.quotaLimits[kind])
      throw new AgentRateLimitError('minute', b.retry);
    await sql`update agent_quota_buckets set used=used+1 where id=${b.id}::uuid`.execute(
      trx,
    );
  }
}
export async function reserveQuota(
  trx: KyselyTransaction,
  a: Actor,
  operation: string,
  kind: 'create' | 'edit',
) {
  await quotaLock(trx, a.workspaceId);
  const policy = await agentPolicy(trx, a.workspaceId);
  if (!policy.enabled) throw new DocumentCommandError('MCP_DISABLED');
  const concurrency = (
    await sql<any>`select count(*)::integer as workspace,count(*) filter(where grant_id=${a.grantId}::uuid)::integer as grant from document_operations where workspace_id=${a.workspaceId}::uuid and status in ('pending','running','recovering') and id<>${operation}::uuid`.execute(
      trx,
    )
  ).rows[0];
  if (
    concurrency.workspace >= policy.quotaLimits.workspace_concurrency ||
    concurrency.grant >= policy.quotaLimits.grant_concurrency
  )
    throw new AgentRateLimitError('concurrency', 2000);
  await chargeRate(trx, a, ['write']);
  for (const [subject, limit] of [
    [a.grantId, policy.quotaLimits['grant_' + kind]],
    ['workspace', policy.quotaLimits['workspace_' + kind]],
  ] as [string, number][]) {
    const b = await bucket(trx, a, subject, kind, true, policy.timezone);
    if (b.used + b.reserved >= limit)
      throw new AgentRateLimitError('day', b.retry);
    await sql`insert into agent_quota_reservations(workspace_id,operation_id,bucket_id) values(${a.workspaceId}::uuid,${operation}::uuid,${b.id}::uuid)`.execute(
      trx,
    );
    await sql`update agent_quota_buckets set reserved=reserved+1 where id=${b.id}::uuid`.execute(
      trx,
    );
  }
}
export async function settleQuota(
  trx: KyselyTransaction,
  operation: string,
  changed: boolean,
) {
  const rows = (
    await sql<any>`update agent_quota_reservations set state=${changed ? 'used' : 'released'} where operation_id=${operation}::uuid and state='reserved' returning bucket_id`.execute(
      trx,
    )
  ).rows;
  for (const row of rows)
    await sql`update agent_quota_buckets set reserved=reserved-1,used=used+${changed ? 1 : 0} where id=${row.bucketId}::uuid`.execute(
      trx,
    );
}

/** Short burst protection before parsing Markdown; this is separate from business quotas. */
export async function chargeEntrance(trx: KyselyTransaction, actor: Actor) {
  await quotaLock(trx, actor.workspaceId);
  const row = (
    await sql<any>`insert into agent_quota_buckets(workspace_id,subject,kind,bucket_start,bucket_end,used)
    values(${actor.workspaceId}::uuid,${actor.grantId},'entrance',date_trunc('second',clock_timestamp()),date_trunc('second',clock_timestamp())+interval '1 second',1)
    on conflict(workspace_id,subject,kind,bucket_start) do update set used=agent_quota_buckets.used+1 where agent_quota_buckets.used<60 returning id`.execute(
      trx,
    )
  ).rows[0];
  if (!row) throw new AgentRateLimitError('minute', 1000);
}
