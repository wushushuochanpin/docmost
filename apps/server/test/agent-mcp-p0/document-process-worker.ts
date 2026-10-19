import 'reflect-metadata';
import { CamelCasePlugin, Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { db } from './store';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { PagePermissionRepo } from '../../src/database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';
import { KyselyDB } from '../../src/database/types/kysely.types';
import { TiptapTransformer } from '@hocuspocus/transformer';
const database = new Kysely({
  dialect: new PostgresJSDialect({ postgres: db('p0_business') }),
  plugins: [new CamelCasePlugin()],
}) as KyselyDB;
const service = new DocumentCommandService(
  database,
  new PagePermissionRepo(database, null as any, {} as any),
  new SpaceMemberRepo(database, null as any, null as any, {} as any),
);
process.on('message', async (message: any) => {
  try {
    const result = await service.edit(message.actor, message.input, (doc) =>
      TiptapTransformer.fromYdoc(doc, 'default'),
    );
    // Parent kills this real worker after the commit and before it returns a transport result.
    process.send?.({ phase: 'committed', operationId: result.operationId });
  } catch (error) {
    process.send?.({
      phase: 'failed',
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
});
