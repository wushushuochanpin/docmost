import { Kysely, sql } from 'kysely';

const WORKSPACE_SETTING = `nullif(current_setting('app.workspace_id', true), '')`;

const DIRECT_WORKSPACE_TABLES = [
  'ai_chats',
  'ai_chat_messages',
  'backup_jobs',
  'backup_policies',
  'backup_restores',
  'favorites',
  'page_verifications',
  'sc_api_token_events',
  'sc_api_tokens',
  'sc_audit_events',
  'sc_audit_retention',
  'space_sidebar_categories',
  'templates',
  'user_sessions',
];

const LINKED_WORKSPACE_TABLES = ['page_verifiers'];

function directWorkspaceExpr(): string {
  return (
    `${WORKSPACE_SETTING} is null ` +
    `or workspace_id = ${WORKSPACE_SETTING}::uuid`
  );
}

function linkedWorkspaceExpr(table: string): string {
  if (table === 'page_verifiers') {
    return (
      `${WORKSPACE_SETTING} is null ` +
      `or exists (` +
      `select 1 from page_verifications pv ` +
      `where pv.id = page_verifiers.page_verification_id ` +
      `and pv.workspace_id = ${WORKSPACE_SETTING}::uuid` +
      `)`
    );
  }

  throw new Error(`Unsupported linked RLS table: ${table}`);
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
    .raw(
      `DO $$
BEGIN
  IF to_regclass('public.${table}') IS NOT NULL
    AND NOT EXISTS (
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
$$`,
    )
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

  for (const table of LINKED_WORKSPACE_TABLES) {
    await enableRlsWithPolicy(db, table, linkedWorkspaceExpr(table));
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of LINKED_WORKSPACE_TABLES) {
    await removeRlsPolicy(db, table);
  }

  for (const table of DIRECT_WORKSPACE_TABLES) {
    await removeRlsPolicy(db, table);
  }
}
