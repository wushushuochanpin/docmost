import { Kysely, sql } from 'kysely';

/** Additive; existing grants remain readable. Workspace writes require explicit policy opt-in. */
export async function up(db: Kysely<any>) {
  await sql`
    ALTER TABLE IF EXISTS agent_oauth_tokens ADD COLUMN last_used_at timestamptz;
    ALTER TABLE document_agent_grants ADD COLUMN version bigint NOT NULL DEFAULT 1,
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN last_used_at timestamptz;
    CREATE INDEX agent_grants_owner ON document_agent_grants(workspace_id,user_id,created_at,id);
    CREATE INDEX agent_operations_activity ON document_operations(workspace_id,grant_id,created_at,id);
    CREATE TABLE agent_policies (
      workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      version bigint NOT NULL DEFAULT 1, enabled boolean NOT NULL DEFAULT false,
      max_grant_days integer NOT NULL DEFAULT 30 CHECK(max_grant_days BETWEEN 1 AND 90),
      timezone text NOT NULL DEFAULT 'Asia/Shanghai', quota_limits jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE agent_quota_buckets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      subject text NOT NULL, kind text NOT NULL, bucket_start timestamptz NOT NULL,bucket_end timestamptz NOT NULL,
      used integer NOT NULL DEFAULT 0 CHECK(used>=0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),
      UNIQUE(workspace_id,subject,kind,bucket_start)
    );
    CREATE INDEX agent_quota_current ON agent_quota_buckets(workspace_id,subject,kind,bucket_end);
    CREATE INDEX agent_quota_expiry ON agent_quota_buckets(workspace_id,bucket_end);
    CREATE TABLE agent_quota_reservations (
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      operation_id uuid NOT NULL REFERENCES document_operations(id),bucket_id uuid NOT NULL REFERENCES agent_quota_buckets(id),
      state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','used','released')), PRIMARY KEY(operation_id,bucket_id)
    );
    CREATE TABLE agent_management_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL,grant_id uuid,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TRIGGER document_authority_statement BEFORE INSERT OR UPDATE OR DELETE ON agent_policies
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier();
  `.execute(db);
  for (const table of [
    'agent_policies',
    'agent_quota_buckets',
    'agent_quota_reservations',
    'agent_management_audit',
  ]) {
    await sql
      .raw(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${table}_tenant ON ${table} USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid)
      WITH CHECK(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid)`,
      )
      .execute(db);
  }
}
export async function down() {
  throw new Error(
    'Forward-only: disable writes and drain reservations before rollback',
  );
}
