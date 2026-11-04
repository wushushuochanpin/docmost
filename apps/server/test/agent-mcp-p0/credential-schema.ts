/**
 * Test-only additive DDL matching 20261104T150000-agent-connection-permissions.
 * The disposable fixture schemas predate the credential columns; production
 * always runs the real migration.
 */
export async function ensureCredentialColumns(pg: any) {
  await pg.unsafe(`
    ALTER TABLE document_operations ADD COLUMN IF NOT EXISTS credential_kind text NOT NULL DEFAULT 'oauth',
      ADD COLUMN IF NOT EXISTS credential_id uuid;
    UPDATE document_operations SET credential_id=grant_id WHERE credential_id IS NULL;
    ALTER TABLE document_operations ALTER COLUMN credential_id SET NOT NULL;
    CREATE OR REPLACE FUNCTION document_operation_credential() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.credential_id IS NULL THEN NEW.credential_id := NEW.grant_id; END IF;
      IF NEW.credential_id IS NULL THEN
        RAISE EXCEPTION 'DOCUMENT_CREDENTIAL_REQUIRED' USING ERRCODE='23514';
      END IF;
      IF NEW.grant_id IS NULL AND NEW.credential_kind='oauth' THEN
        NEW.credential_kind := 'api_token';
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS document_operation_credential_guard ON document_operations;
    CREATE TRIGGER document_operation_credential_guard
      BEFORE INSERT OR UPDATE OF grant_id,credential_kind,credential_id ON document_operations
      FOR EACH ROW EXECUTE FUNCTION document_operation_credential();
  `);
}
