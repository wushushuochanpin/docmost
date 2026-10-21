import { agentTelemetry } from '../../src/core/agent-operations/agent-telemetry';
import { up as retentionMigration } from '../../src/database/migrations/20261019T150000-agent-retention-observability';
import { up as managementMigration } from '../../src/database/migrations/20261019T120000-agent-management-quotas';
import { up as historySourceMigration } from '../../src/database/migrations/20261019T020000-agent-history-source';
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { db } from './store';
import { up as boundary } from '../../src/database/migrations/20261018T180000-document-command-boundary';
import { up as oauthMigration } from '../../src/database/migrations/20261019T000100-agent-oauth';
import { AgentOAuthService } from '../../src/core/agent-oauth/agent-oauth.service';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';
import { KyselyDB } from '../../src/database/types/kysely.types';
const pg = db('p0_oauthbusiness');
const database = new Kysely({
  dialect: new PostgresJSDialect({ postgres: pg }),
  plugins: [new CamelCasePlugin()],
}) as KyselyDB;
const members = new SpaceMemberRepo(
  database,
  null as any,
  null as any,
  {
    get: () => {
      throw Error('cached authorization');
    },
  } as any,
);
const oauth = new AgentOAuthService(database, members);
let actor: { workspaceId: string; userId: string; sessionId: string };
let space: string;
let client: string;
const verifier = 'v'.repeat(43);
const redirect = 'http://127.0.0.1:54321/callback';
const resource = 'http://127.0.0.1:45678/mcp';
const query = () => ({
  client_id: client,
  redirect_uri: redirect,
  response_type: 'code',
  resource,
  scope: 'knowledge.read pages.edit',
  state: 'client-state',
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256',
});
async function approved() {
  const url = await oauth.start(query());
  const id = new URL(url).searchParams.get('request_id')!;
  const consent = await oauth.consent(id, actor);
  const result = await oauth.decide(
    id,
    actor,
    {
      decision: 'allow',
      space_ids: [space],
      scopes: ['knowledge.read', 'pages.edit'],
      duration_days: 1,
    },
    consent.csrf_token,
  );
  return {
    id,
    result,
    consent,
    code: new URL(result.redirect_url).searchParams.get('code')!,
  };
}
const exchange = (code: string) =>
  oauth.token(
    {
      grant_type: 'authorization_code',
      client_id: client,
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
      resource,
    },
    { method: 'none' },
  );
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AGENT_OAUTH_ENABLED = 'true';
  process.env.AGENT_OAUTH_ORIGIN = 'http://127.0.0.1:45678';
  process.env.AGENT_OAUTH_RESPONSE_KEY = Buffer.alloc(32, 4).toString('base64');
  await pg`CREATE SCHEMA p0_oauthbusiness`;
  await pg.unsafe(readFileSync(join(__dirname, 'business-schema.sql'), 'utf8'));
  await pg`ALTER TABLE spaces ADD COLUMN name text DEFAULT 'space', ADD COLUMN slug text DEFAULT 'space'`;
  await pg`ALTER TABLE pages ADD COLUMN position text, ALTER COLUMN id SET DEFAULT gen_random_uuid()`;
  await pg`CREATE TABLE attachments(id uuid PRIMARY KEY,workspace_id uuid,page_id uuid,file_name text,file_path text,file_size bigint,mime_type text,deleted_at timestamptz)`;
  await boundary(database);
  await oauthMigration(database);
  await historySourceMigration(database);
  await managementMigration(database);
  await retentionMigration(database);
});
beforeEach(async () => {
  await pg`TRUNCATE workspaces,agent_oauth_clients,attachments CASCADE`;
  actor = {
    workspaceId: randomUUID(),
    userId: randomUUID(),
    sessionId: randomUUID(),
  };
  space = randomUUID();
  process.env.AGENT_OAUTH_ADMIN_USER_IDS = actor.userId;
  await pg`INSERT INTO workspaces VALUES(${actor.workspaceId})`;
  await pg`INSERT INTO agent_policies(workspace_id,enabled,max_grant_days) VALUES(${actor.workspaceId},true,90)`;
  await pg`INSERT INTO users(id,workspace_id) VALUES(${actor.userId},${actor.workspaceId})`;
  await pg`INSERT INTO spaces(id,workspace_id) VALUES(${space},${actor.workspaceId})`;
  await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${actor.userId},'writer')`;
  await pg`INSERT INTO user_sessions VALUES(${actor.sessionId},${actor.userId},${actor.workspaceId},null,clock_timestamp()+interval '1 day')`;
  client = (
    await oauth.register(actor, {
      name: 'Test Agent',
      type: 'public',
      redirect_uris: ['http://127.0.0.1:1/callback'],
      scopes: [
        'knowledge.read',
        'pages.edit',
        'pages.create',
        'folders.create',
      ],
      origins: [],
    })
  ).client_id;
});
afterAll(async () => {
  for (const name of [
    'AGENT_OAUTH_ENABLED',
    'AGENT_OAUTH_ORIGIN',
    'AGENT_OAUTH_RESPONSE_KEY',
    'AGENT_OAUTH_ADMIN_USER_IDS',
  ])
    delete process.env[name];
  await database.destroy();
});
describe('production OAuth authorization and atomic token lifecycle', () => {
  test('real active session grants selected space and code exchanges once with resource + PKCE', async () => {
    const { code } = await approved();
    const token = await exchange(code);
    expect(token?.access_token).toMatch(/^dma_/);
    const principal = await oauth.authenticate(token!.access_token);
    expect(principal.userId).toBe(actor.userId);
    expect(principal.spaceIds).toEqual([space]);
    await expect(exchange(code)).rejects.toMatchObject({
      response: { error: 'invalid_grant' },
    });
    const stored = JSON.stringify(await pg`SELECT * FROM agent_oauth_tokens`);
    expect(stored).not.toContain(token!.access_token);
    expect(stored).not.toContain(token!.refresh_token);
  });
  test('consent is bound to session, CSRF, space membership and immutable validated redirect', async () => {
    await expect(
      oauth.start({ ...query(), redirect_uri: 'https://attacker.invalid/' }),
    ).rejects.toThrow();
    const url = await oauth.start(query());
    const id = new URL(url).searchParams.get('request_id')!;
    const consent = await oauth.consent(id, actor);
    await expect(
      oauth.decide(
        id,
        actor,
        {
          decision: 'allow',
          space_ids: [space],
          scopes: ['knowledge.read'],
          duration_days: 1,
        },
        'wrong',
      ),
    ).rejects.toThrow('CSRF_REJECTED');
    await expect(
      oauth.consent(id, { ...actor, sessionId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      oauth.decide(
        id,
        actor,
        {
          decision: 'allow',
          space_ids: [randomUUID()],
          scopes: ['knowledge.read'],
          duration_days: 1,
        },
        consent.csrf_token,
      ),
    ).rejects.toThrow();
    expect(await pg`SELECT * FROM document_agent_grants`).toHaveLength(0);
  });
  test('wrong verifier/resource do not consume a valid code; duplicate decision returns encrypted cached redirect', async () => {
    const { id, code, result, consent } = await approved();
    const repeated = await oauth.decide(
      id,
      actor,
      {
        decision: 'allow',
        space_ids: [space],
        scopes: ['knowledge.read', 'pages.edit'],
        duration_days: 1,
      },
      consent.csrf_token,
    );
    expect(repeated).toEqual(result);
    expect(await pg`SELECT * FROM document_agent_grants`).toHaveLength(1);
    await expect(
      oauth.token(
        {
          grant_type: 'authorization_code',
          client_id: client,
          code,
          redirect_uri: redirect,
          code_verifier: 'w'.repeat(43),
          resource,
        },
        { method: 'none' },
      ),
    ).rejects.toThrow();
    await expect(
      oauth.token(
        {
          grant_type: 'authorization_code',
          client_id: client,
          code,
          redirect_uri: redirect,
          code_verifier: verifier,
          resource: 'https://wrong.invalid/mcp',
        },
        { method: 'none' },
      ),
    ).rejects.toThrow();
    await expect(exchange(code)).resolves.toBeDefined();
  });
  test('refresh replay commits family revocation even though the protocol returns an error', async () => {
    const issued = await exchange((await approved()).code);
    const body = {
      grant_type: 'refresh_token',
      client_id: client,
      refresh_token: issued!.refresh_token,
      resource,
    };
    const rotated = await oauth.token(body, { method: 'none' });
    await expect(
      oauth.authenticate(rotated!.access_token),
    ).resolves.toBeDefined();
    await expect(oauth.token(body, { method: 'none' })).rejects.toThrow();
    await expect(oauth.authenticate(rotated!.access_token)).rejects.toThrow();
    await expect(oauth.authenticate(issued!.access_token)).rejects.toThrow();
    const metrics = agentTelemetry.snapshot();
    expect(metrics.counters.refresh_replay).toBeGreaterThan(0);
    expect(metrics.counters['oauth_token:error:invalid_grant']).toBeGreaterThan(
      0,
    );
    expect(JSON.stringify(metrics)).not.toContain(issued!.refresh_token);
  });
  test('denial and expired or revoked sessions cannot create usable grants', async () => {
    const id = new URL(await oauth.start(query())).searchParams.get(
      'request_id',
    )!;
    const consent = await oauth.consent(id, actor);
    const denied = await oauth.decide(
      id,
      actor,
      { decision: 'deny', space_ids: [], scopes: [], duration_days: 1 },
      consent.csrf_token,
    );
    expect(new URL(denied.redirect_url).searchParams.get('error')).toBe(
      'access_denied',
    );
    expect(await pg`SELECT * FROM document_agent_grants`).toHaveLength(0);
    const next = new URL(await oauth.start(query())).searchParams.get(
      'request_id',
    )!;
    await pg`UPDATE user_sessions SET revoked_at=clock_timestamp()`;
    await expect(oauth.consent(next, actor)).rejects.toThrow();
  });
  test('client authentication, hostile Origin, grant revocation and token revoke enforce immediate denial', async () => {
    const issued = await exchange((await approved()).code);
    await expect(
      oauth.authenticate(issued!.access_token, 'https://attacker.invalid'),
    ).rejects.toThrow();
    await oauth.revoke(
      { client_id: client, token: issued!.access_token },
      { method: 'none' },
    );
    await expect(oauth.authenticate(issued!.access_token)).rejects.toThrow();
    const metrics = agentTelemetry.snapshot();
    expect(metrics.counters.refresh_replay).toBeGreaterThan(0);
    expect(metrics.counters['oauth_token:error:invalid_grant']).toBeGreaterThan(
      0,
    );
    expect(JSON.stringify(metrics)).not.toContain(issued!.refresh_token);
    await oauth.revoke(
      { client_id: client, token: 'unknown' },
      { method: 'none' },
    );
  });
});

// Two independent Nest applications, actual HTTP / JWT / OAuth / MCP transport,
// sharing only PostgreSQL. Collaboration routing and process-kill tests remain separate.
describe('OAuth and public MCP across two HTTP nodes', () => {
  test('session consent on A, token exchange on B, durable MCP edit and replay across A/B, then revoke', async () => {
    const { httpNode, sessionSecret } = await import('./oauth-http-node');
    const jwt = await import('jsonwebtoken');
    const Y = await import('yjs');
    process.env.DOCUMENT_COMMAND_ENABLED = 'true';
    process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString(
      'base64',
    );
    const a = await httpNode(database, oauth, members);
    const b = await httpNode(
      database,
      new AgentOAuthService(database, members),
      members,
    );
    const doc = new Y.Doc();
    const page = randomUUID();
    try {
      const node = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'initial');
      node.insert(0, [text]);
      doc.getXmlFragment('default').insert(0, [node]);
      await pg`INSERT INTO pages(id,workspace_id,space_id,title,ydoc) VALUES(${page},${actor.workspaceId},${space},'test',${Buffer.from(Y.encodeStateAsUpdate(doc))})`;
      await a.commands.load({ ...actor, pageId: page }, doc);
      const session = jwt.sign(
        {
          sub: actor.userId,
          workspaceId: actor.workspaceId,
          sessionId: actor.sessionId,
          type: 'access',
        },
        sessionSecret,
        { expiresIn: '5m' },
      );
      const discovery = await fetch(
        a.url + '/.well-known/oauth-protected-resource/mcp',
      );
      expect(((await discovery.json()) as any).resource).toBe(resource);
      const metadata = await fetch(
        b.url + '/.well-known/oauth-authorization-server',
      );
      expect(
        ((await metadata.json()) as any).code_challenge_methods_supported,
      ).toEqual(['S256']);
      const unauthorized = await fetch(a.url + '/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers.get('www-authenticate')).toContain(
        '/.well-known/oauth-protected-resource/mcp',
      );
      const started = await fetch(
        a.url +
          '/oauth/authorize?' +
          new URLSearchParams({
            ...query(),
            scope: 'knowledge.read pages.edit pages.create folders.create',
          }),
        { redirect: 'manual' },
      );
      expect(started.status).toBe(302);
      const id = new URL(started.headers.get('location')!).searchParams.get(
        'request_id',
      )!;
      const consent = await fetch(a.url + '/api/agent-oauth/requests/' + id, {
        headers: { Authorization: 'Bearer ' + session },
      });
      expect(consent.status).toBe(200);
      const details = ((await consent.json()) as any).data;
      const decision = await fetch(
        a.url + '/api/agent-oauth/requests/' + id + '/decision',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + session,
            Origin: process.env.AGENT_OAUTH_ORIGIN!,
            'Content-Type': 'application/json',
            'X-CSRF-Token': details.csrf_token,
          },
          body: JSON.stringify({
            decision: 'allow',
            space_ids: [space],
            scopes: [
              'knowledge.read',
              'pages.edit',
              'pages.create',
              'folders.create',
            ],
            duration_days: 1,
          }),
        },
      );
      expect(decision.status).toBe(200);
      const code = new URL(
        ((await decision.json()) as any).data.redirect_url,
      ).searchParams.get('code')!;
      const tokenReply = await fetch(b.url + '/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: client,
          code,
          redirect_uri: redirect,
          code_verifier: verifier,
          resource,
        }),
      });
      expect(tokenReply.status).toBe(200);
      const tokens = (await tokenReply.json()) as any;
      for (const request of [
        {
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'p0-agent', version: '1' },
          },
        },
        { method: 'tools/list', params: {} },
      ]) {
        const response = await fetch(b.url + '/mcp', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tokens.access_token,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...request }),
        });
        const body = (await response.json()) as any;
        expect(response.status).toBe(200);
        expect(body.error).toBeUndefined();
        if (request.method === 'tools/list') {
          expect(body.result.tools).toHaveLength(12);
          expect(body.result.tools).toMatchSnapshot('P1 complete tool schema');
          expect(body.result.tools.map((tool: any) => tool.name)).toContain(
            'get_operation',
          );
          for (const tool of body.result.tools)
            expect(tool.inputSchema.type).toBe('object');
        }
      }
      const call = async (url: string, name: string, args: object) => {
        const response = await fetch(url + '/mcp', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tokens.access_token,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        });
        return { response, body: (await response.json()) as any };
      };
      const context = await call(b.url, 'get_edit_context', { page_id: page });
      expect(context.response.status).toBe(200);
      expect(context.body.result.isError).not.toBe(true);
      const spacesResult = await call(a.url, 'list_spaces', {});
      expect(
        spacesResult.body.result.structuredContent.items.map((x: any) => x.id),
      ).toEqual([space]);
      const beforePreview = await pg`SELECT ydoc FROM pages WHERE id=${page}`;
      const preview = await call(a.url, 'edit_page', {
        page_id: page,
        version_token: context.body.result.structuredContent.version_token,
        idempotency_key: 'preview-only',
        preview: true,
        ops: [
          {
            type: 'append',
            markdown:
              '## Heading\n\n**bold** and [link](https://example.test)\n\n- list item',
          },
        ],
      });
      expect(preview.body.result.structuredContent.status).toBe('preview');
      expect(await pg`SELECT ydoc FROM pages WHERE id=${page}`).toEqual(
        beforePreview,
      );
      expect(
        (
          await pg`SELECT count(*)::int as n FROM document_operations WHERE idempotency_key='preview-only'`
        )[0].n,
      ).toBe(0);
      const protectedMarkdown = await call(a.url, 'edit_page', {
        page_id: page,
        version_token: context.body.result.structuredContent.version_token,
        idempotency_key: 'bad-preview',
        preview: true,
        ops: [
          { type: 'append', markdown: '![image](https://example.test/a.png)' },
        ],
      });
      expect(protectedMarkdown.body.result.structuredContent.code).toBe(
        'UNSUPPORTED_CONTENT',
      );
      const input = {
        page_id: page,
        version_token: context.body.result.structuredContent.version_token,
        idempotency_key: 'http-multinode-edit',
        ops: [{ type: 'append', markdown: 'saved over HTTP' }],
      };
      const edited = await call(b.url, 'edit_page', input);
      expect(edited.body.result.isError).not.toBe(true);
      expect(edited.body.result.structuredContent.status).toBe('committed');
      const replay = await call(a.url, 'edit_page', input);
      expect(replay.body.result.structuredContent).toEqual(
        edited.body.result.structuredContent,
      );
      const paged = await call(a.url, 'get_edit_context', {
        page_id: page,
        page_size: 1,
      });
      expect(paged.body.result.structuredContent.blocks).toHaveLength(1);
      const cursor = paged.body.result.structuredContent.next_cursor;
      expect(cursor).toBeTruthy();
      const second = await call(b.url, 'get_edit_context', {
        page_id: page,
        page_size: 1,
        cursor,
      });
      expect(second.body.result.isError).not.toBe(true);
      const forged = await call(a.url, 'get_edit_context', {
        page_id: page,
        page_size: 1,
        cursor: cursor + 'x',
      });
      expect(forged.body.result.structuredContent.code).toBe(
        'REVISION_CONFLICT',
      );
      const rename = await call(a.url, 'update_page_metadata', {
        page_id: page,
        title: 'new title',
        version_token: paged.body.result.structuredContent.version_token,
        idempotency_key: 'p1-rename',
      });
      expect(rename.body.result.structuredContent.status).toBe('committed');
      const stale = await call(b.url, 'get_edit_context', {
        page_id: page,
        page_size: 1,
        cursor,
      });
      expect(stale.body.result.structuredContent.code).toBe(
        'REVISION_CONFLICT',
      );
      const lookedUp = await call(a.url, 'get_operation', {
        tool: 'edit_page',
        idempotency_key: input.idempotency_key,
      });
      expect(lookedUp.body.result.structuredContent.operation_id).toBe(
        edited.body.result.structuredContent.operation_id,
      );
      expect(lookedUp.body.result.structuredContent.status).toBe('committed');
      expect(await pg`SELECT * FROM document_operations`).toHaveLength(2);
      const folder = await call(a.url, 'create_folder', {
        space_id: space,
        title: 'Agent folder',
        idempotency_key: 'http-folder',
      });
      expect(folder.body.result.isError).not.toBe(true);
      const folderId = folder.body.result.structuredContent.page_id;
      const raceSpace = randomUUID();
      await pg`INSERT INTO spaces(id,workspace_id) VALUES(${raceSpace},${actor.workspaceId})`;
      for (const race of ['delete', 'move', 'revoke'] as const) {
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>((r) => (entered = r)),
          hold = new Promise<void>((r) => (release = r));
        const mutation = pg.begin(async (transaction) => {
          const tx = transaction as unknown as ReturnType<typeof db>;
          if (race === 'delete')
            await tx`UPDATE pages SET deleted_at=clock_timestamp() WHERE id=${folderId}`;
          else if (race === 'move')
            await tx`UPDATE pages SET space_id=${raceSpace} WHERE id=${folderId}`;
          else
            await tx`DELETE FROM space_members WHERE space_id=${space} AND user_id=${actor.userId}`;
          entered();
          await hold;
        });
        await ready;
        let completed = false;
        const writing = call(b.url, 'create_page', {
          space_id: space,
          parent_id: folderId,
          title: 'race-' + race,
          markdown: 'no orphan',
          idempotency_key: 'parent-race-' + race,
        }).then((value) => {
          completed = true;
          return value;
        });
        try {
          await new Promise((r) => setTimeout(r, 50));
          expect(completed).toBe(false);
        } finally {
          release();
        }
        await mutation;
        const rejected = await writing;
        expect(rejected.body.result.isError).toBe(true);
        expect(
          (await pg`SELECT id FROM pages WHERE title=${'race-' + race}`).length,
        ).toBe(0);
        if (race === 'delete')
          await pg`UPDATE pages SET deleted_at=null WHERE id=${folderId}`;
        else if (race === 'move')
          await pg`UPDATE pages SET space_id=${space} WHERE id=${folderId}`;
        else
          await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${actor.userId},'writer')`;
      }
      const createInput = {
        space_id: space,
        parent_id: folder.body.result.structuredContent.page_id,
        title: 'Agent document',
        markdown: 'new durable page',
        idempotency_key: 'http-create',
      };
      const [created, repeated] = await Promise.all([
        call(a.url, 'create_page', createInput),
        call(b.url, 'create_page', createInput),
      ]);
      if (created.body.result.isError)
        throw Error('create_page: ' + JSON.stringify(created.body.result));
      expect(repeated.body.result.structuredContent).toEqual(
        created.body.result.structuredContent,
      );
      expect(
        await pg`SELECT * FROM pages WHERE title='Agent document'`,
      ).toHaveLength(1);
      expect(
        await pg`SELECT * FROM page_node_meta WHERE page_id=${created.body.result.structuredContent.page_id}`,
      ).toHaveLength(1);
      expect(await pg`SELECT * FROM document_operations`).toHaveLength(4);
      const creationHistory =
        await pg`SELECT agent_source FROM page_history WHERE page_id=${created.body.result.structuredContent.page_id}`;
      expect(creationHistory).toHaveLength(1);
      expect(creationHistory[0].agent_source.operationId).toBe(
        created.body.result.structuredContent.operation_id,
      );
      const searchable = await call(a.url, 'search', { query: 'durable' });
      expect(
        searchable.body.result.structuredContent.items.some(
          (item: any) =>
            item.page_id === created.body.result.structuredContent.page_id,
        ),
      ).toBe(true);
      const readableId = created.body.result.structuredContent.page_id;
      const attachmentId = randomUUID();
      await pg`INSERT INTO attachments(id,workspace_id,page_id,file_name,file_path,file_size,mime_type) VALUES(${attachmentId},${actor.workspaceId},${readableId},'private-image.png','private/secret-image',123,'image/png')`;
      const fetched = await call(a.url, 'fetch', {
        id: readableId,
        include_images: 'metadata',
      });
      expect(fetched.body.result.isError).not.toBe(true);
      expect(fetched.body.result.structuredContent.content).toContain(
        'new durable page',
      );
      expect(fetched.body.result.structuredContent.attachments[0].name).toBe(
        'private-image.png',
      );
      const listed = await call(b.url, 'list_pages', { space_id: space });
      expect(
        listed.body.result.structuredContent.items.some(
          (item: any) => item.page_id === readableId,
        ),
      ).toBe(true);
      const restriction = randomUUID();
      await pg`INSERT INTO page_access(id,page_id,workspace_id) VALUES(${restriction},${created.body.result.structuredContent.page_id},${actor.workspaceId})`;
      const hidden = await call(b.url, 'search', { query: 'durable' });
      expect(
        hidden.body.result.structuredContent.items.some(
          (item: any) =>
            item.page_id === created.body.result.structuredContent.page_id,
        ),
      ).toBe(false);
      expect(JSON.stringify(hidden.body)).not.toContain('new durable page');
      for (const [name, args] of [
        [
          'fetch',
          {
            id: created.body.result.structuredContent.page_id,
            include_images: 'metadata',
          },
        ],
        [
          'get_page',
          { slug_id: created.body.result.structuredContent.page_id },
        ],
        [
          'get_edit_context',
          { page_id: created.body.result.structuredContent.page_id },
        ],
      ] as const) {
        const denied = await call(b.url, name, args);
        expect(denied.body.result.isError).toBe(true);
        expect(JSON.stringify(denied.body)).not.toContain('new durable page');
        expect(JSON.stringify(denied.body)).not.toContain('Agent document');
      }
      const hiddenList = await call(a.url, 'list_pages', { space_id: space });
      expect(hiddenList.body.result.isError).not.toBe(true);
      expect(JSON.stringify(hiddenList.body)).not.toContain(readableId);
      expect(JSON.stringify(hiddenList.body)).not.toContain('Agent document');
      // Even a space member cannot use this grant outside the explicitly selected space.
      const otherSpace = randomUUID();
      const otherPage = randomUUID();
      await pg`INSERT INTO spaces(id,workspace_id) VALUES(${otherSpace},${actor.workspaceId})`;
      await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${otherSpace},${actor.userId},'writer')`;
      await pg`INSERT INTO pages(id,workspace_id,space_id,title,content) VALUES(${otherPage},${actor.workspaceId},${otherSpace},'unselected secret',${pg.json({ type: 'doc', content: [] })})`;
      const outside = await call(b.url, 'list_pages', { space_id: otherSpace });
      expect(outside.body.result.structuredContent.items).toEqual([]);
      for (const target of [readableId, otherPage]) {
        const attachmentDenied = await call(a.url, 'fetch', {
          id: target,
          include_images: 'url',
        });
        expect(attachmentDenied.body.result.isError).toBe(true);
        expect(JSON.stringify(attachmentDenied.body)).not.toContain(
          'private-image',
        );
        expect(JSON.stringify(attachmentDenied.body)).not.toContain(
          attachmentId,
        );
      }
      const redacted = await call(a.url, 'get_operation', {
        operation_id: created.body.result.structuredContent.operation_id,
      });
      expect(redacted.body.result.structuredContent.result).toBeUndefined();
      expect(JSON.stringify(redacted.body)).not.toContain(
        created.body.result.structuredContent.page_id,
      );

      const principal = await oauth.authenticate(tokens.access_token);
      await pg`INSERT INTO agent_quota_buckets(workspace_id,subject,kind,bucket_start,bucket_end,used)
        SELECT ${actor.workspaceId},${principal.grantId},'entrance',date_trunc('second',clock_timestamp())+n*interval '1 second',date_trunc('second',clock_timestamp())+(n+1)*interval '1 second',60 FROM generate_series(0,2) AS n
        ON CONFLICT(workspace_id,subject,kind,bucket_start) DO UPDATE SET used=60`;
      const limited = await call(a.url, 'get_edit_context', { page_id: page });
      expect(limited.response.status).toBe(429);
      expect(limited.response.headers.get('retry-after')).toBe('1');
      expect(limited.body.code).toBe('RATE_LIMITED');
      await pg`DELETE FROM agent_quota_buckets WHERE subject=${principal.grantId} AND kind='entrance'`;
      await fetch(a.url + '/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client,
          token: tokens.access_token,
        }),
      });
      expect(
        (await call(b.url, 'get_edit_context', { page_id: page })).response
          .status,
      ).toBe(401);
    } finally {
      a.commands.unload(page);
      b.commands.unload(page);
      await a.app.close();
      await b.app.close();
      doc.destroy();
      delete process.env.DOCUMENT_COMMAND_ENABLED;
      delete process.env.DOCUMENT_COMMAND_SIGNING_KEY;
    }
  });
});

describe('real consent component and session-bound authorization', () => {
  test('browser selects space and scope, consents and returns a usable one-time code', async () => {
    const { httpNode, sessionSecret } = await import('./oauth-http-node');
    const jwt = await import('jsonwebtoken');
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve } = await import('node:path');
    const puppeteer = (await import('puppeteer-core')).default;
    const dir = mkdtempSync(join(tmpdir(), 'docmost-consent-p0-'));
    const bundle = join(dir, 'consent.js');
    execFileSync(
      resolve(__dirname, '../../../../node_modules/.bin/esbuild'),
      [
        join(__dirname, 'browser-consent-entry.tsx'),
        '--bundle',
        '--platform=browser',
        '--format=iife',
        '--tsconfig=' + resolve(__dirname, '../../../client/tsconfig.json'),
        '--outfile=' + bundle,
      ],
      { stdio: 'pipe' },
    );
    const node = await httpNode(database, oauth, members, {
      js: readFileSync(bundle, 'utf8'),
      css: readFileSync(join(dir, 'consent.css'), 'utf8'),
    });
    const oldOrigin = process.env.AGENT_OAUTH_ORIGIN;
    process.env.AGENT_OAUTH_ORIGIN = node.url;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.P0_CHROME_BIN ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });
    try {
      const session = jwt.sign(
        {
          sub: actor.userId,
          workspaceId: actor.workspaceId,
          sessionId: actor.sessionId,
          type: 'access',
        },
        sessionSecret,
        { expiresIn: '5m' },
      );
      await browser.setCookie({
        name: 'authToken',
        value: session,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });
      const tab = await browser.newPage();
      tab.setDefaultTimeout(5000);
      await tab.setRequestInterception(true);
      tab.on('request', (request) => {
        if (request.url().startsWith(redirect))
          void request.respond({
            status: 200,
            contentType: 'text/html',
            body: 'Connected',
          });
        else void request.continue();
      });
      await tab.goto(
        node.url +
          '/oauth/authorize?' +
          new URLSearchParams({ ...query(), resource: node.url + '/mcp' }),
      );
      await tab.waitForSelector('button::-p-text(允许连接)');
      expect(
        await tab.$eval(
          'button::-p-text(允许连接)',
          (el) => (el.closest('button') as HTMLButtonElement).disabled,
        ),
      ).toBe(true);
      await tab.click('input[value="' + space + '"]');
      await tab.click('input[value="pages.edit"]');
      await tab.screenshot({
        path: '/tmp/docmost-real-consent.png',
        fullPage: true,
      });
      await tab.setViewport({ width: 375, height: 812 });
      expect(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await Promise.all([
        tab.waitForNavigation(),
        tab.click('button::-p-text(允许连接)'),
      ]);
      const callback = new URL(tab.url());
      expect(callback.origin).toBe(new URL(redirect).origin);
      expect(callback.searchParams.get('state')).toBe('client-state');
      const token = await oauth.token(
        {
          grant_type: 'authorization_code',
          client_id: client,
          code: callback.searchParams.get('code')!,
          redirect_uri: redirect,
          code_verifier: verifier,
          resource: node.url + '/mcp',
        },
        { method: 'none' },
      );
      const principal = await oauth.authenticate(token!.access_token);
      expect(principal.spaceIds).toEqual([space]);
      expect(principal.scopes).toEqual(['knowledge.read', 'pages.edit']);
    } finally {
      await browser.close();
      await node.app.close();
      process.env.AGENT_OAUTH_ORIGIN = oldOrigin;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});

describe('complete OAuth read-surface permission matrix', () => {
  test.each([
    ['writer', true],
    ['create_only', true],
    ['reader', true],
    ['group_reader', true],
    ['page_other_user', false],
    ['other_user', false],
    ['ancestor_denied', false],
    ['group_removed', false],
    ['membership_removed', false],
    ['space_not_selected', false],
    ['foreign_workspace', false],
    ['deleted_page', false],
    ['user_disabled', false],
    ['grant_expired', false],
    ['token_expired', false],
    ['grant_revoked', false],
    ['empty_scope', false],
    ['client_disabled', false],
  ] as const)(
    '%s across search, tree, body, attachment modes and operations',
    async (scenario, readable) => {
      const { httpNode } = await import('./oauth-http-node');
      const { Readable } = await import('node:stream');
      const Y = await import('yjs');
      const imageBytes = Buffer.from('P0 PRIVATE IMAGE BYTES');
      const storage = {
        readStream: jest.fn(async () => Readable.from([imageBytes])),
      };
      process.env.DOCUMENT_COMMAND_ENABLED = 'true';
      process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString(
        'base64',
      );
      const node = await httpNode(database, oauth, members, undefined, storage);
      const page = randomUUID(),
        parent = randomUUID(),
        attachment = randomUUID();
      const doc = new Y.Doc();
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'public parent body');
      paragraph.insert(0, [text]);
      doc.getXmlFragment('default').insert(0, [paragraph]);
      try {
        await pg`INSERT INTO pages(id,workspace_id,space_id,title,ydoc,content,text_content) VALUES(${parent},${actor.workspaceId},${space},'matrix parent',${Buffer.from(Y.encodeStateAsUpdate(doc))},${pg.json({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'public parent body' }] }] })},'public parent body')`;
        text.delete(0, text.length);
        text.insert(0, 'matrixsecret confidential payload');
        await pg`INSERT INTO pages(id,workspace_id,space_id,parent_page_id,title,ydoc,content,text_content) VALUES(${page},${actor.workspaceId},${space},${parent},'matrixsecret private title',${Buffer.from(Y.encodeStateAsUpdate(doc))},${pg.json({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'matrixsecret confidential payload' }] }] })},'matrixsecret confidential payload')`;
        await pg`INSERT INTO attachments(id,workspace_id,page_id,file_name,file_path,file_size,mime_type) VALUES(${attachment},${actor.workspaceId},${page},'matrixsecret-image.png','secret/image',${imageBytes.length},'image/png')`;
        let tokens = await exchange((await approved()).code);
        const principal = await oauth.authenticate(tokens!.access_token);
        const call = async (name: string, args: object) => {
          const response = await fetch(node.url + '/mcp', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + tokens!.access_token,
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: { name, arguments: args },
            }),
          });
          return {
            status: response.status,
            body: (await response.json()) as any,
          };
        };
        const context = await call('get_edit_context', { page_id: page });
        const saved = await call('edit_page', {
          page_id: page,
          version_token: context.body.result.structuredContent.version_token,
          idempotency_key: 'matrix-edit',
          ops: [{ type: 'append', markdown: 'operation payload' }],
        });
        expect(saved.body.result.isError).not.toBe(true);
        const operationId = saved.body.result.structuredContent.operation_id;
        const baseline = await call('fetch', {
          id: page,
          include_images: 'inline',
        });
        expect(
          baseline.body.result.content.some(
            (c: any) =>
              c.type === 'image' && c.data === imageBytes.toString('base64'),
          ),
        ).toBe(true);
        storage.readStream.mockClear();
        if (scenario === 'other_user') {
          const other = {
              workspaceId: actor.workspaceId,
              userId: randomUUID(),
              sessionId: randomUUID(),
            },
            access = randomUUID();
          await pg`INSERT INTO users(id,workspace_id) VALUES(${other.userId},${other.workspaceId})`;
          await pg`INSERT INTO user_sessions VALUES(${other.sessionId},${other.userId},${other.workspaceId},null,clock_timestamp()+interval '1 day')`;
          await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${other.userId},'writer')`;
          await pg`INSERT INTO page_access(id,page_id,workspace_id) VALUES(${access},${page},${actor.workspaceId})`;
          await pg`INSERT INTO page_permissions(page_access_id,user_id,role) VALUES(${access},${actor.userId},'writer')`;
          const requestId = new URL(
            await oauth.start(query()),
          ).searchParams.get('request_id')!;
          const consent = await oauth.consent(requestId, other);
          const decision = await oauth.decide(
            requestId,
            other,
            {
              decision: 'allow',
              space_ids: [space],
              scopes: ['knowledge.read', 'pages.edit'],
              duration_days: 1,
            },
            consent.csrf_token,
          );
          tokens = await exchange(
            new URL(decision.redirect_url).searchParams.get('code')!,
          );
        }
        if (scenario === 'deleted_page')
          await pg`UPDATE pages SET deleted_at=clock_timestamp() WHERE id=${page}`;
        if (scenario === 'grant_expired')
          await pg`UPDATE document_agent_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${principal.grantId}`;
        if (scenario === 'token_expired')
          await pg`UPDATE agent_oauth_tokens SET access_expires_at=clock_timestamp()-interval '1 second' WHERE access_hash=${principal.tokenHash}`;
        if (scenario === 'create_only') {
          await pg`UPDATE document_agent_grants SET scopes=ARRAY['knowledge.read','pages.create'] WHERE id=${principal.grantId}`;
          await pg`UPDATE agent_oauth_tokens SET metadata=jsonb_set(metadata,'{scope}','["knowledge.read","pages.create"]'::jsonb) WHERE access_hash=${principal.tokenHash}`;
        }
        if (scenario === 'reader')
          await pg`UPDATE space_members SET role='reader' WHERE user_id=${actor.userId}`;
        if (scenario === 'page_other_user' || scenario === 'ancestor_denied') {
          const access = randomUUID(),
            other = randomUUID();
          await pg`INSERT INTO users(id,workspace_id) VALUES(${other},${actor.workspaceId})`;
          await pg`INSERT INTO page_access(id,page_id,workspace_id) VALUES(${access},${scenario === 'ancestor_denied' ? parent : page},${actor.workspaceId})`;
          await pg`INSERT INTO page_permissions(page_access_id,user_id,role) VALUES(${access},${other},'writer')`;
        }
        if (scenario === 'group_reader' || scenario === 'group_removed') {
          const group = randomUUID(),
            access = randomUUID();
          await pg`INSERT INTO groups(id,workspace_id) VALUES(${group},${actor.workspaceId})`;
          await pg`INSERT INTO group_users(group_id,user_id) VALUES(${group},${actor.userId})`;
          await pg`INSERT INTO page_access(id,page_id,workspace_id) VALUES(${access},${page},${actor.workspaceId})`;
          await pg`INSERT INTO page_permissions(page_access_id,group_id,role) VALUES(${access},${group},'reader')`;
          if (scenario === 'group_removed')
            await pg`DELETE FROM group_users WHERE user_id=${actor.userId}`;
        }
        if (scenario === 'membership_removed')
          await pg`DELETE FROM space_members WHERE user_id=${actor.userId}`;
        if (scenario === 'space_not_selected')
          await pg`UPDATE document_agent_grants SET space_ids=ARRAY[]::uuid[] WHERE id=${principal.grantId}`;
        if (scenario === 'foreign_workspace') {
          const foreign = randomUUID();
          await pg`INSERT INTO workspaces(id) VALUES(${foreign})`;
          // Query an existing foreign page rather than attempting to migrate a managed page.
          const foreignPage = randomUUID(),
            foreignSpace = randomUUID();
          await pg`INSERT INTO spaces(id,workspace_id) VALUES(${foreignSpace},${foreign})`;
          await pg`INSERT INTO pages(id,workspace_id,space_id,title,text_content,content) VALUES(${foreignPage},${foreign},${foreignSpace},'matrixsecret private title','matrixsecret confidential payload',${pg.json({ type: 'doc', content: [] })})`;
          // Hide the own-space control page so every returned secret must belong to the foreign resource.
          await pg`DELETE FROM space_members WHERE user_id=${actor.userId}`;
          (principal as any).foreignPage = foreignPage;
          (principal as any).foreignSpace = foreignSpace;
        }
        if (scenario === 'user_disabled')
          await pg`UPDATE users SET deactivated_at=clock_timestamp() WHERE id=${actor.userId}`;
        if (scenario === 'grant_revoked')
          await pg`UPDATE document_agent_grants SET revoked_at=clock_timestamp() WHERE id=${principal.grantId}`;
        if (scenario === 'empty_scope')
          await pg`UPDATE agent_oauth_tokens SET metadata=jsonb_set(metadata,'{scope}','[]'::jsonb) WHERE access_hash=${principal.tokenHash}`;
        if (scenario === 'client_disabled')
          await pg`UPDATE agent_oauth_clients SET active=false WHERE id=${client}`;
        const target = (principal as any).foreignPage ?? page,
          targetSpace = (principal as any).foreignSpace ?? space;
        for (const [name, args, kind] of [
          ['search', { query: 'matrixsecret' }, 'list'],
          ['list_pages', { space_id: targetSpace }, 'list'],
          ['list_pages', { parent_page_id: target }, 'body'],
          ['fetch', { id: target, include_images: 'none' }, 'body'],
          ['fetch', { id: target, include_images: 'metadata' }, 'body'],
          ['fetch', { id: target, include_images: 'url' }, 'body'],
          ['fetch', { id: target, include_images: 'inline' }, 'body'],
          ['get_page', { slug_id: target, include_images: 'metadata' }, 'body'],
          [
            'get_page',
            {
              url: node.url + '/s/space/p/' + target,
              include_images: 'inline',
            },
            'body',
          ],
          [
            'fetch',
            {
              id: scenario === 'foreign_workspace' ? target : parent,
              include_children: true,
              max_depth: 3,
              include_images: 'inline',
            },
            'tree',
          ],
          [
            'search',
            {
              query: 'matrixsecret',
              parent_page_id: target,
              include_children: true,
            },
            'list',
          ],
        ] as const) {
          const r = await call(name, args);
          if (readable) {
            expect(r.status).toBe(200);
            expect(r.body.result.isError).not.toBe(true);
            expect(JSON.stringify(r.body)).toContain('matrixsecret');
          } else {
            if (r.body.result?.structuredContent?.items)
              expect(
                r.body.result.structuredContent.items.some(
                  (item: any) => item.page_id === target,
                ),
              ).toBe(false);
            else if (kind !== 'tree')
              expect(
                r.status !== 200 || r.body.result?.isError || r.body.error,
              ).toBeTruthy();
            const output = JSON.stringify(r.body);
            expect(output).not.toContain('matrixsecret private title');
            expect(output).not.toContain('matrixsecret confidential payload');
            expect(output).not.toContain('matrixsecret-image');
            expect(output).not.toContain(imageBytes.toString('base64'));
          }
        }
        const operation = await call('get_operation', {
          operation_id: operationId,
        });
        if (readable)
          expect(operation.body.result.structuredContent.result.pageId).toBe(
            page,
          );
        else {
          expect(
            operation.body.result?.structuredContent?.result,
          ).toBeUndefined();
          expect(JSON.stringify(operation.body)).not.toContain(page);
        }
        if (!readable) expect(storage.readStream).not.toHaveBeenCalled();
        if (scenario === 'create_only' || scenario === 'writer') {
          await pg`INSERT INTO page_node_meta(page_id,workspace_id,space_id,node_type) VALUES(${parent},${actor.workspaceId},${space},'folder')`;
          const create = await call('create_page', {
            space_id: space,
            parent_id: parent,
            title: 'Scope test',
            markdown: 'created with create scope',
            idempotency_key: 'scope-create',
          });
          if (scenario === 'create_only')
            expect(create.body.result.structuredContent.status).toBe(
              'committed',
            );
          else {
            expect(create.body.result.isError).toBe(true);
            expect(JSON.stringify(create.body)).toContain(
              'Tool create_page not found',
            );
          }
          const folder = await call('create_folder', {
            space_id: space,
            title: 'Forbidden folder',
            idempotency_key: 'scope-folder',
          });
          expect(folder.body.result.isError).toBe(true);
          expect(JSON.stringify(folder.body)).toContain(
            'Tool create_folder not found',
          );
        }

        if (
          scenario === 'create_only' ||
          scenario === 'reader' ||
          scenario === 'group_reader' ||
          scenario === 'empty_scope'
        ) {
          const deniedWrite = await call('get_edit_context', { page_id: page });
          expect(
            deniedWrite.status !== 200 ||
              deniedWrite.body.result?.isError ||
              deniedWrite.body.error,
          ).toBeTruthy();
        }
      } finally {
        doc.destroy();
        await node.app.close();
        delete process.env.DOCUMENT_COMMAND_ENABLED;
        delete process.env.DOCUMENT_COMMAND_SIGNING_KEY;
      }
    },
  );
});

