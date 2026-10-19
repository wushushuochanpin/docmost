import { AgentMaintenanceService } from '../../src/core/agent-operations/agent-maintenance.service';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { PagePermissionRepo } from '../../src/database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { db } from './store';
import { KyselyDB } from '../../src/database/types/kysely.types';
import { up as boundary } from '../../src/database/migrations/20261018T180000-document-command-boundary';
import { up as oauth } from '../../src/database/migrations/20261019T000100-agent-oauth';
import { up as history } from '../../src/database/migrations/20261019T020000-agent-history-source';
import { up as management } from '../../src/database/migrations/20261019T120000-agent-management-quotas';
import { up as retention } from '../../src/database/migrations/20261019T150000-agent-retention-observability';
import {
  retainWorkspace,
  retainUnboundRequests,
  retentionPolicy,
} from '../../src/core/agent-operations/agent-retention';
import { AgentTelemetry } from '../../src/core/agent-operations/agent-telemetry';
const pg = db('p0_retention');
const admin = new Kysely<any>({
  dialect: new PostgresJSDialect({ postgres: pg }),
  plugins: [new CamelCasePlugin()],
});
let database: KyselyDB;
let workspace: string,
  user: string,
  space: string,
  page: string,
  grant: string,
  client: string;
const policy = {
  resultDays: 30,
  auditDays: 180,
  historyDays: 180,
  backupDays: 7,
  batch: 200,
  held: false,
};
async function operation(status = 'committed', age = 200, ws = workspace) {
  const id = randomUUID();
  await pg`INSERT INTO document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status,result,created_at,committed_at) VALUES(${id},${ws},${user},${client},${grant},${page},'edit_page',${id},'stable-hash',${status},${pg.json({ changed: false, operationId: id, status })},clock_timestamp()-${age}*interval '1 day',${status === 'committed' ? new Date(Date.now() - age * 86400000) : null})`;
  return id;
}
beforeAll(async () => {
  await pg`CREATE SCHEMA p0_retention`;
  await pg.unsafe(readFileSync(join(__dirname, 'business-schema.sql'), 'utf8'));
  for (const migrate of [boundary, oauth, history, management, retention])
    await migrate(admin);
  await pg`CREATE TABLE sc_audit_retention(workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, retention_days bigint NOT NULL)`;
  await pg`CREATE ROLE p2_retention LOGIN NOSUPERUSER NOBYPASSRLS`;
  await pg`GRANT USAGE ON SCHEMA p0_retention TO p2_retention`;
  await pg`GRANT ALL ON ALL TABLES IN SCHEMA p0_retention TO p2_retention`;
  const url = new URL(process.env.P0_DATABASE_URL!);
  url.username = 'p2_retention';
  const connection = postgres(url.toString(), {
    max: 3,
    connection: { search_path: 'p0_retention' },
    onnotice: () => {},
  });
  database = new Kysely({
    dialect: new PostgresJSDialect({ postgres: connection }),
    plugins: [new CamelCasePlugin()],
  }) as KyselyDB;
});
beforeEach(async () => {
  await pg`TRUNCATE workspaces,agent_oauth_clients CASCADE`;
  workspace = randomUUID();
  user = randomUUID();
  space = randomUUID();
  page = randomUUID();
  grant = randomUUID();
  client = randomUUID();
  await pg`INSERT INTO workspaces VALUES(${workspace})`;
  await pg`INSERT INTO users(id,workspace_id) VALUES(${user},${workspace})`;
  await pg`INSERT INTO spaces VALUES(${space},${workspace})`;
  await pg`INSERT INTO pages(id,workspace_id,space_id,ydoc,title) VALUES(${page},${workspace},${space},${Buffer.from([0, 0])},'preserved')`;
  await pg`INSERT INTO document_gates(page_id,workspace_id,checkpoint_revision) VALUES(${page},${workspace},5)`;
  await pg`INSERT INTO agent_oauth_clients(id,name,type,redirect_uris,scopes,origins) VALUES(${client},'test','public',ARRAY['http://127.0.0.1:1/callback'],ARRAY['knowledge.read','pages.edit'],ARRAY[]::text[])`;
  await pg`INSERT INTO document_agent_grants(id,workspace_id,user_id,client_id,space_ids,scopes,expires_at) VALUES(${grant},${workspace},${user},${client},ARRAY[${space}]::uuid[],ARRAY['knowledge.read','pages.edit'],clock_timestamp()+interval '1 year')`;
});
afterAll(async () => {
  await database?.destroy();
  await admin.destroy();
});
test('terminal retention preserves tombstones, pending/gate/outbox/reservations, foreign tenant, and legal hold', async () => {
  const expired = await operation(),
    fresh = await operation('committed', 29),
    pending = await operation('pending'),
    active = await operation(),
    waiting = await operation(),
    reserved = await operation();
  await pg`UPDATE document_gates SET mode='agent',operation_id=${active} WHERE page_id=${page}`;
  await pg`INSERT INTO document_outbox(workspace_id,page_id,operation_id,kind) VALUES(${workspace},${page},${waiting},'sync')`;
  const bucket = randomUUID();
  await pg`INSERT INTO agent_quota_buckets(id,workspace_id,subject,kind,bucket_start,bucket_end,reserved) VALUES(${bucket},${workspace},'x','edit',clock_timestamp()-interval '201 days',clock_timestamp()-interval '200 days',1)`;
  await pg`INSERT INTO agent_quota_reservations(workspace_id,operation_id,bucket_id) VALUES(${workspace},${reserved},${bucket})`;
  const foreign = randomUUID();
  await pg`INSERT INTO workspaces VALUES(${foreign})`;
  const other = await operation('committed', 200, foreign);
  expect(
    await retainWorkspace(database, workspace, { ...policy, held: true }),
  ).toEqual({ skipped: 'hold' });
  expect(
    (await pg`SELECT result FROM document_operations WHERE id=${expired}`)[0]
      .result,
  ).not.toBeNull();
  const result = await retainWorkspace(database, workspace, policy);
  expect('counts' in result && result.counts.results).toBe(1);
  const rows = await pg`SELECT * FROM document_operations`;
  expect(rows.find((r) => r.id === expired).result_expired_at).not.toBeNull();
  expect(rows.find((r) => r.id === expired).request_hash).toBe('stable-hash');
  for (const id of [fresh, pending, active, waiting, reserved, other])
    expect(rows.find((r) => r.id === id).result).not.toBeNull();
  expect(await pg`SELECT * FROM document_operations`).toHaveLength(7);
  expect(
    ((await retainWorkspace(database, workspace, policy)) as any).counts
      .results,
  ).toBe(0);
  expect(await pg`SELECT * FROM agent_maintenance_runs`).toHaveLength(1);
});
test('history-linked and unresolved snapshots survive; delivered payload and old management audit are bounded', async () => {
  const committed = await operation(),
    pending = await operation('running'),
    historyId = randomUUID();
  await pg`INSERT INTO page_history(id,page_id,workspace_id) VALUES(${historyId},${page},${workspace})`;
  for (const [op, side, link] of [
    [committed, 'before', historyId],
    [committed, 'after', null],
    [pending, 'after', null],
  ] as const)
    await pg`INSERT INTO document_recovery_snapshots(operation_id,workspace_id,page_id,side,history_id,ydoc,revision,created_at) VALUES(${op},${workspace},${page},${side},${link},${Buffer.from([0, 0])},1,clock_timestamp()-interval '200 days')`;
  await pg`INSERT INTO document_outbox(workspace_id,page_id,operation_id,kind,payload,delivered_at) VALUES(${workspace},${page},${committed},'sync',${pg.json({ private: 'body' })},clock_timestamp()-interval '8 days')`;
  for (let i = 0; i < 3; i++)
    await pg`INSERT INTO agent_management_audit(workspace_id,user_id,action,created_at) VALUES(${workspace},${user},'policy',clock_timestamp()-interval '366 days')`;
  const result = await retainWorkspace(database, workspace, {
    ...policy,
    batch: 2,
  });
  expect((result as any).counts.audit).toBe(2);
  expect(await pg`SELECT * FROM document_recovery_snapshots`).toHaveLength(2);
  expect((await pg`SELECT payload FROM document_outbox`)[0].payload).toEqual(
    {},
  );
  await retainWorkspace(database, workspace, policy);
  expect(await pg`SELECT * FROM agent_management_audit`).toHaveLength(0);
});
test('journal needs verified checkpoint, backup age, ended session +24h and no live permit', async () => {
  const expired = randomUUID(),
    active = randomUUID(),
    recent = randomUUID();
  for (const [id, expiry] of [
    [expired, -2],
    [active, 2],
    [recent, -0.5],
  ] as const)
    await pg`INSERT INTO user_sessions VALUES(${id},${user},${workspace},null,clock_timestamp()+${expiry}*interval '1 day')`;
  for (const [id, session, revision, age] of [
    ['eligible', expired, 4, 8],
    ['active', active, 4, 8],
    ['recent', recent, 4, 8],
    ['tail', expired, 6, 8],
    ['backup', expired, 4, 1],
  ] as const)
    await pg`INSERT INTO document_updates(workspace_id,page_id,update_id,session_id,update_hash,update_bytes,revision,user_id,created_at) VALUES(${workspace},${page},${id},${session},'hash',${Buffer.from([1, 2])},${revision},${user},clock_timestamp()-${age}*interval '1 day')`;
  await pg`INSERT INTO document_human_permits(id,workspace_id,page_id,user_id,session_id,edit_epoch,owner_epoch,expires_at) VALUES(${randomUUID()},${workspace},${page},${user},${active},1,1,clock_timestamp()+interval '1 minute')`;
  await retainWorkspace(database, workspace, policy);
  expect(await pg`SELECT * FROM document_updates`).toHaveLength(5);
  await pg`DELETE FROM document_human_permits`;
  const before = (await pg`SELECT ydoc FROM pages WHERE id=${page}`)[0].ydoc;
  await retainWorkspace(database, workspace, policy);
  expect(
    (await pg`SELECT update_id FROM document_updates ORDER BY update_id`).map(
      (r) => r.update_id,
    ),
  ).toEqual(['active', 'backup', 'recent', 'tail']);
  expect((await pg`SELECT ydoc FROM pages WHERE id=${page}`)[0].ydoc).toEqual(
    before,
  );
});
test('refresh replay records survive any live token or live grant; expired OAuth cleanup and unbound requests', async () => {
  const family = randomUUID();
  await pg`INSERT INTO agent_oauth_families(id,workspace_id,client_id,grant_id) VALUES(${family},${workspace},${client},${grant})`;
  for (const [hash, days] of [
    ['consumed', -10],
    ['current', 2],
  ] as const)
    await pg`INSERT INTO agent_oauth_tokens(access_hash,refresh_hash,family_id,metadata,access_expires_at,refresh_expires_at,consumed) VALUES(${hash},${hash + 'r'},${family},'{}',clock_timestamp()+${days}*interval '1 day',clock_timestamp()+${days}*interval '1 day',${hash === 'consumed'})`;
  await pg`INSERT INTO agent_oauth_codes(hash,client_id,workspace_id,grant_id,metadata,expires_at) VALUES('old',${client},${workspace},${grant},'{}',clock_timestamp()-interval '25 hours'),('recent',${client},${workspace},${grant},'{}',clock_timestamp()-interval '23 hours')`;
  await pg`INSERT INTO agent_oauth_requests(id,client_id,client_version,parameters,expires_at) VALUES(${randomUUID()},${client},1,'{}',clock_timestamp()-interval '25 hours')`;
  await retainWorkspace(database, workspace, policy);
  expect(await pg`SELECT * FROM agent_oauth_tokens`).toHaveLength(2);
  expect(await pg`SELECT * FROM agent_oauth_codes`).toHaveLength(1);
  await pg`UPDATE document_agent_grants SET expires_at=clock_timestamp()-interval '2 days' WHERE id=${grant}`;
  await retainWorkspace(database, workspace, policy);
  expect(await pg`SELECT * FROM agent_oauth_tokens`).toHaveLength(2);
  await pg`UPDATE agent_oauth_tokens SET access_expires_at=clock_timestamp()-interval '2 days',refresh_expires_at=clock_timestamp()-interval '2 days'`;
  await retainWorkspace(database, workspace, policy);
  expect(await pg`SELECT * FROM agent_oauth_tokens`).toHaveLength(0);
  expect(await pg`SELECT * FROM agent_oauth_families`).toHaveLength(0);
  expect(await retainUnboundRequests(database)).toBe(1);
  expect(await retainUnboundRequests(database)).toBe(0);
});
test('authority contention skips the batch and concurrent workers cannot prune twice', async () => {
  await operation();
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    ready = new Promise<void>((r) => (entered = r));
  const holding = admin.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock_shared(20261018,1)`.execute(tx);
    entered();
    await wait;
  });
  await ready;
  try {
    expect(await retainWorkspace(database, workspace, policy)).toEqual({
      skipped: 'busy',
    });
  } finally {
    release();
    await holding;
  }
  const results = await Promise.all([
    retainWorkspace(database, workspace, policy),
    retainWorkspace(database, workspace, policy),
  ]);
  expect(
    results.reduce((sum, r) => sum + ('counts' in r ? r.counts.results : 0), 0),
  ).toBe(1);
  expect(await pg`SELECT * FROM agent_maintenance_runs`).toHaveLength(1);
});
test('retention validation fails closed; bounded metrics never retain secret error values', async () => {
  const prior = process.env.AGENT_RETENTION_RESULT_DAYS;
  process.env.AGENT_RETENTION_RESULT_DAYS = '29';
  try {
    expect(() => retentionPolicy(workspace)).toThrow(
      'INVALID_RETENTION_POLICY',
    );
  } finally {
    if (prior === undefined) delete process.env.AGENT_RETENTION_RESULT_DAYS;
    else process.env.AGENT_RETENTION_RESULT_DAYS = prior;
  }
  const metrics = new AgentTelemetry();
  await metrics.measure('mcp_tool', async () => 1);
  for (const message of [
    'DOCUMENT_BUSY',
    'REVISION_CONFLICT',
    'RATE_LIMITED',
    'DOCUMENT_FENCE_EXPIRED',
    'secret-token-and-body',
  ])
    await expect(
      metrics.measure('mcp_tool', async () => {
        throw Error(message);
      }),
    ).rejects.toThrow();
  metrics.increment('refresh_replay');
  const snapshot = metrics.snapshot();
  expect(snapshot.counters['mcp_tool:attempt']).toBe(6);
  expect(snapshot.counters['mcp_tool:error:INTERNAL_ERROR']).toBe(1);
  expect(JSON.stringify(snapshot)).not.toContain('secret-token-and-body');
  expect(snapshot.latency.mcp_tool.buckets.reduce((a, b) => a + b, 0)).toBe(6);
});

test('expired creation result cannot invoke the creation callback again', async () => {
  process.env.DOCUMENT_COMMAND_ENABLED = 'true';
  process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString(
    'base64',
  );
  const cache = {
    get: () => {
      throw Error('No cached authorization');
    },
  } as any;
  const commands = new DocumentCommandService(
    database,
    new PagePermissionRepo(database, null as any, cache),
    new SpaceMemberRepo(database, null as any, null as any, cache),
  );
  await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${user},'admin')`;
  await pg`UPDATE document_agent_grants SET scopes=ARRAY['knowledge.read','folders.create'] WHERE id=${grant}`;
  await pg`UPDATE agent_oauth_clients SET scopes=ARRAY['knowledge.read','folders.create'] WHERE id=${client}`;
  await pg`INSERT INTO agent_policies(workspace_id,enabled) VALUES(${workspace},true)`;
  const a = {
    workspaceId: workspace,
    userId: user,
    spaceId: space,
  };
  const request = {
    principal: {
      workspaceId: workspace,
      userId: user,
      grantId: grant,
      clientId: client,
    },
    key: 'retention-create',
    tool: 'create_folder' as const,
    payload: { title: 'one' },
  };
  const id = randomUUID();
  const create = jest.fn(async (trx: any) => {
    await sql`insert into pages(id,workspace_id,space_id,title,ydoc,content) values(${id}::uuid,${workspace}::uuid,${space}::uuid,'one',${Buffer.from([0, 0])},'{}'::jsonb)`.execute(
      trx,
    );
    return (
      await sql<any>`select * from pages where id=${id}::uuid`.execute(trx)
    ).rows[0];
  });
  await commands.createTransaction(a, create, request);
  await pg`UPDATE document_operations SET result=null,result_expired_at=clock_timestamp() WHERE page_id=${id}`;
  await expect(commands.createTransaction(a, create, request)).rejects.toThrow(
    'OPERATION_RESULT_EXPIRED',
  );
  expect(create).toHaveBeenCalledTimes(1);
  await pg`DELETE FROM space_members WHERE user_id=${user}`;
  await expect(commands.createTransaction(a, create, request)).rejects.toThrow(
    'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
  );
  expect(create).toHaveBeenCalledTimes(1);
});

