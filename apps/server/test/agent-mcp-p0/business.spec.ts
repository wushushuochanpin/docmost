import { up as retentionMigration } from '../../src/database/migrations/20261019T150000-agent-retention-observability';
import { up as managementMigration } from '../../src/database/migrations/20261019T120000-agent-management-quotas';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { tiptapExtensions } from '../../src/collaboration/collaboration.util';
import { up as historySourceMigration } from '../../src/database/migrations/20261019T020000-agent-history-source';
import { Hocuspocus } from '@hocuspocus/server';
import { DurableDocumentExtension } from '../../src/collaboration/extensions/durable-document.extension';
import WebSocket, { WebSocketServer } from 'ws';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as Y from 'yjs';
import { db } from './store';
import { up } from '../../src/database/migrations/20261018T180000-document-command-boundary';
import { PagePermissionRepo } from '../../src/database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { KyselyDB } from '../../src/database/types/kysely.types';
const pg = db('p0_business');
const database = new Kysely({
  dialect: new PostgresJSDialect({ postgres: pg }),
  plugins: [new CamelCasePlugin()],
}) as KyselyDB;
const poisonCache = {
  get: () => {
    throw Error('write authorization must not use cache');
  },
} as any;
const permissionRepo = new PagePermissionRepo(
  database,
  null as any,
  poisonCache,
);
const memberRepo = new SpaceMemberRepo(
  database,
  null as any,
  null as any,
  poisonCache,
);
const commands = new DocumentCommandService(
  database,
  permissionRepo,
  memberRepo,
);
let ids: {
  workspace: string;
  space: string;
  user: string;
  reader: string;
  parent: string;
  page: string;
  session: string;
  grant: string;
  group: string;
};
let live: Y.Doc;
const actor = () => ({
  workspaceId: ids.workspace,
  userId: ids.user,
  pageId: ids.page,
});
const agent = () => ({
  ...actor(),
  grantId: ids.grant,
  clientId: 'registered-client',
});
const render = (d: Y.Doc) => ({
  type: 'doc',
  content: d
    .getXmlFragment('default')
    .toArray()
    .map((x) => ({ type: 'paragraph', text: x.toString() })),
});
const readGate = async () =>
  (
    await pg`SELECT *,revision::text FROM document_gates WHERE page_id=${ids.page}`
  ).at(0)!;
