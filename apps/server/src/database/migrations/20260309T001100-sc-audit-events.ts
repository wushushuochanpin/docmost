import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('sc_audit_events')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('actor_id', 'uuid')
    .addColumn('actor_type', 'varchar(32)', (col) =>
      col.notNull().defaultTo('user'),
    )
    .addColumn('event', 'varchar(128)', (col) => col.notNull())
    .addColumn('resource_type', 'varchar(64)', (col) => col.notNull())
    .addColumn('resource_id', 'uuid')
    .addColumn('space_id', 'uuid')
    .addColumn('changes', 'jsonb')
    .addColumn('metadata', 'jsonb')
    .addColumn('ip_address', 'varchar(64)')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_sc_audit_events_workspace_id')
    .on('sc_audit_events')
    .columns(['workspace_id', 'id desc'])
    .execute();

  await db.schema
    .createIndex('idx_sc_audit_events_actor_id')
    .on('sc_audit_events')
    .columns(['actor_id', 'id desc'])
    .execute();

  await db.schema
    .createIndex('idx_sc_audit_events_event')
    .on('sc_audit_events')
    .columns(['event', 'created_at desc'])
    .execute();

  await db.schema
    .createTable('sc_audit_retention')
    .addColumn('workspace_id', 'uuid', (col) =>
      col.primaryKey().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('retention_days', 'int8', (col) =>
      col.notNull().defaultTo(90),
    )
    .addColumn('updated_by', 'uuid')
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('sc_audit_retention').execute();
  await db.schema.dropTable('sc_audit_events').execute();
}
