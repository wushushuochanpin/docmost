import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('space_sidebar_categories')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('sort_key', 'varchar', (col) => col.notNull())
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('space_sidebar_categories_space_sort_idx')
    .on('space_sidebar_categories')
    .columns(['space_id', 'sort_key'])
    .execute();

  await db.schema
    .createIndex('space_sidebar_categories_space_name_uidx')
    .on('space_sidebar_categories')
    .columns(['space_id', 'name'])
    .unique()
    .execute();

  await db.schema
    .alterTable('page_node_meta')
    .addColumn('sidebar_category_id', 'uuid', (col) =>
      col.references('space_sidebar_categories.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('page_node_meta_space_category_idx')
    .on('page_node_meta')
    .columns(['space_id', 'sidebar_category_id'])
    .execute();

  await db.schema
    .createIndex('page_node_meta_space_category_pin_idx')
    .on('page_node_meta')
    .columns(['space_id', 'sidebar_category_id', 'is_pinned', 'pinned_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('page_node_meta_space_category_pin_idx').execute();
  await db.schema.dropIndex('page_node_meta_space_category_idx').execute();
  await db.schema
    .alterTable('page_node_meta')
    .dropColumn('sidebar_category_id')
    .execute();
  await db.schema
    .dropIndex('space_sidebar_categories_space_name_uidx')
    .execute();
  await db.schema
    .dropIndex('space_sidebar_categories_space_sort_idx')
    .execute();
  await db.schema.dropTable('space_sidebar_categories').execute();
}
