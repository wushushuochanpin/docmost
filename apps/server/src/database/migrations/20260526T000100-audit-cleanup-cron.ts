import { Kysely, sql } from 'kysely';

/**
 * Adds a PostgreSQL pg_cron job to clean up expired audit logs, as a
 * database-level safety net in case the application-level
 * AuditLogCleanupService is not running.
 *
 * The job runs hourly and deletes audit rows older than the workspace's
 * configured audit_retention_days (default 90 if unset).
 *
 * If pg_cron is not installed, the migration is a no-op.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Only proceed if pg_cron extension is available
  const hasPgCron = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) AS "exists"
  `.execute(db);

  if (!hasPgCron.rows[0]?.exists) {
    return;
  }

  // Remove any previous version of this job to avoid duplicates
  await sql.raw(`
    SELECT cron.unschedule('docmost-audit-cleanup')
  `).execute(db).catch(() => {});

  // Schedule: every hour, delete audit rows past retention
  await sql.raw(`
    SELECT cron.schedule(
      'docmost-audit-cleanup',
      '0 * * * *',
      $$
        DELETE FROM audit a
        USING workspaces w
        WHERE a.workspace_id = w.id
          AND a.created_at < now() - make_interval(
            days => COALESCE(w.audit_retention_days, 90)::int
          )
      $$
    )
  `).execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  const hasPgCron = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) AS "exists"
  `.execute(db);

  if (!hasPgCron.rows[0]?.exists) {
    return;
  }

  await sql.raw(`
    SELECT cron.unschedule('docmost-audit-cleanup')
  `).execute(db).catch(() => {});
}
