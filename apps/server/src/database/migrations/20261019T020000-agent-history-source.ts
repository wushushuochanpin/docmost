import { Kysely, sql } from 'kysely';
export async function up(db: Kysely<any>) {
  await sql`alter table page_history add column agent_source jsonb`.execute(db);
}
export async function down() {
  throw new Error('Forward-only: preserve historical Agent attribution');
}