describe('P1 management and PostgreSQL quotas', () => {
  test('owner-only grants, narrowing, CAS, admin policy, redacted audit, revocation and refresh denial', async () => {
    const { AgentManagementService } =
      await import('../../src/core/agent-oauth/agent-management.service');
    const service = new AgentManagementService(database, oauth);
    const tokens = await exchange((await approved()).code),
      principal = await oauth.authenticate(tokens.access_token);
    const detail = await service.detail(actor, principal.grantId);
    expect(detail.status).toBe('active');
    await expect(service.policy(actor)).rejects.toThrow('FORBIDDEN');
    await pg`UPDATE users SET role='admin' WHERE id=${actor.userId}`;
    expect((await service.policy(actor)).enabled).toBe(true);
    await expect(
      service.change(actor, principal.grantId, {
        expected_version: detail.version,
        scopes: ['knowledge.read', 'pages.create'],
        space_ids: [space],
      }),
    ).rejects.toThrow('SCOPE_EXPANSION_FORBIDDEN');
    const narrowed = await service.change(actor, principal.grantId, {
      expected_version: detail.version,
      scopes: ['knowledge.read'],
      space_ids: [space],
    });
    expect(narrowed.version).toBe('2');
    expect((await oauth.authenticate(tokens.access_token)).scopes).toEqual([
      'knowledge.read',
    ]);
    await expect(
      service.change(
        actor,
        principal.grantId,
        { expected_version: detail.version },
        true,
      ),
    ).rejects.toThrow('REVISION_CONFLICT');
    const other = { ...actor, userId: randomUUID(), sessionId: randomUUID() };
    await pg`INSERT INTO users(id,workspace_id) VALUES(${other.userId},${actor.workspaceId})`;
    await pg`INSERT INTO user_sessions VALUES(${other.sessionId},${other.userId},${actor.workspaceId},null,clock_timestamp()+interval '1 day')`;
    await expect(service.detail(other, principal.grantId)).rejects.toThrow(
      'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
    );
    expect((await service.list(other, {})).items).toEqual([]);
    await expect(service.activity(other, undefined, {})).rejects.toThrow(
      'FORBIDDEN',
    );
    const policy = await service.policy(actor);
    await expect(
      service.updatePolicy(actor, {
        expected_version: policy.version,
        enabled: true,
        max_grant_days: 30,
        quota_limits: { write: 11 },
      }),
    ).rejects.toThrow('QUOTA_HARD_LIMIT');
    const disabled = await service.updatePolicy(actor, {
      expected_version: policy.version,
      enabled: false,
      max_grant_days: 7,
      quota_limits: {},
    });
    expect(disabled.enabled).toBe(false);
    await expect(approved()).rejects.toThrow();
    expect(
      (
        await service.change(
          actor,
          principal.grantId,
          { expected_version: narrowed.version },
          true,
        )
      ).status,
    ).toBe('revoked');
    expect(
      (
        await service.change(
          actor,
          principal.grantId,
          { expected_version: narrowed.version },
          true,
        )
      ).status,
    ).toBe('revoked');
    await expect(oauth.authenticate(tokens.access_token)).rejects.toThrow();
    await expect(
      oauth.token(
        {
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: client,
          resource,
        },
        { method: 'none' },
      ),
    ).rejects.toThrow();
    expect(
      JSON.stringify(await service.activity(actor, undefined, {})),
    ).not.toMatch(/access_token|refresh_token|content|versionToken/);
    expect((await pg`SELECT * FROM agent_management_audit`).length).toBe(3);
  });
  test('fixed-minute atomic limits, preview dual charge, daily reservations, no-op release and timezone continuity', async () => {
    const { chargeRate, reserveQuota, settleQuota, quotaLock } =
      await import('../../src/core/document-command/agent-quota');
    const principal = await oauth.authenticate(
      (await exchange((await approved()).code)).access_token,
    );
    const tx = <T>(fn: (trx: any) => Promise<T>) =>
      database.transaction().execute(async (trx) => {
        await sql`select set_config('app.workspace_id',${actor.workspaceId},true)`.execute(
          trx,
        );
        await quotaLock(trx, actor.workspaceId);
        return fn(trx);
      });
    await pg`UPDATE agent_policies SET quota_limits='{"read":2,"preview":1,"grant_edit":1,"workspace_edit":2}'::jsonb WHERE workspace_id=${actor.workspaceId}`;
    const reads = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        tx((trx) => chargeRate(trx, principal, ['read'])),
      ),
    );
    expect(reads.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    await pg`UPDATE agent_quota_buckets SET bucket_end=clock_timestamp()-interval '1 second',bucket_start=bucket_start-interval '1 minute' WHERE kind='read'`;
    await tx((trx) => chargeRate(trx, principal, ['read', 'preview']));
    await expect(
      tx((trx) => chargeRate(trx, principal, ['read', 'preview'])),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', reason: 'minute' });
    expect(
      (
        await pg`SELECT used FROM agent_quota_buckets WHERE kind='read' ORDER BY bucket_start DESC`
      )[0].used,
    ).toBe(1);
    const op = async () => {
      const id = randomUUID();
      await pg`INSERT INTO document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status) VALUES(${id},${actor.workspaceId},${actor.userId},${client},${principal.grantId},${randomUUID()},'edit_page',${id},'hash','running')`;
      return id;
    };
    const first = await op();
    await tx((trx) => reserveQuota(trx, principal, first, 'edit'));
    const second = await op();
    await expect(
      tx((trx) => reserveQuota(trx, principal, second, 'edit')),
    ).rejects.toMatchObject({ reason: 'day' });
    await tx((trx) => settleQuota(trx, first, false));
    await tx((trx) => settleQuota(trx, first, false));
    await pg`UPDATE document_operations SET status='rejected' WHERE id=${first}`;
    await tx((trx) => reserveQuota(trx, principal, second, 'edit'));
    await tx((trx) => settleQuota(trx, second, true));
    await pg`UPDATE document_operations SET status='committed' WHERE id=${second}`;
    const buckets =
      await pg`SELECT id,bucket_start,bucket_end,used,reserved FROM agent_quota_buckets WHERE kind='edit'`;
    expect(buckets.every((b) => b.used === 1 && b.reserved === 0)).toBe(true);
    const { AgentManagementService } =
      await import('../../src/core/agent-oauth/agent-management.service');
    await pg`UPDATE users SET role='admin' WHERE id=${actor.userId}`;
    const manager = new AgentManagementService(database, oauth),
      policy = await manager.policy(actor);
    await manager.updatePolicy(actor, {
      expected_version: policy.version,
      enabled: true,
      max_grant_days: 30,
      quota_limits: policy.quotaLimits,
      timezone: 'America/New_York',
    });
    expect(policy.quotaLimits.grant_edit).toBe(1);
    expect((await manager.policy(actor)).quotaLimits.grant_edit).toBe(1);
    const third = await op();
    await expect(
      tx((trx) => reserveQuota(trx, principal, third, 'edit')),
    ).rejects.toMatchObject({ reason: 'day' });
    const carried =
      await pg`SELECT id,bucket_start,bucket_end,used,reserved FROM agent_quota_buckets WHERE kind='edit'`;
    for (const before of buckets) {
      const after = carried.find((b) => b.id === before.id)!;
      expect(after.used).toBe(before.used);
      expect(after.reserved).toBe(0);
      expect(+after.bucket_end).toBeGreaterThanOrEqual(+before.bucket_end);
    }
  });
  test('grant/workspace concurrent slots, workspace daily aggregate and default-off workspace', async () => {
    const { reserveQuota, quotaLock } =
      await import('../../src/core/document-command/agent-quota');
    const principal = await oauth.authenticate(
      (await exchange((await approved()).code)).access_token,
    );
    const tx = (fn: any) =>
      database.transaction().execute(async (trx) => {
        await quotaLock(trx, actor.workspaceId);
        return fn(trx);
      });
    const operation = async (grant: string, status: string) => {
      const id = randomUUID();
      await pg`INSERT INTO document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status) VALUES(${id},${actor.workspaceId},${actor.userId},${client},${grant},${randomUUID()},'edit_page',${id},'hash',${status})`;
      return id;
    };
    await operation(principal.grantId, 'running');
    await operation(principal.grantId, 'running');
    const id = await operation(principal.grantId, 'running');
    await expect(
      tx((t: any) => reserveQuota(t, principal, id, 'edit')),
    ).rejects.toMatchObject({ reason: 'concurrency' });
    await pg`UPDATE document_operations SET status='rejected'`;
    const other = randomUUID();
    await pg`INSERT INTO document_agent_grants(id,workspace_id,user_id,client_id,scopes,space_ids,expires_at) SELECT ${other},workspace_id,user_id,client_id,scopes,space_ids,expires_at FROM document_agent_grants WHERE id=${principal.grantId}`;
    for (let n = 0; n < 10; n++) await operation(other, 'running');
    await expect(
      tx((t: any) => reserveQuota(t, principal, id, 'edit')),
    ).rejects.toMatchObject({ reason: 'concurrency' });
    await pg`UPDATE document_operations SET status='rejected'`;
    await pg`INSERT INTO agent_quota_buckets(workspace_id,subject,kind,bucket_start,bucket_end,used) VALUES(${actor.workspaceId},'workspace','edit',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',2000)`;
    await expect(
      tx((t: any) => reserveQuota(t, principal, id, 'edit')),
    ).rejects.toMatchObject({ reason: 'day' });
    await pg`DELETE FROM agent_policies WHERE workspace_id=${actor.workspaceId}`;
    await expect(
      tx((t: any) => reserveQuota(t, principal, id, 'edit')),
    ).rejects.toThrow('MCP_DISABLED');
  });
});

