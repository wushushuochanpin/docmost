import { Kysely, sql } from 'kysely';

/**
 * Extends tenant RLS policies to tables that were created after the initial
 * RLS rollout (20260219T030000-full-tenant-rls-rollout) and were never
 * covered.
 *
 * See PRD-20260526-01-security-stability-hardening (P0-2).
 */

const DIRECT_WORKSPACE_TABLES = [
  'backup_jobs',
  'backup_policies',
  'backup_restores',
  'notifications',
  'watchers',
  'page_access',
  'audit',
  'sc_api_tokens',
  'sc_api_token_events',
  'sc_audit_events',
  'sc_audit_retention',
  'space_sidebar_categories',
  'user_sessions',
  'ai_chats',
  'ai_chat_messages',
  'templates',
  'favorites',
  'page_verifications',
  'scim_tokens',
  'page_transclusions',
  'page_transclusion_references',
  'labels',
];

const LINKED_WORKSPACE_TABLES: Record<string, string> = {
  // page_permissions has no workspace_id; it links via page_access.workspace_id
  page_permissions: `
    nullif(current_setting('app.workspace_id', true), '') is null
    or exists (
      select 1 from page_access pa
      where pa.id = page_permissions.page_access_id
      and pa.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    )
  `,
  // page_verifiers has no workspace_id; it links via page_verifications.workspace_id
  page_verifiers: `
    nullif(current_setting('app.workspace_id', true), '') is null
    or exists (
      select 1 from page_verifications pv
      where pv.id = page_verifiers.page_verification_id
      and pv.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    )
  `,
  // page_labels has no workspace_id; it links via labels.workspace_id
  page_labels: `
    nullif(current_setting('app.workspace_id', true), '') is null
    or exists (
      select 1 from labels l
      where l.id = page_labels.label_id
      and l.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    )
  `,
};

const WORKSPACE_SETTING = `nullif(current_setting('app.workspace_id', true), '')`;

function directWorkspaceExpr(): string {
  return (
    `${WORKSPACE_SETTING} is null ` +
    `or workspace_id = ${WORKSPACE_SETTING}::uuid`
  );
}

async function enableRlsWithPolicy(
  db: Kysely<any>,
  table: string,
  usingExpr: string,
) {
  const policyName = `tenant_rls_${table}`;

  await sql
    .raw(`ALTER TABLE IF EXISTS "${table}" ENABLE ROW LEVEL SECURITY`)
    .execute(db);
  await sql
    .raw(`ALTER TABLE IF EXISTS "${table}" FORCE ROW LEVEL SECURITY`)
    .execute(db);

  await sql
    .raw(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '${table}'
      AND p.polname = '${policyName}'
  ) THEN
    CREATE POLICY "${policyName}" ON "${table}"
      FOR ALL
      USING (${usingExpr})
      WITH CHECK (${usingExpr});
  END IF;
END
$$`)
    .execute(db);
}

async function removeRlsPolicy(db: Kysely<any>, table: string) {
  const policyName = `tenant_rls_${table}`;

  await sql
    .raw(`DROP POLICY IF EXISTS "${policyName}" ON "${table}"`)
    .execute(db);
  await sql
    .raw(`ALTER TABLE IF EXISTS "${table}" NO FORCE ROW LEVEL SECURITY`)
    .execute(db);
  await sql
    .raw(`ALTER TABLE IF EXISTS "${table}" DISABLE ROW LEVEL SECURITY`)
    .execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  for (const table of DIRECT_WORKSPACE_TABLES) {
    await enableRlsWithPolicy(db, table, directWorkspaceExpr());
  }

  for (const [table, expr] of Object.entries(LINKED_WORKSPACE_TABLES)) {
    await enableRlsWithPolicy(db, table, expr);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const [table] of Object.entries(LINKED_WORKSPACE_TABLES)) {
    await removeRlsPolicy(db, table);
  }

  for (const table of DIRECT_WORKSPACE_TABLES) {
    await removeRlsPolicy(db, table);
  }
}
