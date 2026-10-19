import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { PagePermissionRepo } from '../../src/database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { db } from './store';

test('full migration chain preserves pre-upgrade documents and accepts a durable post-upgrade edit', async () => {
  const admin = db('p0_full');
  await admin.unsafe('CREATE DATABASE p0_full_migrations');
  const url = new URL(process.env.P0_DATABASE_URL!);
  url.pathname = '/p0_full_migrations';
  const connection = postgres(url.toString(), { max: 2, onnotice: () => {} });
  const database = new Kysely<any>({
    dialect: new PostgresJSDialect({ postgres: connection }),
    plugins: [new CamelCasePlugin()],
  });
  const workspace = randomUUID(),
    user = randomUUID(),
    space = randomUUID(),
    page = randomUUID(),
    grant = randomUUID();
  const original = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  text.insert(0, 'existing content');
  paragraph.insert(0, [text]);
  original.getXmlFragment('default').insert(0, [paragraph]);
  const originalBytes = Buffer.from(Y.encodeStateAsUpdate(original));
  try {
    const directory = join(__dirname, '../../src/database/migrations');
    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    for (const file of files) {
      if (file === '20261018T180000-document-command-boundary.ts') {
        await connection`INSERT INTO workspaces(id,name) VALUES(${workspace},'pre-upgrade workspace')`;
        await connection`INSERT INTO users(id,workspace_id,email,name) VALUES(${user},${workspace},'migration@example.test','Migration test')`;
        await connection`INSERT INTO spaces(id,workspace_id,slug) VALUES(${space},${workspace},'migration-space')`;
        await connection`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${user},'writer')`;
        await connection`INSERT INTO pages(id,workspace_id,space_id,slug_id,title,ydoc,content) VALUES(${page},${workspace},${space},'migration-page','existing title',${originalBytes},${connection.json(TiptapTransformer.fromYdoc(original, 'default'))})`;
      }
      const migration = require(join(directory, file));
      try {
        await migration.up(database);
      } catch (error) {
        throw new Error('Migration failed: ' + file, { cause: error });
      }
    }
    await connection`INSERT INTO agent_policies(workspace_id,enabled) VALUES(${workspace},true)`;
    expect(files.length).toBeGreaterThan(60);
    expect(
      Buffer.from(
        (await connection`SELECT ydoc FROM pages WHERE id=${page}`)[0].ydoc,
      ),
    ).toEqual(originalBytes);
    process.env.DOCUMENT_COMMAND_ENABLED = 'true';
    process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString(
      'base64',
    );
    await connection`INSERT INTO document_agent_grants(id,workspace_id,user_id,client_id,space_ids,scopes,expires_at) VALUES(${grant},${workspace},${user},'migration-client',ARRAY[${space}]::uuid[],ARRAY['knowledge.read','pages.edit'],clock_timestamp()+interval '1 day')`;
    const cache = {
      get: () => {
        throw Error('cached write ACL');
      },
    } as any;
    const commands = new DocumentCommandService(
      database as any,
      new PagePermissionRepo(database as any, null as any, cache),
      new SpaceMemberRepo(database as any, null as any, null as any, cache),
    );
    const actor = {
      workspaceId: workspace,
      userId: user,
      pageId: page,
      clientId: 'migration-client',
      grantId: grant,
    };
    const context = await commands.editContext(actor);
    const changed = await commands.edit(
      actor,
      {
        key: 'post-upgrade-edit',
        versionToken: context.token,
        commands: [{ type: 'append', text: 'post-upgrade content' }],
      },
      (d) => TiptapTransformer.fromYdoc(d, 'default'),
    );
    expect(changed.status).toBe('committed');
    const stored = (
      await connection`SELECT content FROM pages WHERE id=${page}`
    )[0];
    expect(JSON.stringify(stored.content)).toContain('existing content');
    expect(JSON.stringify(stored.content)).toContain('post-upgrade content');
    expect(
      await connection`SELECT * FROM page_history WHERE page_id=${page}`,
    ).toHaveLength(2);

    const result = await sql<{
      name: string;
    }>`select column_name as name from information_schema.columns where table_schema='public' and table_name='page_history'`.execute(
      database,
    );
    expect(result.rows.map((row) => row.name)).toContain('agent_source');
    const tables = await sql<{
      name: string;
    }>`select tablename as name from pg_tables where schemaname='public'`.execute(
      database,
    );
    expect(tables.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'document_gates',
        'agent_oauth_tokens',
        'document_operations',
      ]),
    );
  } finally {
    delete process.env.DOCUMENT_COMMAND_ENABLED;
    delete process.env.DOCUMENT_COMMAND_SIGNING_KEY;
    original.destroy();
    await database.destroy();
    await admin.unsafe('DROP DATABASE p0_full_migrations');
    await admin.end();
  }
}, 60000);
