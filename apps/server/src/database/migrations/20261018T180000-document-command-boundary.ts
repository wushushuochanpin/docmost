import { Kysely, sql } from 'kysely';

/** Additive: binary enforcement is opt-in per page; authority barriers cover all legacy writers. */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE document_gates (
      page_id uuid PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      generation uuid NOT NULL DEFAULT gen_random_uuid(), revision bigint NOT NULL DEFAULT 1,
      edit_epoch bigint NOT NULL DEFAULT 1, mode text NOT NULL DEFAULT 'open' CHECK(mode IN ('open','agent','recovering')),
      owner_id uuid, owner_epoch bigint NOT NULL DEFAULT 0, owner_until timestamptz,
      operation_id uuid, fence bigint NOT NULL DEFAULT 0, agent_until timestamptz
    );
    CREATE TABLE document_human_permits (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, page_id uuid NOT NULL REFERENCES document_gates(page_id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_id uuid NOT NULL,
      edit_epoch bigint NOT NULL, owner_epoch bigint NOT NULL, expires_at timestamptz NOT NULL
    );
    CREATE INDEX document_permits_page_expiry ON document_human_permits(page_id, expires_at);
    CREATE TABLE document_agent_grants (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id), client_id text NOT NULL,
      space_ids uuid[] NOT NULL, scopes text[] NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
    );
    CREATE TABLE document_operations (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, user_id uuid NOT NULL, client_id text NOT NULL,
      grant_id uuid NOT NULL REFERENCES document_agent_grants(id), page_id uuid NOT NULL,
      tool text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
      status text NOT NULL CHECK(status IN ('pending','running','committed','rejected','recovering')),
      result jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), committed_at timestamptz,
      UNIQUE(workspace_id,user_id,client_id,grant_id,tool,idempotency_key)
    );
    CREATE INDEX document_operations_pending ON document_operations(status,created_at);
    CREATE TABLE document_updates (
      workspace_id uuid NOT NULL, page_id uuid NOT NULL REFERENCES document_gates(page_id) ON DELETE CASCADE,
      update_id text NOT NULL, session_id uuid NOT NULL, update_hash text NOT NULL, update_bytes bytea NOT NULL, revision bigint NOT NULL,
      user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(page_id,session_id,update_id)
    );
    CREATE TABLE document_recovery_snapshots (
      operation_id uuid NOT NULL REFERENCES document_operations(id), workspace_id uuid NOT NULL,
      page_id uuid NOT NULL, side text NOT NULL CHECK(side IN ('before','after')),
      history_id uuid REFERENCES page_history(id) ON DELETE SET NULL,
      ydoc bytea NOT NULL, title text, revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(operation_id,side)
    );
    CREATE TABLE document_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid REFERENCES document_operations(id),
      workspace_id uuid NOT NULL, page_id uuid NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), delivered_at timestamptz,
      UNIQUE(operation_id,kind)
    );
  `.execute(db);
  for (const table of [
    'document_gates',
    'document_human_permits',
    'document_agent_grants',
    'document_operations',
    'document_updates',
    'document_recovery_snapshots',
    'document_outbox',
  ]) {
    await sql
      .raw(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${table}_tenant ON ${table}
      USING(workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid)
      WITH CHECK(workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid)`,
      )
      .execute(db);
  }
  // Statement triggers acquire the authority lock BEFORE row locks. This also covers legacy SQL.
  await sql`
    CREATE FUNCTION document_security_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(20261018,1);
      RETURN NULL;
    END $$;
    CREATE FUNCTION document_page_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock_shared(20261018,1);
      RETURN NULL;
    END $$;
    CREATE TRIGGER document_page_statement BEFORE INSERT OR UPDATE OR DELETE ON pages
      FOR EACH STATEMENT EXECUTE FUNCTION document_page_barrier();
    CREATE TRIGGER document_00_page_structure BEFORE INSERT OR DELETE OR UPDATE OF parent_page_id,space_id,workspace_id,deleted_at ON pages
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier();
    CREATE FUNCTION document_guard_write() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE gate document_gates%ROWTYPE; ticket text; prior_workspace text;
    BEGIN
      -- Caller already holds the pages row lock. Coordinator uses the same pages -> gate order.
      prior_workspace := current_setting('app.workspace_id',true);
      IF nullif(prior_workspace,'') IS NOT NULL AND prior_workspace <> OLD.workspace_id::text THEN RAISE EXCEPTION 'DOCUMENT_TENANT_MISMATCH'; END IF;
      PERFORM set_config('app.workspace_id',OLD.workspace_id::text,true);
      SELECT * INTO gate FROM document_gates WHERE page_id=OLD.id;
      IF NOT FOUND THEN
        PERFORM set_config('app.workspace_id',coalesce(prior_workspace,''),true);
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
      END IF;
      IF gate.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'DOCUMENT_TENANT_MISMATCH'; END IF;
      ticket := current_setting('app.document_ticket',true);
      IF gate.mode <> 'open' AND ticket IS DISTINCT FROM (gate.page_id::text || ':' || gate.fence::text) THEN
        RAISE EXCEPTION 'DOCUMENT_BUSY' USING ERRCODE='55000';
      END IF;
      IF TG_OP='DELETE' THEN
        PERFORM set_config('app.workspace_id',coalesce(prior_workspace,''),true);
        RETURN OLD;
      END IF;
      IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'DOCUMENT_TENANT_MISMATCH'; END IF;
      IF NEW.ydoc IS DISTINCT FROM OLD.ydoc OR NEW.content IS DISTINCT FROM OLD.content THEN
        IF current_setting('app.document_binary_writer',true) IS DISTINCT FROM OLD.id::text THEN
          RAISE EXCEPTION 'DOCUMENT_WRITER_REQUIRED' USING ERRCODE='55000';
        END IF;
      END IF;
      IF NEW.ydoc IS DISTINCT FROM OLD.ydoc OR NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title THEN
        UPDATE document_gates SET revision=revision+1 WHERE page_id=OLD.id;
      END IF;
      PERFORM set_config('app.workspace_id',coalesce(prior_workspace,''),true);
      RETURN NEW;
    END $$;
    CREATE TRIGGER document_page_guard BEFORE UPDATE OR DELETE ON pages FOR EACH ROW EXECUTE FUNCTION document_guard_write();
  `.execute(db);
  // Explicit list: migrations adding new permission authorities must extend this barrier.
  for (const table of [
    'workspaces',
    'users',
    'user_sessions',
    'spaces',
    'space_members',
    'groups',
    'group_users',
    'page_access',
    'page_permissions',
    'page_node_meta',
    'document_agent_grants',
  ]) {
    const events =
      table === 'user_sessions'
        ? 'DELETE OR UPDATE OF revoked_at,expires_at,user_id,workspace_id'
        : 'INSERT OR UPDATE OR DELETE';
    await sql
      .raw(
        `CREATE TRIGGER document_authority_statement BEFORE ${events} ON ${table}
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier()`,
      )
      .execute(db);
  }
}

export async function down(): Promise<void> {
  throw new Error(
    'Forward-only: drain operations and checkpoint documents before removing the writer protocol',
  );
}
