import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('shares')
    .addColumn('access_mode', 'varchar', (col) =>
      col.notNull().defaultTo('public'),
    )
    .addColumn('password_hash', 'varchar')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('security_version', 'integer', (col) =>
      col.notNull().defaultTo(1),
    )
    .execute();

  await sql`
    ALTER TABLE shares
    ADD CONSTRAINT shares_access_mode_valid
    CHECK (access_mode IN ('public', 'password_expiring'))
  `.execute(db);

  await sql`
    ALTER TABLE shares
    ADD CONSTRAINT shares_access_mode_fields_consistent
    CHECK (
      (access_mode = 'public' AND password_hash IS NULL AND expires_at IS NULL)
      OR
      (access_mode = 'password_expiring' AND password_hash IS NOT NULL AND expires_at IS NOT NULL)
    )
  `.execute(db);

  await db.schema
    .createIndex('idx_shares_expires_at')
    .on('shares')
    .column('expires_at')
    .execute();

  await db.schema
    .createIndex('idx_shares_access_mode_expires_at')
    .on('shares')
    .columns(['access_mode', 'expires_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_shares_access_mode_expires_at').execute();
  await db.schema.dropIndex('idx_shares_expires_at').execute();

  await sql`
    ALTER TABLE shares
    DROP CONSTRAINT IF EXISTS shares_access_mode_fields_consistent
  `.execute(db);

  await sql`
    ALTER TABLE shares
    DROP CONSTRAINT IF EXISTS shares_access_mode_valid
  `.execute(db);

  await db.schema
    .alterTable('shares')
    .dropColumn('security_version')
    .dropColumn('expires_at')
    .dropColumn('password_hash')
    .dropColumn('access_mode')
    .execute();
}
