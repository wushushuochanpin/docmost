import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('user_sessions')
    .addColumn('credential_hash', 'varchar(64)')
    .execute();
  await db.schema
    .createIndex('user_sessions_credential_hash_unique')
    .on('user_sessions')
    .column('credential_hash')
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('user_sessions_credential_hash_unique').execute();
  await db.schema
    .alterTable('user_sessions')
    .dropColumn('credential_hash')
    .execute();
}