test('existing audit policy can extend retention and malformed holds fail closed', async () => {
  await pg`INSERT INTO sc_audit_retention VALUES(${workspace},730)`;
  await pg`INSERT INTO agent_management_audit(workspace_id,user_id,action,created_at) VALUES(${workspace},${user},'policy',clock_timestamp()-interval '500 days')`;
  await retainWorkspace(database, workspace, policy);
  expect(await pg`SELECT * FROM agent_management_audit`).toHaveLength(1);
  const original = process.env.AGENT_RETENTION_HOLD_WORKSPACES;
  try {
    process.env.AGENT_RETENTION_HOLD_WORKSPACES = ` ${workspace.toUpperCase()} , `;
    expect(retentionPolicy(workspace).held).toBe(true);
    process.env.AGENT_RETENTION_HOLD_WORKSPACES = 'invalid';
    expect(() => retentionPolicy(workspace)).toThrow('INVALID_RETENTION_HOLD');
  } finally {
    if (original === undefined)
      delete process.env.AGENT_RETENTION_HOLD_WORKSPACES;
    else process.env.AGENT_RETENTION_HOLD_WORKSPACES = original;
  }
});

test('cleanup failure rolls back result expiry and maintenance evidence together', async () => {
  const id = await operation();
  await pg`CREATE FUNCTION reject_maintenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$`;
  await pg`CREATE TRIGGER reject_maintenance BEFORE INSERT ON agent_maintenance_runs FOR EACH ROW EXECUTE FUNCTION reject_maintenance()`;
  try {
    await expect(retainWorkspace(database, workspace, policy)).rejects.toThrow(
      'injected',
    );
    expect(
      (
        await pg`SELECT result_expired_at FROM document_operations WHERE id=${id}`
      )[0].result_expired_at,
    ).toBeNull();
    expect(await pg`SELECT * FROM agent_maintenance_runs`).toHaveLength(0);
  } finally {
    await pg`DROP TRIGGER reject_maintenance ON agent_maintenance_runs`;
    await pg`DROP FUNCTION reject_maintenance()`;
  }
});

test('maintenance is disabled by default and does not touch the database', async () => {
  const original = process.env.AGENT_RETENTION_ENABLED;
  delete process.env.AGENT_RETENTION_ENABLED;
  const database = new Proxy(
    {},
    {
      get() {
        throw Error('unexpected database access');
      },
    },
  );
  try {
    await new AgentMaintenanceService(database as KyselyDB).tick();
  } finally {
    if (original !== undefined) process.env.AGENT_RETENTION_ENABLED = original;
  }
});

test('committed result with missing recovery evidence is not concealed as normal expiry', async () => {
  const id = await operation();
  await pg`UPDATE document_operations SET result='{"changed":true}'::jsonb WHERE id=${id}`;
  await retainWorkspace(database, workspace, policy);
  expect(
    (
      await pg`SELECT result_expired_at FROM document_operations WHERE id=${id}`
    )[0].result_expired_at,
  ).toBeNull();
});
