import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('pages')
        .addColumn('theme_color', 'varchar(50)')
        .addColumn('theme_pattern', 'varchar(50)')
        .execute();

    await db.schema
        .alterTable('page_history')
        .addColumn('theme_color', 'varchar(50)')
        .addColumn('theme_pattern', 'varchar(50)')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.alterTable('pages').dropColumn('theme_color').dropColumn('theme_pattern').execute();
    await db.schema.alterTable('page_history').dropColumn('theme_color').dropColumn('theme_pattern').execute();
}
