import { Kysely, sql } from 'kysely';

// Global protocol locators are private to this service. Tenant grants retain FORCE RLS.
export async function up(db: Kysely<any>) {
  await sql`
    CREATE TABLE agent_oauth_clients (
      id uuid PRIMARY KEY, name text NOT NULL, type text NOT NULL CHECK(type IN ('public','confidential')),
      redirect_uris text[] NOT NULL, scopes text[] NOT NULL, origins text[] NOT NULL,
      secret_hash text, active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1
    );
    CREATE TABLE agent_oauth_requests (
      id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES agent_oauth_clients(id), client_version bigint NOT NULL,
      parameters jsonb NOT NULL, expires_at timestamptz NOT NULL, user_id uuid, workspace_id uuid, session_id uuid,
      consumed boolean NOT NULL DEFAULT false, response bytea, response_until timestamptz
    );
    CREATE TABLE agent_oauth_codes (
      hash text PRIMARY KEY, client_id uuid NOT NULL REFERENCES agent_oauth_clients(id), workspace_id uuid NOT NULL,
      grant_id uuid NOT NULL REFERENCES document_agent_grants(id), metadata jsonb NOT NULL,
      expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
    );
    CREATE TABLE agent_oauth_families (
      id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES agent_oauth_clients(id), workspace_id uuid NOT NULL,
      grant_id uuid NOT NULL REFERENCES document_agent_grants(id), revoked boolean NOT NULL DEFAULT false
    );
    CREATE TABLE agent_oauth_tokens (
      access_hash text PRIMARY KEY, refresh_hash text NOT NULL UNIQUE, family_id uuid NOT NULL REFERENCES agent_oauth_families(id),
      metadata jsonb NOT NULL, access_expires_at timestamptz NOT NULL, refresh_expires_at timestamptz NOT NULL,
      consumed boolean NOT NULL DEFAULT false
    );
    CREATE INDEX agent_oauth_requests_expiry ON agent_oauth_requests(expires_at);
    CREATE INDEX agent_oauth_tokens_family ON agent_oauth_tokens(family_id);
    CREATE TRIGGER document_authority_statement BEFORE UPDATE OR DELETE ON agent_oauth_clients
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier();
    CREATE TRIGGER document_authority_statement BEFORE UPDATE OR DELETE ON agent_oauth_families
      FOR EACH STATEMENT EXECUTE FUNCTION document_security_barrier();
  `.execute(db);
}
export async function down() { throw new Error('Forward-only: revoke and drain OAuth grants before removal'); }
