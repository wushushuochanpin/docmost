import { Kysely, sql } from 'kysely';

const DIRECT_WORKSPACE_TABLES = [
  'api_keys',
  'attachments',
  'auth_accounts',
  'auth_providers',
  'backlinks',
  'billing',
  'comments',
  'file_tasks',
  'folder_migration_jobs',
  'groups',
  'page_history',
  'page_node_meta',
  'pages',
  'shares',
  'spaces',
  'user_mfa',
  'workspace_invitations',
  'workspace_release_channel',
];

const NULLABLE_WORKSPACE_TABLES = ['users', 'user_tokens'];

const LINKED_WORKSPACE_TABLES = [
  'space_members',
  'group_users',
  'folder_migration_job_items',
];

const WORKSPACE_ROOT_TABLES = ['workspaces'];

const WORKSPACE_SETTING = `nullif(current_setting('app.workspace_id', true), '')`;

function directWorkspaceExpr(allowNullableWorkspaceId = false): string {
  const baseExpr =
    `${WORKSPACE_SETTING} is null ` +
    `or workspace_id = ${WORKSPACE_SETTING}::uuid`;

  if (!allowNullableWorkspaceId) {
    return baseExpr;
  }

  return (
    `${WORKSPACE_SETTING} is null ` +
    `or workspace_id is null ` +
    `or workspace_id = ${WORKSPACE_SETTING}::uuid`
  );
}

function linkedWorkspaceExpr(table: string): string {
  if (table === 'space_members') {
    return (
      `${WORKSPACE_SETTING} is null ` +
      `or exists (` +
      `select 1 from spaces s ` +
      `where s.id = space_members.space_id ` +
      `and s.workspace_id = ${WORKSPACE_SETTING}::uuid` +
      `)`
    );
  }

  if (table === 'group_users') {
    return (
      `${WORKSPACE_SETTING} is null ` +
      `or exists (` +
      `select 1 from groups g ` +
      `where g.id = group_users.group_id ` +
      `and g.workspace_id = ${WORKSPACE_SETTING}::uuid` +
      `)`
    );
  }

  return (
    `${WORKSPACE_SETTING} is null ` +
    `or exists (` +
    `select 1 from folder_migration_jobs j ` +
    `where j.id = folder_migration_job_items.job_id ` +
    `and j.workspace_id = ${WORKSPACE_SETTING}::uuid` +
    `)`
  );
}

function workspaceRootExpr(): string {
  return `${WORKSPACE_SETTING} is null or id = ${WORKSPACE_SETTING}::uuid`;
}

async function enableRlsWithPolicy(
  db: Kysely<any>,
  table: string,
  usingExpr: string,
) {
  const policyName = `tenant_rls_${table}`;

  await sql.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`).execute(db);
  await sql.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`).execute(db);

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
    await enableRlsWithPolicy(db, table, directWorkspaceExpr(false));
  }

  for (const table of NULLABLE_WORKSPACE_TABLES) {
    await enableRlsWithPolicy(db, table, directWorkspaceExpr(true));
  }

  for (const table of LINKED_WORKSPACE_TABLES) {
    await enableRlsWithPolicy(db, table, linkedWorkspaceExpr(table));
  }

  for (const table of WORKSPACE_ROOT_TABLES) {
    await enableRlsWithPolicy(db, table, workspaceRootExpr());
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of WORKSPACE_ROOT_TABLES) {
    await removeRlsPolicy(db, table);
  }

  for (const table of LINKED_WORKSPACE_TABLES) {
    await removeRlsPolicy(db, table);
  }

  for (const table of NULLABLE_WORKSPACE_TABLES) {
    await removeRlsPolicy(db, table);
  }

  for (const table of DIRECT_WORKSPACE_TABLES) {
    await removeRlsPolicy(db, table);
  }
}
