import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Document, IncomingMessage, MessageReceiver } from '@hocuspocus/server';
import { db, Store, principal } from './store';
const sql = db('p0_hooks');
const store = new Store(sql);
function packet(payload: Uint8Array, subtype = 2) {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, 0);
  encoding.writeVarUint(e, subtype);
  encoding.writeVarUint8Array(e, payload);
  return encoding.toUint8Array(e);
}
function envelope(updateId: string, epoch: string, payload: Uint8Array) {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, 1);
  encoding.writeVarString(e, updateId);
  encoding.writeVarString(e, epoch);
  encoding.writeVarUint8Array(e, payload);
  return encoding.toUint8Array(e);
}
function decodeEnvelope(bytes: Uint8Array) {
  if (bytes.length > 300000) throw Error('CONTENT_TOO_LARGE');
  const d = decoding.createDecoder(bytes);
  if (decoding.readVarUint(d) !== 1) throw Error('PROTOCOL_VERSION');
  const id = decoding.readVarString(d);
  const epoch = decoding.readVarString(d);
  const payload = decoding.readVarUint8Array(d);
  if (!id || id.length > 128 || !/^\d+$/.test(epoch) || decoding.hasContent(d))
    throw Error('INVALID_ENVELOPE');
  return { id, epoch, payload };
}
// One queue wraps the entire receiver apply, not merely a per-connection hook.
class Adapter {
  private tail = Promise.resolve();
  constructor(readonly live: Document) {}
  receive(session: string, bytes: Uint8Array, failStore = false) {
    const task = this.tail.then(async () => {
      const { id, epoch, payload } = decodeEnvelope(bytes);
      let revision: string | undefined;
      const sent: Uint8Array[] = [];
      const connection: any = {
        readOnly: false,
        messageAddress: 'page',
        send: (message: Uint8Array) => sent.push(message),
        callbacks: {
          beforeSync: async (
            _connection: unknown,
            message: { type: number; payload: Uint8Array },
          ) => {
            if (message.type === 0) return;
            if (failStore) throw Error('PERSISTENCE_UNAVAILABLE');
            revision = await store.ingest(
              principal,
              session,
              epoch,
              id,
              message.payload,
            );
            Y.applyUpdate(this.live, message.payload, 'durable-human');
          },
        },
      };
      await new MessageReceiver(new IncomingMessage(payload)).apply(
        this.live,
        connection,
      );
      return { id, epoch, revision, sent };
    });
    this.tail = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}
beforeAll(async () => {
  await sql`CREATE SCHEMA p0_hooks`;
  await sql.unsafe(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
});
beforeEach(async () => {
  await sql`TRUNCATE grants,documents,permits,operations,history,outbox,journal,oauth_codes,oauth_families,oauth_tokens CASCADE`;
  const d = new Y.Doc();
  await store.seed(Y.encodeStateAsUpdate(d));
  d.destroy();
});
afterAll(async () => {
  await sql.end();
});
describe('P0 AC-03/06/07 Hocuspocus 4.0.0 real message receiver', () => {
  test.each([1, 2])(
    'Sync subtype %i cannot apply or ack before persistence succeeds',
    async (subtype) => {
      const live = new Document('page');
      const source = new Y.Doc();
      source.getText('body').insert(0, 'persist me');
      const update = Y.encodeStateAsUpdate(source);
      const epoch = await store.permit(principal, 'session');
      const adapter = new Adapter(live);
      try {
        await expect(
          adapter.receive(
            'session',
            envelope('u1', epoch, packet(update, subtype)),
            true,
          ),
        ).rejects.toThrow('PERSISTENCE_UNAVAILABLE');
        expect(live.getText('body').toString()).toBe('');
        expect(await sql`SELECT * FROM journal`).toHaveLength(0);
        const response = await adapter.receive(
          'session',
          envelope('u1', epoch, packet(update, subtype)),
        );
        expect(response.revision).toBe('2');
        expect(response.sent.length).toBeGreaterThan(0);
        expect(live.getText('body').toString()).toBe('persist me');
        const restored = new Y.Doc();
        Y.applyUpdate(
          restored,
          (await sql`SELECT ydoc FROM documents`)[0].ydoc,
        );
        expect(restored.getText('body').toString()).toBe('persist me');
        restored.destroy();
        const replay = await adapter.receive(
          'session',
          envelope('u1', epoch, packet(update, subtype)),
        );
        expect(replay.revision).toBe('2');
        expect(await sql`SELECT * FROM journal`).toHaveLength(1);
        expect(live.getText('body').toString()).toBe('persist me');
      } finally {
        live.destroy();
        source.destroy();
      }
    },
  );
  test('beforeSync throw blocks default apply and default ack', async () => {
    const live = new Document('page');
    const source = new Y.Doc();
    source.getText('body').insert(0, 'bad');
    const sent: any[] = [];
    const connection: any = {
      readOnly: false,
      send: (m: any) => sent.push(m),
      callbacks: {
        beforeSync: async () => {
          throw Error('denied');
        },
      },
    };
    try {
      await expect(
        new MessageReceiver(
          new IncomingMessage(packet(Y.encodeStateAsUpdate(source))),
        ).apply(live, connection),
      ).rejects.toThrow('denied');
      expect(sent).toHaveLength(0);
      expect(live.getText('body').toString()).toBe('');
    } finally {
      live.destroy();
      source.destroy();
    }
  });
  test('two human sessions converge through a document-wide queue', async () => {
    const live = new Document('page');
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.getText('body').insert(0, 'A');
    b.getText('body').insert(0, 'B');
    const epochA = await store.permit(principal, 'a');
    const epochB = await store.permit(principal, 'b');
    const adapter = new Adapter(live);
    try {
      await Promise.all([
        adapter.receive(
          'a',
          envelope('a1', epochA, packet(Y.encodeStateAsUpdate(a))),
        ),
        adapter.receive(
          'b',
          envelope('b1', epochB, packet(Y.encodeStateAsUpdate(b))),
        ),
      ]);
      const restored = new Y.Doc();
      Y.applyUpdate(restored, (await sql`SELECT ydoc FROM documents`)[0].ydoc);
      expect(restored.getText('body').toString()).toBe(
        live.getText('body').toString(),
      );
      expect(live.getText('body').length).toBe(2);
      restored.destroy();
    } finally {
      live.destroy();
      a.destroy();
      b.destroy();
    }
  });
  test('out-of-order pending structs survive database reconstruction', async () => {
    const source = new Y.Doc();
    const updates: Uint8Array[] = [];
    source.on('update', (u: Uint8Array) => updates.push(u));
    source.getText('body').insert(0, 'A');
    source.getText('body').insert(1, 'B');
    const live = new Document('page');
    const epoch = await store.permit(principal, 's');
    const adapter = new Adapter(live);
    try {
      await adapter.receive('s', envelope('second', epoch, packet(updates[1])));
      expect(live.getText('body').toString()).toBe('');
      const reloaded = new Document('page');
      Y.applyUpdate(reloaded, (await sql`SELECT ydoc FROM documents`)[0].ydoc);
      try {
        await new Adapter(reloaded).receive(
          's',
          envelope('first', epoch, packet(updates[0])),
        );
        expect(reloaded.getText('body').toString()).toBe('AB');
      } finally {
        reloaded.destroy();
      }
      expect(await sql`SELECT * FROM journal`).toHaveLength(2);
    } finally {
      live.destroy();
      source.destroy();
    }
  });
  test('late human updates cannot cross Agent takeover epoch', async () => {
    const live = new Document('page');
    const source = new Y.Doc();
    source.getText('body').insert(0, 'late');
    const epoch = await store.permit(principal, 's');
    await sql`UPDATE permits SET expires_at=clock_timestamp()-interval '1 second'`;
    const op = await store.register(principal, 'takeover', 'p');
    await store.claim(principal, op.id);
    try {
      await expect(
        new Adapter(live).receive(
          's',
          envelope('late', epoch, packet(Y.encodeStateAsUpdate(source))),
        ),
      ).rejects.toThrow('PERMIT_EXPIRED');
      expect(live.getText('body').toString()).toBe('');
    } finally {
      live.destroy();
      source.destroy();
    }
  });
  test('delete-only updates persist and duplicate binary under a new id does not advance revision', async () => {
    const live = new Document('page');
    const source = new Y.Doc();
    const updates: Uint8Array[] = [];
    source.on('update', (u: Uint8Array) => updates.push(u));
    source.getText('body').insert(0, 'delete me');
    const epoch = await store.permit(principal, 's');
    const adapter = new Adapter(live);
    try {
      const first = await adapter.receive(
        's',
        envelope('insert', epoch, packet(updates[0])),
      );
      const duplicate = await adapter.receive(
        's',
        envelope('duplicate', epoch, packet(updates[0])),
      );
      expect(duplicate.revision).toBe(first.revision);
      source.getText('body').delete(0, 9);
      const removed = await adapter.receive(
        's',
        envelope('delete', epoch, packet(updates[1])),
      );
      expect(BigInt(removed.revision!)).toBe(BigInt(first.revision!) + 1n);
      const restored = new Y.Doc();
      Y.applyUpdate(restored, (await sql`SELECT ydoc FROM documents`)[0].ydoc);
      expect(restored.getText('body').toString()).toBe('');
      restored.destroy();
    } finally {
      live.destroy();
      source.destroy();
    }
  });
  test('same update id with different payload is rejected', async () => {
    const live = new Document('page');
    const source = new Y.Doc();
    source.getText('body').insert(0, 'A');
    const epoch = await store.permit(principal, 's');
    const adapter = new Adapter(live);
    try {
      await adapter.receive(
        's',
        envelope('same', epoch, packet(Y.encodeStateAsUpdate(source))),
      );
      source.getText('body').insert(1, 'B');
      await expect(
        adapter.receive(
          's',
          envelope('same', epoch, packet(Y.encodeStateAsUpdate(source))),
        ),
      ).rejects.toThrow('UPDATE_ID_REUSED');
      expect(live.getText('body').toString()).toBe('A');
    } finally {
      live.destroy();
      source.destroy();
    }
  });
});