test('P1 10 concurrent protocol clients, 3 users, 2 applications, 50 durable writes and bounded document scaling', async () => {
  const { httpNode } = await import('./oauth-http-node');
  const Y = await import('yjs');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } =
    await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const { writeFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const os = await import('node:os');
  process.env.DOCUMENT_COMMAND_ENABLED = 'true';
  process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString(
    'base64',
  );
  const nodes = [
    await httpNode(database, oauth, members),
    await httpNode(database, oauth, members),
  ];
  const clients: any[] = [];
  const originalActor = actor,
    originalClient = client;
  const times = {
    read: [] as number[],
    preview: [] as number[],
    commit: [] as number[],
  };
  const scaling: any[] = [];
  try {
    const secondClient = (
      await oauth.register(actor, {
        name: 'P1 independent client',
        type: 'public',
        redirect_uris: ['http://127.0.0.1:1/callback'],
        scopes: ['knowledge.read', 'pages.edit'],
        origins: [],
      })
    ).client_id;
    const people = [actor];
    for (let n = 1; n < 3; n++) {
      const person = {
        ...actor,
        userId: randomUUID(),
        sessionId: randomUUID(),
      };
      people.push(person);
      await pg`INSERT INTO users(id,workspace_id) VALUES(${person.userId},${actor.workspaceId})`;
      await pg`INSERT INTO user_sessions VALUES(${person.sessionId},${person.userId},${actor.workspaceId},null,clock_timestamp()+interval '1 day')`;
      await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${person.userId},'writer')`;
    }
    for (let n = 0; n < 10; n++) {
      actor = people[n % 3];
      client = n % 2 ? secondClient : originalClient;
      const token = (await exchange((await approved()).code)).access_token;
      if (n % 2) {
        const sdk = new Client({ name: 'P1 SDK client', version: '1.0' });
        await sdk.connect(
          new StreamableHTTPClientTransport(new URL(nodes[1].url + '/mcp'), {
            requestInit: { headers: { Authorization: 'Bearer ' + token } },
          }),
        );
        clients.push({
          close: () => sdk.close(),
          call: (name: string, args: Record<string, unknown>) =>
            sdk.callTool({ name, arguments: args }),
        });
      } else {
        clients.push({
          close: async () => {},
          call: async (name: string, args: object) => {
            const response = await fetch(nodes[0].url + '/mcp', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
              }),
            });
            if (response.status !== 200)
              throw Error('transport ' + response.status);
            return ((await response.json()) as any).result;
          },
        });
      }
    }
    actor = originalActor;
    client = originalClient;
    const doc = new Y.Doc();
    for (let i = 0; i < 100; i++) {
      const p = new Y.XmlElement('paragraph'),
        t = new Y.XmlText();
      t.insert(0, 'x'.repeat(950));
      p.insert(0, [t]);
      doc.getXmlFragment('default').push([p]);
    }
    const bytes = Buffer.from(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    expect(bytes.length).toBeLessThanOrEqual(102400);
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = randomUUID();
      ids.push(id);
      await pg`INSERT INTO pages(id,workspace_id,space_id,slug_id,title,ydoc) VALUES(${id},${actor.workspaceId},${space},${'perf-' + i},'performance fixture',${bytes})`;
      if ([1, 10, 50].includes(i + 1)) {
        const start = performance.now();
        const result = await clients[0].call('list_pages', {
          space_id: space,
          max_depth: 0,
          max_results: 100,
        });
        expect(result.isError).not.toBe(true);
        scaling.push({ documents: i + 1, ms: performance.now() - start });
      }
    }
    await Promise.all(
      clients.map(async (c, index) => {
        for (let round = 0; round < 5; round++) {
          const id = ids[index * 5 + round];
          let start = performance.now();
          const context = await c.call('get_edit_context', {
            page_id: id,
            page_size: 50,
          });
          times.read.push(performance.now() - start);
          if (context.isError) throw Error(JSON.stringify(context));
          expect(
            Buffer.byteLength(JSON.stringify(context.structuredContent)),
          ).toBeLessThan(65536);
          const input = {
            page_id: id,
            version_token: context.structuredContent.version_token,
            idempotency_key: 'p1-perf-' + round,
            ops: Array.from({ length: 5 }, (_, i) => ({
              type: 'append',
              markdown: '**Performance** step ' + i,
            })),
          };
          start = performance.now();
          const preview = await c.call('edit_page', {
            ...input,
            preview: true,
          });
          times.preview.push(performance.now() - start);
          if (preview.isError)
            throw Error('preview ' + JSON.stringify(preview));
          start = performance.now();
          const result = await c.call('edit_page', input);
          times.commit.push(performance.now() - start);
          if (result.isError) throw Error('commit ' + JSON.stringify(result));
          expect(result.structuredContent.status).toBe('committed');
        }
      }),
    );
    const percentile = (values: number[], p: number) =>
      [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
    const metrics = Object.fromEntries(
      Object.entries(times).map(([kind, values]) => [
        kind,
        {
          samples: values.length,
          p50: percentile(values, 0.5),
          p95: percentile(values, 0.95),
          max: Math.max(...values),
        },
      ]),
    );
    expect(metrics.read.p95).toBeLessThanOrEqual(2000);
    expect(metrics.preview.p95).toBeLessThanOrEqual(2000);
    expect(metrics.commit.p95).toBeLessThanOrEqual(5000);
    expect(
      (
        await pg`SELECT count(*)::integer as count FROM document_operations WHERE status='committed'`
      )[0].count,
    ).toBe(50);
    expect(
      (
        await pg`SELECT count(*)::integer as count FROM agent_quota_reservations WHERE state='reserved'`
      )[0].count,
    ).toBe(0);
    writeFileSync(
      resolve(
        __dirname,
        '../../../../docs/iterations/20261018_01_agent-document-mcp/test/' +
          (process.env.P2_RETENTION === 'true'
            ? 'p2-retention-performance.json'
            : process.env.P2_ACCEPTANCE === 'true'
              ? 'p2-performance.json'
              : 'p1-performance.json'),
      ),
      JSON.stringify(
        {
          executed_at: new Date().toISOString(),
          node: process.version,
          machine: {
            platform: os.platform(),
            arch: os.arch(),
            cpu: os.cpus()[0].model,
            cores: os.cpus().length,
          },
          database: 'disposable PostgreSQL 16, synchronous commit',
          transport: ['native Fetch JSON-RPC', 'MCP SDK Client StreamableHTTP'],
          concurrent_clients: 10,
          users: 3,
          applications: 2,
          writes: 50,
          success_rate: 1,
          document_bytes: bytes.length,
          operations_per_write: 5,
          metrics_ms: metrics,
          scaling,
          scope:
            'local two HTTP nodes, not public product or 14-day observation',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    actor = originalActor;
    client = originalClient;
    await Promise.all(clients.map((c) => c.close()));
    await Promise.all(nodes.map((n) => n.app.close()));
  }
}, 60000);
