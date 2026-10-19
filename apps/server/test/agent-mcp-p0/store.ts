// P0 executable transaction probe. Not imported by the application or a Nest module.
import postgres from 'postgres';
import { createHash, randomUUID } from 'node:crypto';
import * as Y from 'yjs';
export const hash = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export const fail = (code: string): never => {
  throw new Error(code);
};
export type Principal = {
  grant: string;
  workspace: string;
  actor: string;
  client: string;
};
export const principal: Principal = {
  grant: 'grant',
  workspace: 'workspace',
  actor: 'user',
  client: 'client',
};
export const db = (schema = 'p0_transactions') => {
  if (!/^p0_[a-z]+$/.test(schema)) fail('Invalid test schema');
  if (!process.env.P0_DATABASE_URL?.startsWith('postgres://p0@127.0.0.1:'))
    fail('P0 disposable database required');
  return postgres(process.env.P0_DATABASE_URL!, {
    max: 10,
    connection: { search_path: schema },
    onnotice: () => {},
  });
};
// The probe intentionally uses a dedicated schema with no production credentials.
export class Store {
  constructor(readonly sql: ReturnType<typeof db>) {}
  async authorize(tx: any, p: Principal, scope = 'pages.edit', space?: string) {
    const [g] =
      await tx`SELECT *, expires_at > clock_timestamp() AS valid FROM grants WHERE id=${p.grant} FOR SHARE`;
    if (
      !g ||
      !g.active ||
      !g.valid ||
      g.workspace !== p.workspace ||
      g.actor !== p.actor ||
      g.client !== p.client ||
      !g.scopes.includes('knowledge.read') ||
      !g.scopes.includes(scope) ||
      (space && !g.spaces.includes(space))
    )
      fail('SCOPE_DENIED');
    return g;
  }
  async seed(ydoc: Uint8Array) {
    await this
      .sql`INSERT INTO grants(id,workspace,actor,client,spaces,scopes) VALUES('grant','workspace','user','client',ARRAY['space'],ARRAY['knowledge.read','pages.edit','pages.create'])`;
    await this
      .sql`INSERT INTO documents(id,workspace,space,generation,ydoc) VALUES('page','workspace','space','generation',${Buffer.from(ydoc)})`;
    await this
      .sql`INSERT INTO node_metadata(page,node_type) VALUES('page','folder')`;
  }
  async permit(p: Principal, session: string) {
    return this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(tx, p);
      const [d] =
        await tx`SELECT * FROM documents WHERE id='page' AND workspace=${p.workspace} FOR UPDATE`;
      if (!d) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      await this.authorize(tx, p, 'pages.edit', d.space);
      if (d.mode !== 'open') fail('DOCUMENT_BUSY');
      await tx`INSERT INTO permits(page,session,actor,epoch,expires_at) VALUES('page',${session},${p.actor},${d.edit_epoch},clock_timestamp()+interval '30 seconds')`;
      return d.edit_epoch;
    });
  }
  async register(
    p: Principal,
    key: string,
    payload: string,
    tool: 'edit_page' | 'create_page' = 'edit_page',
  ) {
    return this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(
        tx,
        p,
        tool === 'create_page' ? 'pages.create' : 'pages.edit',
      );
      const id = randomUUID();
      await tx`INSERT INTO operations(id,workspace,actor,client,grant_id,tool,key,hash,page)
        VALUES(${id},${p.workspace},${p.actor},${p.client},${p.grant},${tool},${key},${hash(payload)},${tool === 'create_page' ? null : 'page'}) ON CONFLICT DO NOTHING`;
      const [op] =
        await tx`SELECT * FROM operations WHERE workspace=${p.workspace} AND actor=${p.actor} AND client=${p.client} AND grant_id=${p.grant} AND tool=${tool} AND key=${key}`;
      if (op.hash !== hash(payload)) fail('IDEMPOTENCY_KEY_REUSED');
      return op;
    });
  }
  async create(
    p: Principal,
    id: string,
    ydoc: Uint8Array,
    failMetadata = false,
  ) {
    return this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(tx, p, 'pages.create');
      const [parent] =
        await tx`SELECT * FROM documents WHERE id='page' AND workspace=${p.workspace} FOR UPDATE`;
      if (!parent) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      await this.authorize(tx, p, 'pages.create', parent.space);
      const [meta] = await tx`SELECT * FROM node_metadata WHERE page='page'`;
      if (meta?.node_type !== 'folder') fail('INVALID_ARGUMENT');
      const [op] =
        await tx`SELECT * FROM operations WHERE id=${id} AND grant_id=${p.grant} AND tool='create_page' FOR UPDATE`;
      if (!op) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      if (op.status === 'committed') return op.result;
      if (op.status !== 'pending') fail('OPERATION_PENDING');
      // Reuse the preallocated operation UUID as the fixture target UUID.
      await tx`INSERT INTO documents(id,workspace,space,generation,ydoc) VALUES(${id},${p.workspace},${parent.space},${randomUUID()},${Buffer.from(ydoc)})`;
      await tx`INSERT INTO node_metadata(page,parent,node_type) VALUES(${id},'page',${failMetadata ? 'invalid' : 'file'})`;
      await tx`INSERT INTO history(operation,side,ydoc,revision) VALUES(${id},'after',${Buffer.from(ydoc)},1)`;
      const result = {
        status: 'committed',
        operation_id: id,
        page_id: id,
        revision: '1',
      };
      await tx`UPDATE operations SET page=${id},status='committed',result=${tx.json(result)} WHERE id=${id}`;
      await tx`INSERT INTO outbox(operation,kind) VALUES(${id},'created')`;
      return result;
    });
  }
  async claim(p: Principal, id: string) {
    return this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(tx, p);
      const [d] =
        await tx`SELECT *,owner_until>clock_timestamp() AS owner_valid FROM documents WHERE id='page' AND workspace=${p.workspace} FOR UPDATE`;
      if (!d) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      await this.authorize(tx, p, 'pages.edit', d.space);
      const [op] =
        await tx`SELECT * FROM operations WHERE id=${id} AND grant_id=${p.grant} AND actor=${p.actor} AND client=${p.client} FOR UPDATE`;
      if (!op) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      if (op.status !== 'pending') fail('OPERATION_PENDING');
      const permits =
        await tx`SELECT 1 FROM permits WHERE page='page' AND expires_at>clock_timestamp()`;
      if (d.mode !== 'open' || permits.length) fail('DOCUMENT_BUSY');
      if (!d.owner_valid) fail('OWNER_EXPIRED');
      const [claimed] =
        await tx`UPDATE documents SET mode='agent',fence=fence+1,edit_epoch=edit_epoch+1,operation_id=${id},agent_until=clock_timestamp()+interval '30 seconds' WHERE id='page' RETURNING *`;
      const [running] =
        await tx`UPDATE operations SET status='running',attempt=attempt+1 WHERE id=${id} RETURNING *`;
      return { ...claimed, attempt: running.attempt };
    });
  }
  async commit(
    p: Principal,
    id: string,
    lease: any,
    ydoc: Uint8Array,
    hooks: { beforeCommit?: () => Promise<void>; failAfterSave?: boolean } = {},
  ) {
    return this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(tx, p);
      const [d] =
        await tx`SELECT *,owner_until>clock_timestamp() AS owner_valid,agent_until>clock_timestamp() AS lease_valid FROM documents WHERE id='page' AND workspace=${p.workspace} FOR UPDATE`;
      if (!d) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      await this.authorize(tx, p, 'pages.edit', d.space);
      const [op] =
        await tx`SELECT * FROM operations WHERE id=${id} AND grant_id=${p.grant} AND actor=${p.actor} AND client=${p.client} FOR UPDATE`;
      if (!op) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      if (op.status === 'committed') return op.result;
      if (
        d.mode !== 'agent' ||
        d.operation_id !== id ||
        d.fence !== lease.fence ||
        d.owner_epoch !== lease.owner_epoch ||
        !d.owner_valid ||
        !d.lease_valid ||
        op.attempt !== lease.attempt ||
        op.status !== 'running'
      )
        fail('STALE_EXECUTOR');
      if (d.revision !== lease.revision || d.generation !== lease.generation)
        fail('REVISION_CONFLICT');
      const revision = (BigInt(d.revision) + 1n).toString();
      await tx`INSERT INTO history(operation,side,ydoc,revision) VALUES(${id},'before',${d.ydoc},${d.revision})`;
      await tx`UPDATE documents SET ydoc=${Buffer.from(ydoc)},revision=${revision} WHERE id='page'`;
      if (hooks.failAfterSave) fail('INJECTED_STORAGE_FAILURE');
      await tx`INSERT INTO history(operation,side,ydoc,revision) VALUES(${id},'after',${Buffer.from(ydoc)},${revision})`;
      const result = { status: 'committed', operation_id: id, revision };
      await tx`UPDATE operations SET status='committed',result=${tx.json(result)} WHERE id=${id}`;
      await tx`INSERT INTO outbox(operation,kind) VALUES(${id},'sync')`;
      await hooks.beforeCommit?.();
      return result;
    });
  }
  async recover(id: string) {
    return this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      // Same gate -> operation order as submit; obtaining these locks excludes a late old COMMIT.
      const [d] =
        await tx`SELECT *,agent_until<clock_timestamp() AS expired FROM documents WHERE id='page' FOR UPDATE`;
      const [op] = await tx`SELECT * FROM operations WHERE id=${id} FOR UPDATE`;
      if (op.status === 'committed') return op.result;
      if (!d.expired || d.operation_id !== id) fail('RECOVERY_NOT_READY');
      await tx`UPDATE documents SET mode='recovering',fence=fence+1 WHERE id='page'`;
      await tx`UPDATE operations SET status='recovering',attempt=attempt+1 WHERE id=${id}`;
      return { status: 'recovering' };
    });
  }
  async resume(p: Principal, id: string) {
    return this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(tx, p);
      const [d] =
        await tx`SELECT * FROM documents WHERE id='page' AND workspace=${p.workspace} FOR UPDATE`;
      if (!d) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      await this.authorize(tx, p, 'pages.edit', d.space);
      const [op] =
        await tx`SELECT * FROM operations WHERE id=${id} AND grant_id=${p.grant} FOR UPDATE`;
      if (
        !op ||
        op.status !== 'recovering' ||
        d.mode !== 'recovering' ||
        d.operation_id !== id
      )
        fail('RECOVERY_NOT_READY');
      const [lease] =
        await tx`UPDATE documents SET mode='agent',fence=fence+1,owner_epoch=owner_epoch+1,owner_until=clock_timestamp()+interval '15 seconds',agent_until=clock_timestamp()+interval '30 seconds' WHERE id='page' RETURNING *`;
      const [running] =
        await tx`UPDATE operations SET status='running',attempt=attempt+1 WHERE id=${id} RETURNING *`;
      return { ...lease, attempt: running.attempt };
    });
  }
  async finishSync(id: string) {
    await this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      await tx`SELECT id FROM documents WHERE id='page' FOR UPDATE`;
      const [op] = await tx`SELECT * FROM operations WHERE id=${id} FOR UPDATE`;
      if (op?.status !== 'committed') fail('NOT_COMMITTED');
      await tx`UPDATE documents SET mode='open',operation_id=NULL,agent_until=NULL WHERE id='page' AND operation_id=${id}`;
    });
  }
  async ingest(
    p: Principal,
    session: string,
    epoch: string,
    updateId: string,
    update: Uint8Array,
  ) {
    return this.sql.begin(async (transaction) => {
      // postgres 3.4.8 TransactionSql omits the callable signature; runtime remains the same transaction.
      const tx = transaction as unknown as postgres.Sql;
      await this.authorize(tx, p);
      const [d] =
        await tx`SELECT *,owner_until>clock_timestamp() AS owner_valid FROM documents WHERE id='page' AND workspace=${p.workspace} FOR UPDATE`;
      if (!d) fail('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
      await this.authorize(tx, p, 'pages.edit', d.space);
      const [permit] =
        await tx`SELECT * FROM permits WHERE page='page' AND session=${session} AND actor=${p.actor} AND expires_at>clock_timestamp()`;
      if (
        d.mode !== 'open' ||
        !d.owner_valid ||
        !permit ||
        permit.epoch !== epoch ||
        d.edit_epoch !== epoch
      )
        fail('PERMIT_EXPIRED');
      const [duplicate] =
        await tx`SELECT * FROM journal WHERE page='page' AND session=${session} AND update_id=${updateId}`;
      if (duplicate) {
        if (duplicate.hash !== hash(update)) fail('UPDATE_ID_REUSED');
        return duplicate.revision;
      }
      const clone = new Y.Doc();
      try {
        Y.applyUpdate(clone, d.ydoc);
        Y.applyUpdate(clone, update);
        const snapshot = Buffer.from(Y.encodeStateAsUpdate(clone));
        const revision = snapshot.equals(d.ydoc)
          ? d.revision
          : (BigInt(d.revision) + 1n).toString();
        await tx`INSERT INTO journal(page,session,update_id,hash,revision,ydoc) VALUES('page',${session},${updateId},${hash(update)},${revision},${Buffer.from(update)})`;
        await tx`UPDATE documents SET ydoc=${snapshot},revision=${revision} WHERE id='page'`;
        return revision;
      } finally {
        clone.destroy();
      }
    });
  }
  async revoke() {
    await this.sql`UPDATE grants SET active=false WHERE id='grant'`;
  }
}