beforeAll(async () => {
  process.env.DOCUMENT_COMMAND_ENABLED = 'true';
  process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString(
    'base64',
  );
  await pg`CREATE SCHEMA p0_business`;
  await pg.unsafe(readFileSync(join(__dirname, 'business-schema.sql'), 'utf8'));
  await up(database);
  await historySourceMigration(database);
  await managementMigration(database);
  await retentionMigration(database);
});
beforeEach(async () => {
  await pg`TRUNCATE workspaces CASCADE`;
  ids = {
    workspace: randomUUID(),
    space: randomUUID(),
    user: randomUUID(),
    reader: randomUUID(),
    parent: randomUUID(),
    page: randomUUID(),
    session: randomUUID(),
    grant: randomUUID(),
    group: randomUUID(),
  };
  await pg`INSERT INTO workspaces VALUES(${ids.workspace})`;
  await pg`INSERT INTO agent_policies(workspace_id,enabled,max_grant_days) VALUES(${ids.workspace},true,90)`;
  await pg`INSERT INTO users(id,workspace_id) VALUES(${ids.user},${ids.workspace}),(${ids.reader},${ids.workspace})`;
  await pg`INSERT INTO spaces VALUES(${ids.space},${ids.workspace})`;
  await pg`INSERT INTO groups VALUES(${ids.group},${ids.workspace})`;
  await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${ids.space},${ids.user},'writer'),(${ids.space},${ids.reader},'reader')`;
  const doc = new Y.Doc();
  const p = new Y.XmlElement('paragraph');
  const t = new Y.XmlText();
  t.insert(0, 'before');
  p.insert(0, [t]);
  doc.getXmlFragment('default').insert(0, [p]);
  await pg`INSERT INTO pages(id,workspace_id,space_id,ydoc,content,title) VALUES(${ids.parent},${ids.workspace},${ids.space},${Buffer.from(Y.encodeStateAsUpdate(doc))},${pg.json(render(doc))},'parent')`;
  await pg`INSERT INTO pages(id,workspace_id,space_id,parent_page_id,ydoc,content,title) VALUES(${ids.page},${ids.workspace},${ids.space},${ids.parent},${Buffer.from(Y.encodeStateAsUpdate(doc))},${pg.json(render(doc))},'page')`;
  doc.destroy();
  await pg`INSERT INTO user_sessions VALUES(${ids.session},${ids.user},${ids.workspace},null,clock_timestamp()+interval '1 day')`;
  await pg`INSERT INTO document_agent_grants(id,workspace_id,user_id,client_id,space_ids,scopes,expires_at) VALUES(${ids.grant},${ids.workspace},${ids.user},'registered-client',ARRAY[${ids.space}]::uuid[],ARRAY['knowledge.read','pages.edit'],clock_timestamp()+interval '1 day')`;
  live = new Y.Doc();
  const bytes = await commands.load(actor(), live);
  Y.applyUpdate(live, bytes!);
});
afterEach(() => {
  commands.unload(ids.page);
  live.destroy();
});
afterAll(async () => {
  delete process.env.DOCUMENT_COMMAND_ENABLED;
  delete process.env.DOCUMENT_COMMAND_SIGNING_KEY;
  await database.destroy();
});
describe('P0 production service + actual migration + real ACL repositories', () => {
  test('real inherited restrictions deny access and nearest writer still requires ancestor traversal', async () => {
    const restriction = randomUUID();
    await pg`INSERT INTO page_access(id,page_id,workspace_id) VALUES(${restriction},${ids.parent},${ids.workspace})`;
    await expect(commands.editContext(agent())).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
    await pg`INSERT INTO page_permissions(page_access_id,user_id,role) VALUES(${restriction},${ids.user},'reader')`;
    await expect(commands.editContext(agent())).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
    await pg`UPDATE page_permissions SET role='writer' WHERE page_access_id=${restriction}`;
    expect((await commands.editContext(agent())).version.revision).toBe('1');
  });
  test('group membership grants real ACL and removal denies immediately without cache', async () => {
    await pg`DELETE FROM space_members WHERE user_id=${ids.user}`;
    await pg`INSERT INTO space_members(space_id,group_id,role) VALUES(${ids.space},${ids.group},'writer')`;
    await pg`INSERT INTO group_users(group_id,user_id) VALUES(${ids.group},${ids.user})`;
    await expect(commands.editContext(agent())).resolves.toBeDefined();
    await pg`DELETE FROM group_users WHERE user_id=${ids.user}`;
    await expect(commands.editContext(agent())).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
  });
  test('disabled account, reader, foreign workspace and revoked grant cannot write', async () => {
    await expect(
      commands.acquirePermit({ ...actor(), userId: ids.reader }, ids.session),
    ).rejects.toThrow('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    await expect(
      commands.editContext({ ...agent(), workspaceId: randomUUID() }),
    ).rejects.toThrow('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    await pg`UPDATE users SET deactivated_at=clock_timestamp() WHERE id=${ids.user}`;
    await expect(commands.editContext(agent())).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
    await pg`UPDATE users SET deactivated_at=null WHERE id=${ids.user}`;
    await pg`UPDATE document_agent_grants SET revoked_at=clock_timestamp() WHERE id=${ids.grant}`;
    await expect(commands.editContext(agent())).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
  });
  test('human permit blocks Agent; after release real commit has binary snapshots and one effect', async () => {
    const permit = await commands.acquirePermit(actor(), ids.session);
    const context = await commands.editContext(agent());
    const input = {
      key: 'append',
      versionToken: context.token,
      commands: [{ type: 'append' as const, text: 'agent' }],
    };
    await expect(commands.edit(agent(), input, render)).rejects.toThrow(
      'DOCUMENT_BUSY',
    );
    await commands.release(permit!);
    const result = await commands.edit(agent(), input, render);
    expect(result.status).toBe('committed');
    expect(await commands.edit(agent(), input, render)).toEqual(result);
    expect(
      await pg`SELECT * FROM document_recovery_snapshots WHERE history_id IS NOT NULL`,
    ).toHaveLength(2);
    expect(await pg`SELECT * FROM document_operations`).toHaveLength(1);
    expect(live.getXmlFragment('default').toString()).toContain('agent');
  });
  test('legacy direct SQL cannot write binary and metadata cannot bypass an Agent gate', async () => {
    await expect(
      pg`UPDATE pages SET ydoc=${Buffer.from([0, 0])} WHERE id=${ids.page}`,
    ).rejects.toMatchObject({ message: 'DOCUMENT_WRITER_REQUIRED' });
    await pg`UPDATE document_gates SET mode='agent',fence=fence+1 WHERE page_id=${ids.page}`;
    await expect(
      pg`UPDATE pages SET title='bypass' WHERE id=${ids.page}`,
    ).rejects.toMatchObject({ message: 'DOCUMENT_BUSY' });
    await expect(
      pg`DELETE FROM pages WHERE id=${ids.page}`,
    ).rejects.toMatchObject({ message: 'DOCUMENT_BUSY' });
  });
  test('title changes through existing SQL advance the revision and reject stale Agent context', async () => {
    const context = await commands.editContext(agent());
    await pg`UPDATE pages SET title='human title' WHERE id=${ids.page}`;
    expect((await readGate()).revision).toBe('2');
    await expect(
      commands.edit(
        agent(),
        {
          key: 'stale',
          versionToken: context.token,
          commands: [{ type: 'append', text: 'bad' }],
        },
        render,
      ),
    ).rejects.toThrow('REVISION_CONFLICT');
  });
  test('human updates recheck session revocation and persist before applying live', async () => {
    const permit = await commands.acquirePermit(actor(), ids.session);
    const source = new Y.Doc();
    Y.applyUpdate(source, Y.encodeStateAsUpdate(live));
    const p = new Y.XmlElement('paragraph');
    const t = new Y.XmlText();
    t.insert(0, 'human');
    p.insert(0, [t]);
    source.getXmlFragment('default').insert(1, [p]);
    const update = Y.encodeStateAsUpdate(source, Y.encodeStateVector(live));
    expect(await commands.ingest(permit!, update, render)).toBe('2');
    expect(live.getXmlFragment('default').toString()).toContain('human');
    await pg`UPDATE user_sessions SET revoked_at=clock_timestamp() WHERE id=${ids.session}`;
    await expect(commands.ingest(permit!, update, render)).rejects.toThrow(
      'DOCUMENT_PERMIT_EXPIRED',
    );
    source.destroy();
  });
  test('REST/history mutator failure cannot leak changes to live or database', async () => {
    const before = Y.encodeStateAsUpdate(live);
    await expect(
      commands.mutate(
        actor(),
        (doc) => {
          doc.getXmlFragment('default').delete(0, 1);
          throw Error('conversion failed');
        },
        render,
      ),
    ).rejects.toThrow('conversion failed');
    expect(Y.encodeStateAsUpdate(live)).toEqual(before);
    expect((await readGate()).revision).toBe('1');
  });
  test('ACL updates wait behind the commit authorization barrier, including direct SQL', async () => {
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    const barrier = new Promise<void>((r) => (release = r));
    const holding = database.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock_shared(20261018,1)`.execute(trx);
      entered();
      await barrier;
    });
    await ready;
    const revoking =
      pg`DELETE FROM space_members WHERE user_id=${ids.user}`.execute();
    try {
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const r =
          await pg`SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'DELETE FROM space_members%'`;
        if (r.length) {
          blocked = true;
          break;
        }
        await new Promise((r) => setImmediate(r));
      }
      expect(blocked).toBe(true);
    } finally {
      release();
    }
    await holding;
    await revoking;
    await expect(commands.editContext(agent())).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
  });
  test.each(['acl', 'policy'] as const)(
    'authority is rechecked after candidate preparation: %s revocation leaves no history or content',
    async (authority) => {
      const context = await commands.editContext(agent());
      let ready!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((r) => (ready = r));
      const barrier = new Promise<void>((r) => (release = r));
      const editing = commands.edit(
        agent(),
        {
          key: 'revoke-race',
          versionToken: context.token,
          commands: [{ type: 'append', text: 'denied' }],
        },
        async (doc) => {
          ready();
          await barrier;
          return render(doc);
        },
      );
      const result = expect(editing).rejects.toThrow(
        authority === 'acl'
          ? 'RESOURCE_NOT_FOUND_OR_FORBIDDEN'
          : 'MCP_DISABLED',
      );
      await entered;
      if (authority === 'acl')
        await pg`DELETE FROM space_members WHERE user_id=${ids.user}`;
      else
        await pg`UPDATE agent_policies SET enabled=false WHERE workspace_id=${ids.workspace}`;
      release();
      await result;
      expect((await readGate()).revision).toBe('1');
      expect((await readGate()).mode).toBe('open');
      expect(await pg`SELECT * FROM page_history`).toHaveLength(0);
    },
  );
  test('expired running operation is fenced before reopening, old executor cannot commit', async () => {
    const context = await commands.editContext(agent());
    let ready!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((r) => (ready = r));
    const barrier = new Promise<void>((r) => (release = r));
    const editing = commands.edit(
      agent(),
      {
        key: 'fence-race',
        versionToken: context.token,
        commands: [{ type: 'append', text: 'expired' }],
      },
      async (doc) => {
        ready();
        await barrier;
        return render(doc);
      },
    );
    const result = expect(editing).rejects.toThrow('DOCUMENT_FENCE_EXPIRED');
    await entered;
    const pending = await commands.findOperation(agent(), {
      tool: 'edit_page',
      key: 'fence-race',
    });
    expect(pending.status).toBe('running');
    await expect(
      commands.findOperation({ ...agent(), userId: ids.reader }, pending.id),
    ).rejects.toThrow('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    await pg`UPDATE document_gates SET agent_until=clock_timestamp()-interval '1 second' WHERE page_id=${ids.page}`;
    await commands.recoverPage(actor());
    release();
    await result;
    expect((await readGate()).mode).toBe('open');
    expect((await readGate()).revision).toBe('1');
    const op = (await pg`SELECT * FROM document_operations`)[0];
    expect(op.status).toBe('rejected');
    expect((await commands.operation(agent(), op.id)).status).toBe('rejected');
    expect(await commands.acquirePermit(actor(), ids.session)).toBeDefined();
  });
  test('two service owners cannot double-write; owning service recovers committed binary before reopening', async () => {
    const remote = new DocumentCommandService(
      database,
      permissionRepo,
      memberRepo,
    );
    const context = await commands.editContext(agent());
    const results = await Promise.allSettled([
      commands.edit(
        agent(),
        {
          key: 'local',
          versionToken: context.token,
          commands: [{ type: 'append', text: 'local' }],
        },
        render,
      ),
      remote.edit(
        agent(),
        {
          key: 'remote',
          versionToken: context.token,
          commands: [{ type: 'append', text: 'remote' }],
        },
        render,
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await commands.recoverPage(actor());
    expect((await readGate()).mode).toBe('open');
    expect((await readGate()).revision).toBe('2');
    expect(await pg`SELECT * FROM page_history`).toHaveLength(2);
    remote.onModuleDestroy();
  });
  test('outbox delivery failure is retried and never changes committed content', async () => {
    const context = await commands.editContext(agent());
    await commands.edit(
      agent(),
      {
        key: 'outbox',
        versionToken: context.token,
        commands: [{ type: 'append', text: 'indexed' }],
      },
      render,
    );
    const consumer = jest
      .fn()
      .mockRejectedValueOnce(Error('queue down'))
      .mockResolvedValue(undefined);
    commands.setEffectConsumer(consumer);
    await expect(commands.deliverEffects(ids.workspace)).rejects.toThrow(
      'queue down',
    );
    expect(
      await pg`SELECT * FROM document_outbox WHERE kind='content' AND delivered_at IS NULL`,
    ).toHaveLength(1);
    await commands.deliverEffects(ids.workspace);
    expect(consumer).toHaveBeenCalledTimes(2);
    expect(consumer.mock.calls[0][0]).toBe(consumer.mock.calls[1][0]);
    expect(
      await pg`SELECT * FROM document_outbox WHERE kind='content' AND delivered_at IS NULL`,
    ).toHaveLength(0);
    commands.setEffectConsumer(undefined);
  });
  test('title and body roll back together when materialization fails', async () => {
    await expect(
      commands.mutate(
        actor(),
        (doc) => doc.getXmlFragment('default').delete(0, 1),
        () => {
          throw Error('invalid snapshot');
        },
        { title: 'must rollback' },
      ),
    ).rejects.toThrow('invalid snapshot');
    expect(
      (await pg`SELECT title FROM pages WHERE id=${ids.page}`)[0].title,
    ).toBe('page');
    expect((await readGate()).revision).toBe('1');
  });
  test('page and directory metadata are atomic, including a metadata failure', async () => {
    const id = randomUUID();
    await expect(
      commands.createTransaction(
        {
          workspaceId: ids.workspace,
          userId: ids.user,
          spaceId: ids.space,
          parentPageId: ids.parent,
        },
        async (trx) => {
          await trx
            .insertInto('pages')
            .values({
              id,
              workspaceId: ids.workspace,
              spaceId: ids.space,
              parentPageId: ids.parent,
              slugId: 'atomic',
            })
            .execute();
          throw Error('metadata failure');
        },
      ),
    ).rejects.toThrow('metadata failure');
    expect(await pg`SELECT * FROM pages WHERE id=${id}`).toHaveLength(0);
  });
  test('RLS is fail-closed for an actual non-superuser role', async () => {
    await pg`CREATE ROLE p0_document_reader NOLOGIN NOSUPERUSER NOBYPASSRLS`;
    try {
      await pg`GRANT USAGE ON SCHEMA p0_business TO p0_document_reader`;
      await pg`GRANT SELECT ON ALL TABLES IN SCHEMA p0_business TO p0_document_reader`;
      await database.transaction().execute(async (trx) => {
        await sql`SET LOCAL ROLE p0_document_reader`.execute(trx);
        await sql`SELECT set_config('app.workspace_id','',true)`.execute(trx);
        expect(
          (await sql`SELECT * FROM document_gates`.execute(trx)).rows,
        ).toHaveLength(0);
        await sql`SELECT set_config('app.workspace_id',${randomUUID()},true)`.execute(
          trx,
        );
        expect(
          (await sql`SELECT * FROM document_gates`.execute(trx)).rows,
        ).toHaveLength(0);
        await sql`SELECT set_config('app.workspace_id',${ids.workspace},true)`.execute(
          trx,
        );
        expect(
          (await sql`SELECT * FROM document_gates`.execute(trx)).rows,
        ).toHaveLength(1);
      });
    } finally {
      await pg`DROP OWNED BY p0_document_reader`;
      await pg`DROP ROLE p0_document_reader`;
    }
  });
  test('real WebSocket -> production extension -> PostgreSQL acknowledges only durable epoch-bound updates', async () => {
    let disconnected!: () => void;
    const disconnectDone = new Promise<void>((r) => (disconnected = r));
    const extension = new DurableDocumentExtension(commands);
    const hocus = new Hocuspocus({
      quiet: true,
      debounce: 1,
      maxDebounce: 1,
      extensions: [extension],
      onAuthenticate: async () => ({
        user: { id: ids.user, workspaceId: ids.workspace },
        sessionId: ids.session,
      }),
      onDisconnect: async () => {
        disconnected();
      },
    });
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((r) => wss.once('listening', r));
    wss.on('connection', (socket, request) => {
      const connection = hocus.handleConnection(
        socket as any,
        new Request(`http://127.0.0.1${request.url}`),
        {},
      );
      socket.on('message', (data) => {
        void connection.handleMessage(new Uint8Array(data as Buffer));
      });
      socket.on('close', (code, reason) =>
        connection.handleClose({ code, reason: reason.toString() }),
      );
    });
    const socket = new WebSocket(
      `ws://127.0.0.1:${(wss.address() as { port: number }).port}/?documentProtocol=1`,
    );
    const messages: any[] = [];
    const listeners = new Map<string, (message: any) => void>();
    socket.on('message', (data) => {
      const decoder = decoding.createDecoder(new Uint8Array(data as Buffer));
      decoding.readVarString(decoder);
      if (decoding.readVarUint(decoder) !== 5) return;
      const message = JSON.parse(decoding.readVarString(decoder));
      messages.push(message);
      listeners.get(message.type)?.(message);
    });
    const waitMessage = (type: string) =>
      new Promise<any>((resolve, reject) => {
        const found = messages.find((m) => m.type === type);
        if (found) {
          resolve(found);
          return;
        }
        const timer = setTimeout(() => reject(Error(`missing ${type}`)), 5000);
        listeners.set(type, (m) => {
          clearTimeout(timer);
          listeners.delete(type);
          resolve(m);
        });
      });
    const send = (type: number, write: (e: encoding.Encoder) => void) => {
      const e = encoding.createEncoder();
      encoding.writeVarString(e, `page.${ids.page}`);
      encoding.writeVarUint(e, type);
      write(e);
      socket.send(encoding.toUint8Array(e));
    };
    try {
      await new Promise<void>((r) => socket.once('open', r));
      send(2, (e) => {
        encoding.writeVarUint(e, 0);
        encoding.writeVarString(e, 'fixture-session');
      });
      const permit = await waitMessage('document_permit');
      const source = new Y.Doc();
      Y.applyUpdate(source, Y.encodeStateAsUpdate(live));
      const p = new Y.XmlElement('paragraph');
      const t = new Y.XmlText();
      t.insert(0, 'socket durable');
      p.insert(0, [t]);
      source.getXmlFragment('default').insert(1, [p]);
      const update = Buffer.from(
        Y.encodeStateAsUpdate(source, Y.encodeStateVector(live)),
      ).toString('base64');
      source.destroy();
      send(5, (e) =>
        encoding.writeVarString(
          e,
          JSON.stringify({
            type: 'document_update',
            editEpoch: permit.editEpoch,
            updateId: 'socket-1',
            update,
          }),
        ),
      );
      const ack = await waitMessage('durable_ack');
      expect(ack.updateId).toBe('socket-1');
      expect(ack.revision).toBe('2');
      const stored = (await pg`SELECT ydoc FROM pages WHERE id=${ids.page}`)[0]
        .ydoc;
      const reopened = new Y.Doc();
      Y.applyUpdate(reopened, stored);
      expect(reopened.getXmlFragment('default').toString()).toContain(
        'socket durable',
      );
      reopened.destroy();
      expect(
        await pg`SELECT * FROM document_updates WHERE update_id='socket-1'`,
      ).toHaveLength(1);
      const context = await commands.editContext(agent());
      await expect(
        commands.edit(
          agent(),
          {
            key: 'while-socket-open',
            versionToken: context.token,
            commands: [{ type: 'append', text: 'blocked' }],
          },
          render,
        ),
      ).rejects.toThrow('DOCUMENT_BUSY');
    } finally {
      socket.terminate();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await disconnectDone;
      await Promise.all(
        [...hocus.documents.values()].map((doc) => hocus.unloadDocument(doc)),
      );
    }
  });

  test('enabling writes refuses a superuser runtime role rather than silently bypassing RLS', async () => {
    const unsafe = new DocumentCommandService(
      database,
      permissionRepo,
      memberRepo,
    );
    await expect(unsafe.onModuleInit()).rejects.toThrow(
      'DOCUMENT_COMMAND_REQUIRES_NON_BYPASSRLS_ROLE',
    );
    unsafe.onModuleDestroy();
  });
  test('same update id cannot be reused with different bytes, stale epoch envelope is rejected', async () => {
    const permit = await commands.acquirePermit(actor(), ids.session);
    const update = Y.encodeStateAsUpdate(live);
    await commands.ingest(permit!, update, render, 'retry-1');
    await expect(
      commands.ingest(permit!, new Uint8Array([0, 0]), render, 'retry-1'),
    ).rejects.toThrow('UPDATE_ID_REUSED');
    const extension = new DurableDocumentExtension(commands);
    const connection = {
      context: { documentPermit: permit },
      readOnly: false,
      sendStateless: jest.fn(),
    };
    await expect(
      extension.onStateless({
        connection,
        payload: JSON.stringify({
          type: 'document_update',
          updateId: 'stale',
          editEpoch: '0',
          update: Buffer.from(update).toString('base64'),
        }),
      } as any),
    ).rejects.toThrow('INVALID_DOCUMENT_ENVELOPE');
    expect(connection.sendStateless).not.toHaveBeenCalled();
    expect(
      await pg`SELECT * FROM document_updates WHERE update_id='stale'`,
    ).toHaveLength(0);
  });
  test('real browser adapter persists typing, blocks Agent with permit and quarantines offline content across an Agent commit', async () => {
    const { createServer } = await import('node:http');
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve } = await import('node:path');
    const puppeteer = (await import('puppeteer-core')).default;
    const dir = mkdtempSync(join(tmpdir(), 'docmost-browser-p0-'));
    const bundle = join(dir, 'browser.js');
    execFileSync(
      resolve(__dirname, '../../../../node_modules/.bin/esbuild'),
      [
        join(__dirname, 'browser-durable-entry.ts'),
        '--bundle',
        '--platform=browser',
        '--format=iife',
        '--outfile=' + bundle,
      ],
      { stdio: 'pipe' },
    );
    const { redisGateway } = await import('./redis-gateway-fixture');
    const second = new DocumentCommandService(
      database,
      permissionRepo,
      memberRepo,
    );
    const gatewayA = await redisGateway(commands, {
      userId: ids.user,
      workspaceId: ids.workspace,
      sessionId: ids.session,
    });
    const gatewayB = await redisGateway(second, {
      userId: ids.user,
      workspaceId: ids.workspace,
      sessionId: ids.session,
    });
    const http = createServer((req, res) => {
      if (req.url === '/browser.js') {
        res.setHeader('content-type', 'text/javascript');
        res.end(readFileSync(bundle));
      } else {
        res.setHeader('content-type', 'text/html');
        res.end(
          '<div id="status"></div><div id="editor"></div><script src="/browser.js"></script>',
        );
      }
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.P0_CHROME_BIN ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });
    const tab = await browser.newPage();
    tab.setDefaultTimeout(5000);
    const errors: string[] = [];
    tab.on('pageerror', (error) => errors.push(String(error)));
    try {
      await tab.goto(`http://127.0.0.1:${(http.address() as any).port}`);
      await tab.evaluate((config) => (window as any).fixture.connect(config), {
        url: gatewayA.url,
        pageId: ids.page,
        scope: {
          workspaceId: ids.workspace,
          userId: ids.user,
          pageId: ids.page,
        },
      });
      await tab.waitForFunction(
        () => {
          const f = (window as any).fixture;
          return f.synced && f.status?.permitted;
        },
        { timeout: 5000 },
      );
      expect(await tab.$('.ProseMirror')).not.toBeNull();
      const peer = await browser.newPage();
      peer.setDefaultTimeout(5000);
      await peer.goto(`http://127.0.0.1:${(http.address() as any).port}`);
      await peer.evaluate((config) => (window as any).fixture.connect(config), {
        url: gatewayB.url,
        pageId: ids.page,
        scope: {
          workspaceId: ids.workspace,
          userId: ids.user,
          pageId: ids.page,
        },
      });
      await peer.waitForFunction(
        () => {
          const f = (window as any).fixture;
          return f.synced && f.status?.permitted;
        },
        { timeout: 5000 },
      );

      const before = await second.editContext(agent());
      await expect(
        second.edit(
          agent(),
          {
            key: 'browser-busy',
            versionToken: before.token,
            commands: [{ type: 'append', text: 'must not save' }],
          },
          render,
        ),
      ).rejects.toThrow('DOCUMENT_BUSY');
      await tab.bringToFront();
      await tab.click('.ProseMirror');
      await tab.keyboard.press('End');
      await tab.keyboard.type(' browser durable');
      await tab.waitForFunction(() => {
        const f = (window as any).fixture;
        return (
          f.status?.pending === 0 &&
          f.doc.getXmlFragment('default').toString().includes('browser durable')
        );
      });
      expect(
        (await pg`SELECT text_content FROM pages WHERE id=${ids.page}`)[0]
          .text_content,
      ).toContain('browser durable');
      await peer.bringToFront();
      await peer.waitForFunction(() =>
        document
          .querySelector('.ProseMirror')
          ?.textContent?.includes('browser durable'),
      );
      await tab.bringToFront();
      await peer.close();
      await tab.evaluate(() => {
        const f = (window as any).fixture;
        f.socket.disconnect();
      });
      await tab.waitForFunction(
        () => (window as any).fixture.status?.permitted === false,
      );
      const deadline = Date.now() + 5000;
      while (
        gatewayA.disconnected() + gatewayB.disconnected() < 2 &&
        Date.now() < deadline
      )
        await new Promise((r) => setTimeout(r, 20));
      expect(
        gatewayA.disconnected() + gatewayB.disconnected(),
      ).toBeGreaterThanOrEqual(2);
      await tab.evaluate(() =>
        (window as any).fixture.append('offline private draft'),
      );
      await tab.waitForFunction(async () =>
        Boolean(await (window as any).fixture.draft()),
      );
      const context = await commands.editContext(agent());
      await second.edit(
        agent(),
        {
          key: 'browser-agent-change',
          versionToken: context.token,
          commands: [{ type: 'append', text: 'Agent committed' }],
        },
        render,
      );
      await commands.recoverPage(actor());
      await tab.evaluate(() => (window as any).fixture.socket.connect());
      await tab.waitForFunction(
        () => (window as any).fixture.status?.recovery === true,
      );
      expect(
        await tab.evaluate(
          async () => (await (window as any).fixture.draft())?.text,
        ),
      ).toContain('offline private draft');
      expect(
        (await pg`SELECT text_content FROM pages WHERE id=${ids.page}`)[0]
          .text_content,
      ).not.toContain('offline private draft');
      expect(
        await tab.$eval('.ProseMirror', (el) =>
          el.getAttribute('contenteditable'),
        ),
      ).toBe('false');
      expect(errors).toEqual([]);
    } catch (error) {
      process.stderr.write('Browser Redis failure: ' + String(error) + '\n');
      throw error;
    } finally {
      await browser.close();
      await Promise.all([gatewayA.close(), gatewayB.close()]);
      second.unload(ids.page);
      await new Promise<void>((r) => http.close(() => r()));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
  test('title writes share version fencing and preserve binary; duplicate and no-op do not create extra history', async () => {
    const before = await commands.editContext(agent());
    const input = {
      key: 'title-once',
      versionToken: before.token,
      commands: [],
      title: 'new title',
      tool: 'update_page_metadata' as const,
    };
    const result = await commands.edit(agent(), input, render);
    expect(result.changed).toBe(true);
    expect(await commands.edit(agent(), input, render)).toEqual(result);
    const stored = (
      await pg`SELECT title,ydoc FROM pages WHERE id=${ids.page}`
    )[0];
    expect(stored.title).toBe('new title');
    expect(Buffer.from(stored.ydoc)).toEqual(Buffer.from(before.binary));
    await expect(
      commands.edit(
        agent(),
        {
          key: 'stale-title',
          versionToken: before.token,
          commands: [{ type: 'append', text: 'stale' }],
        },
        render,
      ),
    ).rejects.toThrow('REVISION_CONFLICT');
    const next = await commands.editContext(agent());
    const unchanged = await commands.edit(
      agent(),
      { ...input, key: 'title-noop', versionToken: next.token },
      render,
    );
    expect(unchanged.changed).toBe(false);
    expect(unchanged.revision).toBe(result.revision);
    expect(
      (
        await pg`SELECT used,reserved FROM agent_quota_buckets WHERE kind='edit' AND subject=${ids.grant}`
      )[0],
    ).toMatchObject({ used: 1, reserved: 0 });
    expect(
      (
        await pg`SELECT used FROM agent_quota_buckets WHERE kind='write' AND subject=${ids.grant}`
      )[0].used,
    ).toBe(2);
    expect(
      (
        await pg`SELECT used FROM agent_quota_buckets WHERE kind='query' AND subject=${ids.grant}`
      )[0].used,
    ).toBe(1);
    expect(
      await pg`SELECT * FROM page_history WHERE page_id=${ids.page}`,
    ).toHaveLength(2);
  });

  test('actual DocumentCommandService worker killed after commit returns the same durable operation on another instance', async () => {
    const { fork } = await import('node:child_process');
    const context = await commands.editContext(agent());
    const input = {
      key: 'process-commit-loss',
      versionToken: context.token,
      commands: [{ type: 'append' as const, text: 'survives SIGKILL' }],
    };
    const worker = fork(join(__dirname, 'document-process-worker.ts'), [], {
      execPath: process.execPath,
      execArgv: [
        '-r',
        require.resolve('ts-node/register/transpile-only'),
        '-r',
        require.resolve('tsconfig-paths/register'),
      ],
      env: {
        ...process.env,
        TS_NODE_PROJECT: join(__dirname, '../../tsconfig.json'),
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({ esModuleInterop: true }),
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    worker.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    try {
      const committed = await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('Worker timeout ' + stderr)),
          10000,
        );
        worker.once('message', (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        worker.once('exit', (code) => {
          clearTimeout(timer);
          reject(Error('Worker exit ' + code + ' ' + stderr));
        });
        worker.send({ actor: agent(), input });
      });
      expect(committed.phase).toBe('committed');
      const exited = new Promise((r) => worker.once('exit', r));
      worker.kill('SIGKILL');
      await exited;
      const replay = await commands.edit(agent(), input, render);
      expect(replay.operationId).toBe(committed.operationId);
      expect(replay.status).toBe('committed');
      const binary = (await pg`SELECT ydoc FROM pages WHERE id=${ids.page}`)[0]
        .ydoc;
      const reopened = new Y.Doc();
      try {
        Y.applyUpdate(reopened, binary);
        expect(
          reopened
            .getXmlFragment('default')
            .toString()
            .split('survives SIGKILL'),
        ).toHaveLength(2);
      } finally {
        reopened.destroy();
      }
      expect(
        await pg`SELECT * FROM document_operations WHERE idempotency_key='process-commit-loss'`,
      ).toHaveLength(1);
    } finally {
      if (worker.exitCode === null) worker.kill('SIGKILL');
    }
  }, 20000);

  test('Redis stale routing owner cannot renew or delete the replacement owner lock', async () => {
    const Redis = (await import('ioredis')).default;
    const { pack, unpack } = await import('msgpackr');
    const { RedisSyncExtension } =
      await import('../../src/collaboration/extensions/redis-sync');
    const connection = new Redis(process.env.P0_REDIS_URL!);
    const inspect = new Redis(process.env.P0_REDIS_URL!);
    const prefix = 'p0-' + randomUUID();
    const route = new RedisSyncExtension({
      redis: connection,
      pack,
      unpack,
      serverId: 'stale-node',
      prefix,
      lockTTL: 100,
    });
    const closeConnections = jest.fn();
    await route.onConfigure({ instance: { closeConnections } } as any);
    try {
      await route.lockDocument('page.test');
      const keys = await inspect.keys(prefix + '*');
      const actual = keys.find((key) => key.includes('page.test'))!;
      expect(actual).toBeDefined();
      await inspect.set(actual, 'replacement-node', 'PX', 5000);
      await new Promise((r) => setTimeout(r, 150));
      expect(await inspect.get(actual)).toBe('replacement-node');
      expect(closeConnections).toHaveBeenCalledWith('page.test');
      await route.releaseLock('page.test');
      expect(await inspect.get(actual)).toBe('replacement-node');
    } finally {
      await route.onDestroy();
      inspect.disconnect();
    }
  });
});

test('Agent history attribution and durable human restore require a fresh confirmed version', async () => {
  const materialize = (doc: Y.Doc) =>
    TiptapTransformer.fromYdoc(doc, 'default');
  await commands.mutate(actor(), () => {}, materialize);
  const context = await commands.editContext(agent());
  const edited = await commands.edit(
    agent(),
    {
      key: 'history-source',
      versionToken: context.token,
      commands: [{ type: 'append', text: 'agent addition' }],
    },
    materialize,
  );
  const histories =
    await pg`SELECT id,agent_source FROM page_history WHERE page_id=${ids.page}`;
  expect(histories).toHaveLength(2);
  const before = histories.find((h) => h.agent_source.side === 'before')!;
  expect(before.agent_source.application).toBe('registered-client');
  expect(before.agent_source.operationId).toBe(edited.operationId);
  const permit = await commands.acquirePermit(actor(), ids.session);
  const confirmed = await commands.runtime(actor(), ids.session);
  await pg`UPDATE pages SET title='later human title' WHERE id=${ids.page}`;
  const construct = (content: unknown) =>
    TiptapTransformer.toYdoc(content as any, 'default', tiptapExtensions);
  await expect(
    commands.restoreHistory(
      permit!,
      before.id,
      confirmed.versionToken!,
      'stale-restore',
      construct,
      materialize,
    ),
  ).rejects.toThrow('REVISION_CONFLICT');
  expect(
    await pg`SELECT * FROM page_history WHERE page_id=${ids.page}`,
  ).toHaveLength(2);
  const fresh = await commands.runtime(actor(), ids.session);
  const restored = await commands.restoreHistory(
    permit!,
    before.id,
    fresh.versionToken!,
    'fresh-restore',
    construct,
    materialize,
  );
  expect(restored.title).toBe('page');
  const durable = (
    await pg`SELECT title,ydoc FROM pages WHERE id=${ids.page}`
  )[0];
  const reloaded = new Y.Doc();
  try {
    Y.applyUpdate(reloaded, new Uint8Array(durable.ydoc));
    expect(reloaded.getXmlFragment('default').toString()).toContain('before');
    expect(reloaded.getXmlFragment('default').toString()).not.toContain(
      'agent addition',
    );
    expect(live.getXmlFragment('default').toString()).toBe(
      reloaded.getXmlFragment('default').toString(),
    );
  } finally {
    reloaded.destroy();
  }
  expect(
    await pg`SELECT * FROM page_history WHERE page_id=${ids.page}`,
  ).toHaveLength(4);
});

test('P1 foreground deadline returns pending for the original durable operation, then commits once', async () => {
  const ctx = await commands.editContext(agent());
  const work = commands.edit(
    agent(),
    {
      key: 'p1-pending',
      versionToken: ctx.token,
      commands: [{ type: 'append', text: 'delayed durable write' }],
    },
    async (doc) => {
      await new Promise((r) => setTimeout(r, 15500));
      return render(doc);
    },
  );
  const start = Date.now();
  const pending = await commands.waitForOperation(
    agent(),
    { key: 'p1-pending', tool: 'edit_page' },
    work,
  );
  expect(pending.status).toBe('pending');
  expect(Date.now() - start).toBeGreaterThanOrEqual(15000);
  const result = await work;
  expect(result.status).toBe('committed');
  expect(result.operationId).toBe(pending.operationId);
  expect(
    (
      await pg`SELECT count(*)::int as n FROM document_operations WHERE idempotency_key='p1-pending'`
    )[0].n,
  ).toBe(1);
}, 20000);

test('expired edit result is a tombstone, never a second write; verified ingest advances checkpoint', async () => {
  const context = await commands.editContext(agent());
  const input = {
    key: 'retention-edit',
    versionToken: context.token,
    commands: [{ type: 'append' as const, text: 'once' }],
  };
  const result = await commands.edit(agent(), input, render);
  const before = (await pg`SELECT ydoc FROM pages WHERE id=${ids.page}`)[0]
    .ydoc;
  await pg`UPDATE document_operations SET result=null,result_expired_at=clock_timestamp() WHERE id=${result.operationId}`;
  await expect(commands.edit(agent(), input, render)).rejects.toThrow(
    'OPERATION_RESULT_EXPIRED',
  );
  await expect(
    commands.findOperation(agent(), result.operationId),
  ).rejects.toThrow('OPERATION_RESULT_EXPIRED');
  expect(
    (await pg`SELECT ydoc FROM pages WHERE id=${ids.page}`)[0].ydoc,
  ).toEqual(before);
  expect(await pg`SELECT * FROM document_operations`).toHaveLength(1);
  expect(Number((await readGate()).checkpoint_revision)).toBeGreaterThan(0);
});
