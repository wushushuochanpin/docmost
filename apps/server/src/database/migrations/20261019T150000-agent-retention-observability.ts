import { Kysely, sql } from 'kysely';
/** Append-only expansion. Existing journal checkpoints remain unknown until a verified binary write. */
export async function up(db: Kysely<any>) {
  await sql`
    ALTER TABLE document_operations ADD COLUMN result_expired_at timestamptz;
    ALTER TABLE document_gates ADD COLUMN checkpoint_revision bigint NOT NULL DEFAULT 0,
      ADD COLUMN recovering_since timestamptz;
    CREATE FUNCTION document_recovery_clock() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.mode='recovering' AND (TG_OP='INSERT' OR OLD.mode IS DISTINCT FROM NEW.mode) THEN NEW.recovering_since=clock_timestamp();
      ELSIF NEW.mode<>'recovering' THEN NEW.recovering_since=NULL; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER document_recovery_clock BEFORE INSERT OR UPDATE OF mode ON document_gates FOR EACH ROW EXECUTE FUNCTION document_recovery_clock();
    UPDATE document_gates SET recovering_since=clock_timestamp() WHERE mode='recovering';
    CREATE INDEX document_updates_retention ON document_updates(created_at,page_id);
    CREATE INDEX document_outbox_retention ON document_outbox(delivered_at) WHERE delivered_at IS NOT NULL;
    CREATE INDEX document_operations_retention ON document_operations(committed_at,id) WHERE status='committed' AND result_expired_at IS NULL;
    CREATE TABLE agent_maintenance_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),counts jsonb NOT NULL
    );
    CREATE INDEX agent_maintenance_runs_age ON agent_maintenance_runs(workspace_id,created_at);
    ALTER TABLE agent_maintenance_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_maintenance_runs FORCE ROW LEVEL SECURITY;
    CREATE POLICY agent_maintenance_runs_tenant ON agent_maintenance_runs
      USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid)
      WITH CHECK(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid);
  `.execute(db);
}
export async function down() {
  throw new Error(
    'Forward-only: retention payload removal cannot be undone by dropping columns',
  );
}
