import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pages_id_workspace_id_uq
    ON pages (id, workspace_id)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS spaces_id_workspace_id_uq
    ON spaces (id, workspace_id)
  `.execute(db);

  await sql`
    ALTER TABLE attachments
    ADD CONSTRAINT attachments_page_workspace_fk
    FOREIGN KEY (page_id, workspace_id)
    REFERENCES pages (id, workspace_id)
    ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE attachments
    ADD CONSTRAINT attachments_space_workspace_fk
    FOREIGN KEY (space_id, workspace_id)
    REFERENCES spaces (id, workspace_id)
    ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE comments
    ADD CONSTRAINT comments_page_workspace_fk
    FOREIGN KEY (page_id, workspace_id)
    REFERENCES pages (id, workspace_id)
    ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE shares
    ADD CONSTRAINT shares_page_workspace_fk
    FOREIGN KEY (page_id, workspace_id)
    REFERENCES pages (id, workspace_id)
    ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE shares
    ADD CONSTRAINT shares_space_workspace_fk
    FOREIGN KEY (space_id, workspace_id)
    REFERENCES spaces (id, workspace_id)
    ON DELETE CASCADE
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE shares
    DROP CONSTRAINT IF EXISTS shares_space_workspace_fk
  `.execute(db);

  await sql`
    ALTER TABLE shares
    DROP CONSTRAINT IF EXISTS shares_page_workspace_fk
  `.execute(db);

  await sql`
    ALTER TABLE comments
    DROP CONSTRAINT IF EXISTS comments_page_workspace_fk
  `.execute(db);

  await sql`
    ALTER TABLE attachments
    DROP CONSTRAINT IF EXISTS attachments_space_workspace_fk
  `.execute(db);

  await sql`
    ALTER TABLE attachments
    DROP CONSTRAINT IF EXISTS attachments_page_workspace_fk
  `.execute(db);

  await sql`DROP INDEX IF EXISTS spaces_id_workspace_id_uq`.execute(db);
  await sql`DROP INDEX IF EXISTS pages_id_workspace_id_uq`.execute(db);
}
