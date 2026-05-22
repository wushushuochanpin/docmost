import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('backup_jobs')
    .set({
      error_code: null,
      error_message: null,
    })
    .where('status', '=', 'success')
    .execute();
}

export async function down(): Promise<void> {
  // This migration removes stale diagnostics from successful retry results.
}
