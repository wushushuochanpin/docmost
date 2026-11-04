import { Kysely, sql } from 'kysely';

/**
 * Additive migration for agent connection permissions.
 *
 * - Legacy API tokens are explicitly tagged `legacy` and keep their existing
 *   HTTP surface plus read-only MCP behaviour.
 * - MCP-scoped tokens are a separate credential type with an explicit space
 *   and scope grant. They are never treated as an OAuth grant.
 * - document_operations records the credential kind/id that produced each
 *   operation so commits, idempotency and activity stay attributable without a
 *   synthetic OAuth grant.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE sc_api_tokens
      ADD COLUMN credential_type text NOT NULL DEFAULT 'legacy',
      ADD COLUMN space_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
      ADD COLUMN scopes text[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN version bigint NOT NULL DEFAULT 1,
      ADD COLUMN request_id text,
      ADD COLUMN last_scope_change jsonb,
      ADD COLUMN confirmed_by_user_id uuid,
      ADD COLUMN confirmed_at timestamptz;
    ALTER TABLE sc_api_tokens
      ADD CONSTRAINT sc_api_tokens_credential_type_check
        CHECK(credential_type IN ('legacy','mcp_scoped')),
      ADD CONSTRAINT sc_api_tokens_credential_shape_check
        CHECK(
          credential_type='legacy'
          OR (
            credential_type='mcp_scoped'
            AND cardinality(space_ids)>0
            AND scopes @> ARRAY['knowledge.read']::text[]
          )
        );
    CREATE UNIQUE INDEX sc_api_tokens_request_id
      ON sc_api_tokens(workspace_id,request_id) WHERE request_id IS NOT NULL;
    CREATE INDEX sc_api_tokens_mcp_owner
      ON sc_api_tokens(workspace_id,owner_user_id,credential_type,status,id DESC);

    ALTER TABLE agent_oauth_clients
      ADD COLUMN source text NOT NULL DEFAULT 'manual',
      ADD COLUMN registration_ip text,
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      ADD COLUMN last_seen_at timestamptz,
      ADD COLUMN client_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE agent_oauth_clients
      ADD CONSTRAINT agent_oauth_clients_source_check
        CHECK(source IN ('manual','dcr'));
    CREATE INDEX agent_oauth_clients_dcr_age
      ON agent_oauth_clients(source,created_at,id);

    ALTER TABLE agent_management_audit
      ADD COLUMN credential_kind text,
      ADD COLUMN credential_id uuid,
      ADD COLUMN details jsonb;
    UPDATE agent_management_audit
      SET credential_kind='oauth',credential_id=grant_id
      WHERE credential_kind IS NULL;

    ALTER TABLE document_operations
      ADD COLUMN credential_kind text NOT NULL DEFAULT 'oauth',
      ADD COLUMN credential_id uuid;
    UPDATE document_operations
      SET credential_id=grant_id
      WHERE credential_id IS NULL;
    ALTER TABLE document_operations ALTER COLUMN grant_id DROP NOT NULL;
    ALTER TABLE document_operations ALTER COLUMN credential_id SET NOT NULL;
    ALTER TABLE document_operations
      ADD CONSTRAINT document_operations_credential_kind_check
        CHECK(credential_kind IN ('oauth','api_token'));
    CREATE UNIQUE INDEX document_operations_credential_key
      ON document_operations(workspace_id,user_id,credential_kind,credential_id,tool,idempotency_key);
    CREATE INDEX document_operations_credential_activity
      ON document_operations(workspace_id,credential_kind,credential_id,created_at,id);

    CREATE FUNCTION document_operation_credential() RETURNS trigger LANGUAGE plpgsql AS $$
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
    CREATE TRIGGER document_operation_credential_guard
      BEFORE INSERT OR UPDATE OF grant_id,credential_kind,credential_id ON document_operations
      FOR EACH ROW EXECUTE FUNCTION document_operation_credential();

    -- Changing a token's authorization is an authority change: serialize it
    -- with document commits through the same authority barrier used by grants.
    CREATE TRIGGER sc_api_tokens_authority_insert_delete
      BEFORE INSERT OR DELETE ON sc_api_tokens
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier();
    CREATE TRIGGER sc_api_tokens_authority_change
      BEFORE UPDATE OF credential_type,scopes,space_ids,status,revoked_at,expires_at,version
      ON sc_api_tokens
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier();
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Forward-only: revoke and drain scoped credentials before removing authority data',
  );
}
