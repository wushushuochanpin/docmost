import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const run = promisify(execFile);
export async function operationsProbe(
  pg: any,
  databaseUrl: string,
  workspace: string,
  user: string,
  page: string,
  tab?: any,
  origin?: string,
) {
  const invoke = async (
    workspaceId: string,
    operation?: string,
    url = databaseUrl,
  ) => {
    try {
      const result = await run(
        process.execPath,
        [
          resolve(__dirname, '../../../../scripts/mcp/diagnose.mjs'),
          '--workspace',
          workspaceId,
          ...(operation ? ['--operation', operation] : []),
        ],
        {
          env: { ...process.env, MCP_DIAGNOSTIC_DATABASE_URL: url },
          timeout: 10000,
        },
      );
      return { code: 0, output: result.stdout };
    } catch (error: any) {
      return { code: error.code, output: error.stdout || error.stderr };
    }
  };
  if (tab && origin) {
    await tab.goto(origin + '/home');
    const response = await tab.evaluate(async () => {
      const r = await fetch('/api/agent-observability');
      return {
        status: r.status,
        cache: r.headers.get('Cache-Control'),
        body: await r.json(),
      };
    });
    expect(response.status).toBe(200);
    expect(response.cache).toBe('no-store');
    const metrics = response.body.data;
    expect(metrics.counters['oauth_token:attempt']).toBeGreaterThan(0);
    expect(metrics.counters['mcp_tool:attempt']).toBeGreaterThan(0);
    expect(metrics.latency.document_transaction.count).toBeGreaterThan(0);
    expect(JSON.stringify(metrics)).not.toMatch(
      /access_token|refresh_token|versionToken|page_id/,
    );
    expect((await fetch(origin + '/api/agent-observability')).status).toBe(401);
    await pg`UPDATE users SET role='member' WHERE id=${user}`;
    try {
      expect(
        await tab.evaluate(
          async () => (await fetch('/api/agent-observability')).status,
        ),
      ).toBe(403);
    } finally {
      await pg`UPDATE users SET role='owner' WHERE id=${user}`;
    }
    writeFileSync(
      resolve(
        __dirname,
        '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p2-metrics-probe.json',
      ),
      JSON.stringify(
        {
          status: 'passed',
          metrics,
          checks: [
            'real OAuth and MCP instrumentation',
            'DB transaction histogram',
            'event-loop sampling',
            'instance allowlist and admin guard',
            'anonymous 401',
            'member 403',
            'no-store',
            'no content or credentials',
          ],
        },
        null,
        2,
      ) + '\n',
    );
  }
  const clean = await invoke(workspace);
  expect(clean.code).toBe(0);
  const grant = (
    await pg`SELECT id,client_id FROM document_agent_grants WHERE workspace_id=${workspace} LIMIT 1`
  )[0];
  const pending = randomUUID(),
    broken = randomUUID(),
    marker = 'SECRET_CONTENT_MUST_NOT_APPEAR';
  await pg`INSERT INTO document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status,created_at) VALUES(${pending},${workspace},${user},${grant.client_id},${grant.id},${page},'edit_page',${pending},${marker},'pending',clock_timestamp()-interval '90 seconds')`;
  await pg`INSERT INTO document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status,result,created_at,committed_at) VALUES(${broken},${workspace},${user},${grant.client_id},${grant.id},${page},'edit_page',${broken},${marker},'committed',null,clock_timestamp(),clock_timestamp())`;
  await pg`INSERT INTO document_outbox(operation_id,workspace_id,page_id,kind,payload,created_at) VALUES(${pending},${workspace},${page},'probe',${pg.json({ secret: marker })},clock_timestamp()-interval '6 minutes')`;
  try {
    const warning = await invoke(workspace, pending);
    expect(warning.code).toBe(2);
    expect(warning.output).not.toContain(marker);
    const parsed = JSON.parse(warning.output);
    expect(parsed.read_only).toBe(true);
    expect(parsed.alerts.map((a: any) => a.code)).toEqual(
      expect.arrayContaining([
        'PENDING_OVER_60S',
        'COMMITTED_INTEGRITY_FAILURE',
        'OUTBOX_OVER_5M',
      ]),
    );
    expect(
      (await pg`SELECT status FROM document_operations WHERE id=${pending}`)[0]
        .status,
    ).toBe('pending');
    await pg`UPDATE document_operations SET created_at=clock_timestamp()-interval '6 minutes' WHERE id=${pending}`;
    await pg`UPDATE document_gates SET mode='recovering',operation_id=${pending},agent_until=clock_timestamp()+interval '10 minutes' WHERE page_id=${page}`;
    await pg`UPDATE document_gates SET recovering_since=clock_timestamp()-interval '6 minutes' WHERE page_id=${page}`;
    const recovery = await invoke(workspace, pending);
    expect(recovery.code).toBe(2);
    expect(
      JSON.parse(recovery.output).alerts.map((a: any) => a.code),
    ).toContain('RECOVERING_OVER_5M');
    expect((await invoke(randomUUID(), pending)).code).toBe(1);
    const unsafe = new URL(databaseUrl);
    unsafe.username = 'p0';
    expect(
      (await invoke(workspace, undefined, unsafe.toString())).output,
    ).toContain('UNSAFE_ROLE');
    writeFileSync(
      resolve(
        __dirname,
        '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p2-operations-probe.json',
      ),
      JSON.stringify(
        {
          executed_at: new Date().toISOString(),
          status: 'passed',
          checks: [
            'healthy exit 0',
            'alert exit 2',
            '90-second pending alert',
            'missing committed result critical',
            'six-minute outbox alert',
            'actual recovering state older than five minutes alert',
            'operation diagnostic',
            'no body/token/hash output',
            'no mutation',
            'foreign workspace operation refused',
            'superuser refused',
          ],
          alerts: parsed.alerts,
          deployment: 'none',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await pg`UPDATE document_gates SET mode='open',operation_id=null,agent_until=null WHERE page_id=${page} AND operation_id=${pending}`;
    await pg`DELETE FROM document_outbox WHERE operation_id=${pending}`;
    await pg`DELETE FROM document_operations WHERE id IN (${pending},${broken})`;
  }
}
