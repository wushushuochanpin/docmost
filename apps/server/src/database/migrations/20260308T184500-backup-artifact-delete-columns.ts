import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('backup_jobs')
    .addColumn('artifact_deleted_at', 'timestamptz', (col) => col)
    .addColumn('artifact_deleted_by_user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('artifact_delete_reason', 'text', (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('backup_jobs')
    .dropColumn('artifact_delete_reason')
    .dropColumn('artifact_deleted_by_user_id')
    .dropColumn('artifact_deleted_at')
    .execute();
}
