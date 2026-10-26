import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE identity_accounts (
      id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issuer text NOT NULL, subject text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(workspace_id, issuer, subject), UNIQUE(workspace_id, issuer, user_id)
    );
    CREATE TABLE identity_browser_handles (
      credential_hash text PRIMARY KEY, browser_hash text NOT NULL UNIQUE,
      session_id uuid REFERENCES user_sessions(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','revoked')),
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE identity_login_transactions (
      state_hash text PRIMARY KEY, browser_hash text NOT NULL,
      credential_hash text REFERENCES identity_browser_handles(credential_hash) ON DELETE SET NULL,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      purpose text NOT NULL CHECK(purpose IN ('login','link')),
      sealed_parameters text NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      session_id uuid REFERENCES user_sessions(id) ON DELETE CASCADE,
      result_session_id uuid REFERENCES user_sessions(id) ON DELETE SET NULL,
      expires_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','consumed','cancelled')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX identity_transactions_expiry ON identity_login_transactions(expires_at);
    CREATE INDEX identity_transactions_browser ON identity_login_transactions(browser_hash);
    ALTER TABLE identity_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE identity_accounts FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_rls_identity_accounts ON identity_accounts FOR ALL
      USING (nullif(current_setting('app.workspace_id',true),'') IS NULL OR workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid)
      WITH CHECK (nullif(current_setting('app.workspace_id',true),'') IS NULL OR workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid);
    ALTER TABLE identity_login_transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE identity_login_transactions FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_rls_identity_login_transactions ON identity_login_transactions FOR ALL
      USING (nullif(current_setting('app.workspace_id',true),'') IS NULL OR workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid)
      WITH CHECK (nullif(current_setting('app.workspace_id',true),'') IS NULL OR workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Forward-only: disable identity login and drain identity sessions before removal',
  );
}
