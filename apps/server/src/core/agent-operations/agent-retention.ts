import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
export type RetentionPolicy = {
  resultDays: number;
  auditDays: number;
  historyDays: number;
  backupDays: number;
  batch: number;
  held: boolean;
};
function days(name: string, fallback: number, min: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > 36500)
    throw Error('INVALID_RETENTION_POLICY');
  return value;
}
export function retentionPolicy(workspace: string): RetentionPolicy {
  const holds = (process.env.AGENT_RETENTION_HOLD_WORKSPACES ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    holds.some(
      (value) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          value,
        ),
    )
  )
    throw Error('INVALID_RETENTION_HOLD');
  return {
    resultDays: days('AGENT_RETENTION_RESULT_DAYS', 30, 30),
    auditDays: days('AGENT_RETENTION_AUDIT_DAYS', 180, 180),
    historyDays: days('AGENT_RETENTION_HISTORY_DAYS', 180, 180),
    backupDays: days('AGENT_RETENTION_BACKUP_DAYS', 7, 1),
    batch: 200,
    held: holds.includes(workspace.toLowerCase()),
  };
}
/** A short, exclusive authority barrier makes pruning atomic with token rotation, ACL and all document writers. */
export async function retainWorkspace(
  db: KyselyDB,
  workspace: string,
  p: RetentionPolicy,
) {
  if (p.held) return { skipped: 'hold' };
  if (
    [p.resultDays, p.auditDays, p.historyDays, p.backupDays].some(
      (value) => !Number.isInteger(value) || value > 36500,
    ) ||
    p.resultDays < 30 ||
    p.auditDays < 180 ||
    p.historyDays < 180 ||
    p.backupDays < 1 ||
    !Number.isInteger(p.batch) ||
    p.batch < 1 ||
    p.batch > 500
  )
    throw Error('INVALID_RETENTION_POLICY');
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.workspace_id',${workspace},true),set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`.execute(
      trx,
    );
    const locked = (
      await sql<{
        locked: boolean;
      }>`select pg_try_advisory_xact_lock(20261018,1) as locked`.execute(trx)
    ).rows[0].locked;
    if (!locked) return { skipped: 'busy' };
    // Respect both existing audit configurations; the current audit service defaults to 365 days.
    const existing = (
      await sql<{ days: string | number }>`select greatest(
      coalesce((select retention_days from sc_audit_retention where workspace_id=${workspace}::uuid),365),
      coalesce((select (to_jsonb(w)->>'audit_retention_days')::bigint from workspaces w where id=${workspace}::uuid),0)
    ) as days`.execute(trx)
    ).rows[0];
    const auditDays = Math.max(p.auditDays, Number(existing.days));
    // No terminal data is pruned while its gate, outbox or quota reservation is unresolved.
    const settled = sql`o.status in ('committed','rejected') AND NOT EXISTS(select 1 from document_gates g where g.operation_id=o.id AND g.mode<>'open') AND NOT EXISTS(select 1 from document_outbox b where b.operation_id=o.id AND b.delivered_at is null) AND NOT EXISTS(select 1 from agent_quota_reservations q where q.operation_id=o.id AND q.state='reserved')`;
    const result =
      await sql`update document_operations set result=null,result_expired_at=clock_timestamp() where id in (select o.id from document_operations o where o.workspace_id=${workspace}::uuid AND ${settled} AND o.result is not null AND (o.status<>'committed' OR o.result->>'changed'='false' OR (EXISTS(select 1 from document_recovery_snapshots s where s.operation_id=o.id AND s.side='after') AND (o.tool in ('create_page','create_folder') OR EXISTS(select 1 from document_recovery_snapshots s where s.operation_id=o.id AND s.side='before')))) AND o.result_expired_at is null AND coalesce(o.committed_at,o.created_at)<clock_timestamp()-${p.resultDays}*interval '1 day' order by o.created_at,o.id limit ${p.batch}) returning id`.execute(
        trx,
      );
    // History-linked snapshots follow the existing history lifecycle, not an independent expiry clock.
    const snapshots =
      await sql`delete from document_recovery_snapshots s where (s.operation_id,s.side) in (select s.operation_id,s.side from document_recovery_snapshots s join document_operations o on o.id=s.operation_id where s.workspace_id=${workspace}::uuid AND s.history_id is null AND s.created_at<clock_timestamp()-${p.historyDays}*interval '1 day' AND ${settled} order by s.created_at,s.operation_id,s.side limit ${p.batch}) returning operation_id`.execute(
        trx,
      );
    // Keep per-session replay keys until absolute session expiry/revocation +24h AND backup window.
    const journal =
      await sql`delete from document_updates u where (u.page_id,u.session_id,u.update_id) in (select u.page_id,u.session_id,u.update_id from document_updates u join document_gates g on g.page_id=u.page_id join pages p on p.id=u.page_id where u.workspace_id=${workspace}::uuid AND p.ydoc is not null AND g.mode='open' AND u.revision<=g.checkpoint_revision AND u.created_at<clock_timestamp()-${p.backupDays}*interval '1 day' AND NOT EXISTS(select 1 from user_sessions s where s.id=u.session_id AND least(s.expires_at,coalesce(s.revoked_at,s.expires_at))>clock_timestamp()-interval '24 hours') AND NOT EXISTS(select 1 from document_human_permits h where h.page_id=u.page_id AND h.expires_at>clock_timestamp()) order by u.created_at,u.page_id,u.session_id,u.update_id limit ${p.batch}) returning page_id`.execute(
        trx,
      );
    const payloads =
      await sql`update document_outbox set payload='{}'::jsonb where id in (select b.id from document_outbox b where b.workspace_id=${workspace}::uuid AND b.payload<>'{}'::jsonb AND b.delivered_at<clock_timestamp()-${p.backupDays}*interval '1 day' AND (b.operation_id is null OR EXISTS(select 1 from document_operations o where o.id=b.operation_id AND ${settled})) order by b.delivered_at,b.id limit ${p.batch}) returning id`.execute(
        trx,
      );
    const audit =
      await sql`delete from agent_management_audit where id in (select id from agent_management_audit where workspace_id=${workspace}::uuid AND created_at<clock_timestamp()-${auditDays}*interval '1 day' order by created_at,id limit ${p.batch}) returning id`.execute(
        trx,
      );
    const codes =
      await sql`delete from agent_oauth_codes where hash in (select hash from agent_oauth_codes where workspace_id=${workspace}::uuid AND expires_at<clock_timestamp()-interval '24 hours' order by expires_at,hash limit ${p.batch}) returning hash`.execute(
        trx,
      );
    const requests =
      await sql`delete from agent_oauth_requests where id in (select id from agent_oauth_requests where workspace_id=${workspace}::uuid AND expires_at<clock_timestamp()-interval '24 hours' AND coalesce(response_until,expires_at)<clock_timestamp()-interval '24 hours' order by expires_at,id limit ${p.batch}) returning id`.execute(
        trx,
      );
    // Prune tokens as a whole family only after the grant and every token have absolutely expired.
    const tokens =
      await sql`delete from agent_oauth_tokens where access_hash in (select t.access_hash from agent_oauth_tokens t join agent_oauth_families f on f.id=t.family_id join document_agent_grants g on g.id=f.grant_id where f.workspace_id=${workspace}::uuid AND g.expires_at<clock_timestamp()-interval '24 hours' AND NOT EXISTS(select 1 from agent_oauth_tokens alive where alive.family_id=f.id AND greatest(alive.access_expires_at,alive.refresh_expires_at)>clock_timestamp()-interval '24 hours') order by t.access_expires_at,t.access_hash limit ${p.batch}) returning access_hash`.execute(
        trx,
      );
    const families =
      await sql`delete from agent_oauth_families where id in (select f.id from agent_oauth_families f join document_agent_grants g on g.id=f.grant_id where f.workspace_id=${workspace}::uuid AND g.expires_at<clock_timestamp()-interval '24 hours' AND NOT EXISTS(select 1 from agent_oauth_tokens t where t.family_id=f.id) order by f.id limit ${p.batch}) returning id`.execute(
        trx,
      );
    const reservations =
      await sql`delete from agent_quota_reservations where (operation_id,bucket_id) in (select q.operation_id,q.bucket_id from agent_quota_reservations q join document_operations o on o.id=q.operation_id join agent_quota_buckets b on b.id=q.bucket_id where q.workspace_id=${workspace}::uuid AND q.state<>'reserved' AND b.bucket_end<clock_timestamp()-${auditDays}*interval '1 day' AND ${settled} order by q.operation_id,q.bucket_id limit ${p.batch}) returning operation_id`.execute(
        trx,
      );
    const buckets =
      await sql`delete from agent_quota_buckets where id in (select b.id from agent_quota_buckets b where b.workspace_id=${workspace}::uuid AND b.reserved=0 AND b.bucket_end<clock_timestamp()-${auditDays}*interval '1 day' AND NOT EXISTS(select 1 from agent_quota_reservations q where q.bucket_id=b.id) order by b.bucket_end,b.id limit ${p.batch}) returning id`.execute(
        trx,
      );
    await sql`delete from agent_maintenance_runs where id in (select id from agent_maintenance_runs where workspace_id=${workspace}::uuid AND created_at<clock_timestamp()-${auditDays}*interval '1 day' order by created_at,id limit ${p.batch})`.execute(
      trx,
    );
    const counts = {
      results: result.rows.length,
      snapshots: snapshots.rows.length,
      journal: journal.rows.length,
      outbox_payloads: payloads.rows.length,
      audit: audit.rows.length,
      oauth_codes: codes.rows.length,
      oauth_requests: requests.rows.length,
      oauth_tokens: tokens.rows.length,
      oauth_families: families.rows.length,
      quota_reservations: reservations.rows.length,
      quota_buckets: buckets.rows.length,
    };
    if (Object.values(counts).some((n) => n > 0))
      await sql`insert into agent_maintenance_runs(workspace_id,counts) values(${workspace}::uuid,${JSON.stringify(counts)}::text::jsonb)`.execute(
        trx,
      );
    return { counts };
  });
}

export async function retainUnboundRequests(db: KyselyDB) {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`.execute(
      trx,
    );
    const locked = (
      await sql<{
        locked: boolean;
      }>`select pg_try_advisory_xact_lock(20261018,1) as locked`.execute(trx)
    ).rows[0].locked;
    if (!locked) return 0;
    const result =
      await sql`delete from agent_oauth_requests where id in (select id from agent_oauth_requests where workspace_id is null AND expires_at<clock_timestamp()-interval '24 hours' AND coalesce(response_until,expires_at)<clock_timestamp()-interval '24 hours' order by expires_at,id limit 200) returning id`.execute(
        trx,
      );
    return result.rows.length;
  });
}
