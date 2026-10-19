import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, fork } from 'node:child_process';
import { once } from 'node:events';
import * as Y from 'yjs';
import { db, Store, principal } from './store';
const sql = db();
const second = db();
const store = new Store(sql);
const other = new Store(second);
function ydoc(text: string) {
  const d = new Y.Doc();
  d.getText('body').insert(0, text);
  const b = Y.encodeStateAsUpdate(d);
  d.destroy();
  return b;
}
function content(b: Uint8Array) {
  const d = new Y.Doc();
  Y.applyUpdate(d, b);
  const t = d.getText('body').toString();
  d.destroy();
  return t;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeAll(async () => {
  await sql`CREATE SCHEMA p0_transactions`;
  await sql.unsafe(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
});
beforeEach(async () => {
  await sql`TRUNCATE grants,documents,permits,operations,history,outbox,journal,oauth_codes,oauth_families,oauth_tokens CASCADE`;
  await store.seed(ydoc('before'));
});
afterAll(async () => {
  await sql.end();
  await second.end();
});

describe('P0 AC-02/03/04/05/06/07/18 PostgreSQL transactions', () => {
  test('create metadata failure leaves no half-created page; same-key retry creates once', async () => {
    const op = await store.register(
      principal,
      'create',
      'new document',
      'create_page',
    );
    await expect(
      store.create(principal, op.id, ydoc('new'), true),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await sql`SELECT * FROM documents`).toHaveLength(1);
    expect(await sql`SELECT * FROM node_metadata`).toHaveLength(1);
    expect(await sql`SELECT * FROM history`).toHaveLength(0);
    expect((await sql`SELECT status FROM operations`)[0].status).toBe(
      'pending',
    );
    const first = await store.create(principal, op.id, ydoc('new'));
    const retry = await other.register(
      principal,
      'create',
      'new document',
      'create_page',
    );
    expect(await other.create(principal, retry.id, ydoc('ignored'))).toEqual(
      first,
    );
    expect(await sql`SELECT * FROM documents`).toHaveLength(2);
    expect(await sql`SELECT * FROM node_metadata`).toHaveLength(2);
    expect(await sql`SELECT * FROM history`).toHaveLength(1);
    expect(await sql`SELECT * FROM outbox`).toHaveLength(1);
  });
  test('two independent connections cannot grant human and Agent eligibility together', async () => {
    const op = await store.register(principal, 'race', 'payload');
    const result = await Promise.allSettled([
      store.permit(principal, 'human'),
      other.claim(principal, op.id),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  test('all users block Agent but multiple humans retain eligibility', async () => {
    await store.permit(principal, 'human-one');
    await sql`INSERT INTO grants(id,workspace,actor,client,spaces,scopes) SELECT 'other-grant',workspace,'other-user',client,spaces,scopes FROM grants WHERE id='grant'`;
    await other.permit(
      { ...principal, actor: 'other-user', grant: 'other-grant' },
      'human-two',
    );
    const op = await store.register(principal, 'busy', 'payload');
    await expect(store.claim(principal, op.id)).rejects.toThrow(
      'DOCUMENT_BUSY',
    );
    expect((await sql`SELECT * FROM permits`).length).toBe(2);
    expect((await sql`SELECT revision FROM documents`)[0].revision).toBe('1');
  });
  test('two Agents cannot own the same document', async () => {
    const a = await store.register(principal, 'a', 'a');
    const b = await other.register(principal, 'b', 'b');
    const result = await Promise.allSettled([
      store.claim(principal, a.id),
      other.claim(principal, b.id),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  test.each(['workspace', 'actor', 'client', 'grant'] as const)(
    'rejects foreign %s identity',
    async (field) => {
      await expect(
        store.register({ ...principal, [field]: 'foreign' }, 'key', 'p'),
      ).rejects.toThrow('SCOPE_DENIED');
      expect(await sql`SELECT * FROM operations`).toHaveLength(0);
    },
  );
  test('empty scopes, removed space and expired grant cannot write', async () => {
    await sql`UPDATE grants SET scopes=ARRAY[]::text[]`;
    await expect(store.register(principal, 'key', 'p')).rejects.toThrow(
      'SCOPE_DENIED',
    );
    await sql`UPDATE grants SET scopes=ARRAY['knowledge.read','pages.edit']`;
    const op = await store.register(principal, 'key', 'p');
    await sql`UPDATE grants SET spaces=ARRAY[]::text[]`;
    await expect(store.claim(principal, op.id)).rejects.toThrow('SCOPE_DENIED');
    await sql`UPDATE grants SET expires_at=clock_timestamp()-interval '1 second'`;
    await expect(store.register(principal, 'next', 'p')).rejects.toThrow(
      'SCOPE_DENIED',
    );
  });
  test('20 concurrent same-key requests and repeated submit have one durable effect', async () => {
    const ops = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? store : other).register(principal, 'same', 'append'),
      ),
    );
    expect(new Set(ops.map((o) => o.id)).size).toBe(1);
    await expect(
      store.register(principal, 'same', 'different'),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
    const lease = await store.claim(principal, ops[0].id);
    const first = await store.commit(
      principal,
      ops[0].id,
      lease,
      ydoc('after'),
    );
    // First response discarded: a different connection queries/retries the same operation.
    const replay = await other.register(principal, 'same', 'append');
    expect(replay.result).toEqual(first);
    expect(
      await other.commit(principal, ops[0].id, lease, ydoc('must-not-apply')),
    ).toEqual(first);
    expect(await sql`SELECT * FROM history`).toHaveLength(2);
    expect(await sql`SELECT * FROM outbox`).toHaveLength(1);
    expect(content((await sql`SELECT ydoc FROM documents`)[0].ydoc)).toBe(
      'after',
    );
  });
  test('failure after document update rolls back content, history, result and outbox', async () => {
    const op = await store.register(principal, 'fail', 'p');
    const lease = await store.claim(principal, op.id);
    await expect(
      store.commit(principal, op.id, lease, ydoc('bad'), {
        failAfterSave: true,
      }),
    ).rejects.toThrow('INJECTED_STORAGE_FAILURE');
    expect(content((await sql`SELECT ydoc FROM documents`)[0].ydoc)).toBe(
      'before',
    );
    expect(await sql`SELECT * FROM history`).toHaveLength(0);
    expect(await sql`SELECT * FROM outbox`).toHaveLength(0);
    expect((await sql`SELECT status FROM operations`)[0].status).toBe(
      'running',
    );
  });
  test.each(['revision', 'generation'] as const)(
    'final transaction rechecks %s after candidate calculation',
    async (field) => {
      const op = await store.register(principal, field, 'p');
      const lease = await store.claim(principal, op.id);
      if (field === 'revision')
        await sql`UPDATE documents SET revision=revision+1`;
      else await sql`UPDATE documents SET generation='restored'`;
      await expect(
        store.commit(principal, op.id, lease, ydoc('bad')),
      ).rejects.toThrow('REVISION_CONFLICT');
      expect(await sql`SELECT * FROM history`).toHaveLength(0);
    },
  );
  test('expired executor is fenced before recovery and never regains authority', async () => {
    const op = await store.register(principal, 'expired', 'p');
    const lease = await store.claim(principal, op.id);
    await sql`UPDATE documents SET agent_until=clock_timestamp()-interval '1 second'`;
    await expect(
      store.commit(principal, op.id, lease, ydoc('bad')),
    ).rejects.toThrow('STALE_EXECUTOR');
    expect(await other.recover(op.id)).toEqual({ status: 'recovering' });
    await expect(
      store.commit(principal, op.id, lease, ydoc('bad')),
    ).rejects.toThrow('STALE_EXECUTOR');
    await expect(store.permit(principal, 'human')).rejects.toThrow(
      'DOCUMENT_BUSY',
    );
  });
  test('recovery reclaims the same operation, persists once and reopens human editing', async () => {
    const op = await store.register(principal, 'recover-success', 'p');
    const old = await store.claim(principal, op.id);
    await sql`UPDATE documents SET agent_until=clock_timestamp()-interval '1 second'`;
    await other.recover(op.id);
    const next = await other.resume(principal, op.id);
    await expect(
      store.commit(principal, op.id, old, ydoc('stale')),
    ).rejects.toThrow('STALE_EXECUTOR');
    await other.commit(principal, op.id, next, ydoc('recovered'));
    await other.finishSync(op.id);
    await expect(store.permit(principal, 'human-back')).resolves.toBeDefined();
    expect(content((await sql`SELECT ydoc FROM documents`)[0].ydoc)).toBe(
      'recovered',
    );
    expect(await sql`SELECT * FROM history`).toHaveLength(2);
  });
  test('old owner cannot submit even if Agent lease is still valid', async () => {
    const op = await store.register(principal, 'owner', 'p');
    const lease = await store.claim(principal, op.id);
    await sql`UPDATE documents SET owner_epoch=owner_epoch+1`;
    await expect(
      store.commit(principal, op.id, lease, ydoc('bad')),
    ).rejects.toThrow('STALE_EXECUTOR');
  });
  test('revocation before final submit wins; committed content is not falsely undone', async () => {
    const op = await store.register(principal, 'revoke', 'p');
    const lease = await store.claim(principal, op.id);
    await other.revoke();
    await expect(
      store.commit(principal, op.id, lease, ydoc('bad')),
    ).rejects.toThrow('SCOPE_DENIED');
    expect(content((await sql`SELECT ydoc FROM documents`)[0].ydoc)).toBe(
      'before',
    );
  });
  test('revocation blocks behind an already authorized committing transaction', async () => {
    const op = await store.register(principal, 'ordering', 'p');
    const lease = await store.claim(principal, op.id);
    const reached = deferred();
    const release = deferred();
    const committing = store.commit(principal, op.id, lease, ydoc('after'), {
      beforeCommit: async () => {
        reached.resolve();
        await release.promise;
      },
    });
    await reached.promise;
    let revokeCompleted = false;
    const revoking = other.revoke().then(() => {
      revokeCompleted = true;
    });
    try {
      // Poll PG lock facts rather than infer ordering from a sleep.
      let blocked = false;
      for (let n = 0; n < 100; n++) {
        const rows =
          await sql`SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'UPDATE grants SET active=false%'`;
        if (rows.length) {
          blocked = true;
          break;
        }
        await new Promise((r) => setImmediate(r));
      }
      expect(blocked).toBe(true);
      expect(revokeCompleted).toBe(false);
    } finally {
      release.resolve();
    }
    await committing;
    await revoking;
    expect((await sql`SELECT status FROM operations`)[0].status).toBe(
      'committed',
    );
  });
  test('recovery cannot mistake an in-flight COMMIT for failure', async () => {
    const op = await store.register(principal, 'unknown', 'p');
    const lease = await store.claim(principal, op.id);
    const reached = deferred();
    const release = deferred();
    const committing = store.commit(principal, op.id, lease, ydoc('after'), {
      beforeCommit: async () => {
        reached.resolve();
        await release.promise;
      },
    });
    await reached.promise;
    const recovering = other.recover(op.id);
    release.resolve();
    expect(await recovering).toEqual(await committing);
    await store.finishSync(op.id);
    await expect(store.permit(principal, 'resumed')).resolves.toBeDefined();
  });
  test.each(['before', 'after'] as const)(
    'worker SIGKILL %s COMMIT leaves a decidable durable result',
    async (stop) => {
      const op = await store.register(principal, `kill-${stop}`, 'p');
      const lease = await store.claim(principal, op.id);
      const child = fork(join(__dirname, 'worker.ts'), [], {
        execPath: process.execPath,
        execArgv: ['--import', require.resolve('tsx')],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      try {
        const ready = new Promise<any>((resolve, reject) => {
          child.once('message', resolve);
          child.once('error', reject);
          child.once('exit', (code) =>
            reject(Error(`worker exited ${code}: ${stderr}`)),
          );
        });
        child.send({ id: op.id, lease, stop });
        expect(await ready).toEqual({ phase: stop });
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
        // An explicit row lock waits for backend rollback/commit, not a timing guess.
        const result = await sql.begin(async (raw) => {
          const tx = raw as unknown as import('postgres').Sql;
          await tx`SELECT id FROM documents WHERE id='page' FOR UPDATE`;
          const [row] =
            await tx`SELECT * FROM operations WHERE id=${op.id} FOR UPDATE`;
          return row;
        });
        expect(result.status).toBe(stop === 'before' ? 'running' : 'committed');
        const rows = await sql`SELECT * FROM history`;
        expect(rows).toHaveLength(stop === 'before' ? 0 : 2);
        expect(content((await sql`SELECT ydoc FROM documents`)[0].ydoc)).toBe(
          stop === 'before' ? 'before' : 'worker-content',
        );
        const retry = await other.register(principal, `kill-${stop}`, 'p');
        expect(retry.id).toBe(op.id);
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
      }
    },
  );
  test('committed ydoc and both history baselines survive immediate PG restart', async () => {
    const op = await store.register(principal, 'restart', 'p');
    const lease = await store.claim(principal, op.id);
    await store.commit(principal, op.id, lease, ydoc('durable'));
    execFileSync(
      join(process.env.P0_PG_BIN!, 'pg_ctl'),
      [
        '-D',
        process.env.P0_PG_DATA!,
        '-l',
        join(process.env.P0_PG_DATA!, 'restart.log'),
        '-m',
        'immediate',
        '-w',
        'restart',
      ],
      { stdio: 'pipe' },
    );
    const fresh = db();
    try {
      expect(content((await fresh`SELECT ydoc FROM documents`)[0].ydoc)).toBe(
        'durable',
      );
      expect((await fresh`SELECT status FROM operations`)[0].status).toBe(
        'committed',
      );
      const history = await fresh`SELECT * FROM history ORDER BY side`;
      expect(content(history.find((r) => r.side === 'before')!.ydoc)).toBe(
        'before',
      );
      expect(content(history.find((r) => r.side === 'after')!.ydoc)).toBe(
        'durable',
      );
    } finally {
      await fresh.end();
    }
  });
});
