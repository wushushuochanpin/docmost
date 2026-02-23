import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS pages_space_parent_deleted_position_idx
    ON pages (space_id, parent_page_id, deleted_at, position COLLATE "C", id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS pages_space_deleted_updated_idx
    ON pages (space_id, deleted_at, updated_at DESC, id DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS space_members_user_id_idx
    ON space_members (user_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS space_members_group_id_idx
    ON space_members (group_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS group_users_user_id_idx
    ON group_users (user_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS attachments_page_id_idx
    ON attachments (page_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS attachments_space_id_idx
    ON attachments (space_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS shares_page_id_idx
    ON shares (page_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS comments_page_id_idx
    ON comments (page_id)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS comments_page_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS shares_page_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS attachments_space_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS attachments_page_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS group_users_user_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS space_members_group_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS space_members_user_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pages_space_deleted_updated_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pages_space_parent_deleted_position_idx`.execute(db);
}
