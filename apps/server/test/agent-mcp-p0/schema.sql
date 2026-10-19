-- Disposable P0 database only. This is NOT an application migration.
CREATE TABLE grants (
 id text PRIMARY KEY, workspace text NOT NULL, actor text NOT NULL, client text NOT NULL,
 spaces text[] NOT NULL, scopes text[] NOT NULL, active boolean NOT NULL DEFAULT true,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '30 days'
);
CREATE TABLE documents (
 id text PRIMARY KEY, workspace text NOT NULL, space text NOT NULL, generation text NOT NULL,
 revision bigint NOT NULL DEFAULT 1, ydoc bytea NOT NULL, title text NOT NULL DEFAULT '',
 mode text NOT NULL DEFAULT 'open', fence bigint NOT NULL DEFAULT 0, operation_id text,
 owner_epoch bigint NOT NULL DEFAULT 1, owner_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 seconds',
 agent_until timestamptz, edit_epoch bigint NOT NULL DEFAULT 1
);
CREATE TABLE node_metadata (page text PRIMARY KEY REFERENCES documents(id), parent text REFERENCES documents(id), node_type text NOT NULL CHECK(node_type IN ('folder','file')));
CREATE TABLE permits (
 page text REFERENCES documents(id), session text NOT NULL, actor text NOT NULL,
 epoch bigint NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(page,session)
);
CREATE TABLE operations (
 id text PRIMARY KEY, workspace text NOT NULL, actor text NOT NULL, client text NOT NULL, grant_id text REFERENCES grants(id),
 tool text NOT NULL, key text NOT NULL, hash text NOT NULL, page text REFERENCES documents(id),
 status text NOT NULL DEFAULT 'pending', attempt bigint NOT NULL DEFAULT 0, result jsonb,
 UNIQUE(workspace,actor,client,grant_id,tool,key)
);
CREATE TABLE history (
 operation text REFERENCES operations(id), side text NOT NULL, ydoc bytea NOT NULL,
 revision bigint NOT NULL, PRIMARY KEY(operation,side)
);
CREATE TABLE outbox (operation text REFERENCES operations(id), kind text NOT NULL, PRIMARY KEY(operation,kind));
CREATE TABLE journal (
 page text REFERENCES documents(id), session text NOT NULL, update_id text NOT NULL,
 hash text NOT NULL, revision bigint NOT NULL, ydoc bytea NOT NULL,
 PRIMARY KEY(page,session,update_id)
);
CREATE TABLE oauth_codes (hash text PRIMARY KEY, data jsonb NOT NULL, consumed boolean NOT NULL DEFAULT false);
CREATE TABLE oauth_families (id text PRIMARY KEY, grant_id text REFERENCES grants(id), revoked boolean NOT NULL DEFAULT false);
CREATE TABLE oauth_tokens (
 access_hash text PRIMARY KEY, refresh_hash text UNIQUE, family text REFERENCES oauth_families(id),
 data jsonb NOT NULL, consumed boolean NOT NULL DEFAULT false
);
