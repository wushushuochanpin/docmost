import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('sc_api_tokens')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('owner_user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('creator_user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('token_prefix', 'varchar(24)', (col) => col.notNull())
    .addColumn('token_hash', 'varchar(128)', (col) => col.notNull().unique())
    .addColumn('scope_json', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('is_workspace_managed', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('status', 'varchar(32)', (col) =>
      col.notNull().defaultTo('active'),
    )
    .addColumn('expires_at', 'timestamptz')
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('last_used_ip', 'varchar(64)')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_sc_api_tokens_workspace_id')
    .on('sc_api_tokens')
    .columns(['workspace_id', 'id desc'])
    .execute();

  await db.schema
    .createIndex('idx_sc_api_tokens_owner_user_id')
    .on('sc_api_tokens')
    .columns(['owner_user_id', 'id desc'])
    .execute();

  await db.schema
    .createIndex('idx_sc_api_tokens_workspace_scope')
    .on('sc_api_tokens')
    .columns(['workspace_id', 'is_workspace_managed', 'status'])
    .execute();

  await db.schema
    .createTable('sc_api_token_events')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('api_token_id', 'uuid', (col) =>
      col.notNull().references('sc_api_tokens.id').onDelete('cascade'),
    )
    .addColumn('event_type', 'varchar(64)', (col) => col.notNull())
    .addColumn('actor_user_id', 'uuid')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_sc_api_token_events_workspace_id')
    .on('sc_api_token_events')
    .columns(['workspace_id', 'id desc'])
    .execute();

  await db.schema
    .createIndex('idx_sc_api_token_events_token_id')
    .on('sc_api_token_events')
    .columns(['api_token_id', 'id desc'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('sc_api_token_events').execute();
  await db.schema.dropTable('sc_api_tokens').execute();
}
