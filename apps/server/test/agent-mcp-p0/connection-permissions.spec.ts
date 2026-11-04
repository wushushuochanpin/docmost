import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { db } from './store';
import { up as boundary } from '../../src/database/migrations/20261018T180000-document-command-boundary';
import { up as oauthMigration } from '../../src/database/migrations/20261019T000100-agent-oauth';
import { up as historyMigration } from '../../src/database/migrations/20261019T020000-agent-history-source';
import { up as managementMigration } from '../../src/database/migrations/20261019T120000-agent-management-quotas';
import { up as retentionMigration } from '../../src/database/migrations/20261019T150000-agent-retention-observability';
import { up as tokensMigration } from '../../src/database/migrations/20260309T001000-sc-api-tokens';
import { up as connectionMigration } from '../../src/database/migrations/20261104T150000-agent-connection-permissions';
import { AgentOAuthService } from '../../src/core/agent-oauth/agent-oauth.service';
import { AgentCredentialService } from '../../src/core/agent-credentials/agent-credential.service';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { IntegrationTokenService } from '../../src/core/integration-token/services/integration-token.service';
import { IntegrationTokenRepo } from '../../src/core/integration-token/repos/integration-token.repo';
import { PagePermissionRepo } from '../../src/database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';
import { KyselyDB } from '../../src/database/types/kysely.types';
import { httpNode } from './oauth-http-node';

const pg = db('p0_connperm');
const database = new Kysely({
  dialect: new PostgresJSDialect({ postgres: pg }),
  plugins: [new CamelCasePlugin()],
}) as KyselyDB;
const cache = { get: () => { throw Error('cached authorization'); } } as any;
const members = new SpaceMemberRepo(database, null as any, null as any, cache);
const permissions = new PagePermissionRepo(database, null as any, cache);
const oauth = new AgentOAuthService(database, members);
const credentials = new AgentCredentialService(database, oauth);
const commands = new DocumentCommandService(
  database,
  permissions,
  members,
  credentials,
);
const tokenRepo = new IntegrationTokenRepo(database);
const audit = { log: jest.fn(async () => undefined) } as any;
const tokenService = {
  generateApiToken: async ({ apiKeyId }: { apiKeyId: string }) =>
    `mcp_${apiKeyId}_${randomUUID()}`,
} as any;
const users = {
  findById: (id: string, workspaceId: string) =>
    database
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst(),
};
const workspaces = {
  findById: async (id: string) => {
    const row = await database
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { ...row, settings: { ai: { mcp: true } } } : undefined;
  },
};
const tokens = new IntegrationTokenService(
  tokenRepo,
  tokenService,
  { createForUser: () => ({ cannot: () => false }) } as any,
  users as any,
  workspaces as any,
  members,
  oauth,
  audit,
  database,
);

let ids: {
  workspace: string;
  user: string;
  session: string;
  space: string;
  parent: string;
  page: string;
};
let actor: { workspaceId: string; userId: string; sessionId: string };

function request(raw: string, bearer: string) {
  return {
    headers: { authorization: `Bearer ${bearer}` },
    raw: { url: raw },
    url: raw,
    ip: '127.0.0.1',
  } as any;
}

function actorFor(token: any) {
  return {
    workspaceId: ids.workspace,
    userId: ids.user,
    kind: 'api_token' as const,
    credentialId: token.id,
    apiTokenId: token.id,
    tokenHash: token.tokenHash,
    scopes: token.scopes ?? token.scopeJson ?? [],
    spaceIds: token.spaceIds ?? [],
    pageId: ids.page,
  };
}

async function pageWithDoc() {
  const doc = new Y.Doc();
  const p = new Y.XmlElement('paragraph');
  const t = new Y.XmlText();
  t.insert(0, 'before');
  p.insert(0, [t]);
  doc.getXmlFragment('default').insert(0, [p]);
  await pg`INSERT INTO pages(id,workspace_id,space_id,ydoc,content,title) VALUES(${ids.parent},${ids.workspace},${ids.space},${Buffer.from(Y.encodeStateAsUpdate(doc))},${pg.json({ type: 'doc', content: [{ type: 'paragraph', text: 'before' }] })},'parent')`;
  await pg`INSERT INTO pages(id,workspace_id,space_id,parent_page_id,ydoc,content,title) VALUES(${ids.page},${ids.workspace},${ids.space},${ids.parent},${Buffer.from(Y.encodeStateAsUpdate(doc))},${pg.json({ type: 'doc', content: [{ type: 'paragraph', text: 'before' }] })},'page')`;
  await pg`INSERT INTO page_node_meta(page_id,workspace_id,space_id,node_type) VALUES(${ids.parent},${ids.workspace},${ids.space},'folder'),(${ids.page},${ids.workspace},${ids.space},'file')`;
  await pg`INSERT INTO document_gates(page_id,workspace_id) VALUES(${ids.page},${ids.workspace})`;
  doc.destroy();
}

beforeAll(async () => {
  process.env.DOCUMENT_COMMAND_ENABLED = 'true';
  process.env.DOCUMENT_COMMAND_SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.AGENT_OAUTH_ENABLED = 'true';
  process.env.AGENT_OAUTH_DCR_ENABLED = 'true';
  process.env.AGENT_OAUTH_ORIGIN = 'http://127.0.0.1:45678';
  process.env.AGENT_OAUTH_RESPONSE_KEY = Buffer.alloc(32, 4).toString('base64');
  await pg`CREATE SCHEMA p0_connperm`;
  await pg.unsafe(readFileSync(join(__dirname, 'business-schema.sql'), 'utf8'));
  await pg`ALTER TABLE spaces ADD COLUMN name text DEFAULT 'space', ADD COLUMN slug text DEFAULT 'space'`;
  await pg`ALTER TABLE pages ADD COLUMN position text, ALTER COLUMN id SET DEFAULT gen_random_uuid()`;
  await pg`CREATE OR REPLACE FUNCTION gen_uuid_v7() RETURNS uuid AS $$ SELECT gen_random_uuid() $$ LANGUAGE SQL`;
  await boundary(database);
  await oauthMigration(database);
  await historyMigration(database);
  await managementMigration(database);
  await retentionMigration(database);
  await tokensMigration(database);
  await connectionMigration(database);
});
beforeEach(async () => {
  await pg`TRUNCATE workspaces,agent_oauth_clients,sc_api_tokens,document_operations CASCADE`;
  ids = {
    workspace: randomUUID(),
    user: randomUUID(),
    session: randomUUID(),
    space: randomUUID(),
    parent: randomUUID(),
    page: randomUUID(),
  };
  actor = {
    workspaceId: ids.workspace,
    userId: ids.user,
    sessionId: ids.session,
  };
  await pg`INSERT INTO workspaces VALUES(${ids.workspace})`;
  await pg`INSERT INTO users(id,workspace_id) VALUES(${ids.user},${ids.workspace})`;
  await pg`INSERT INTO spaces(id,workspace_id) VALUES(${ids.space},${ids.workspace})`;
  await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${ids.space},${ids.user},'writer')`;
  await pg`INSERT INTO user_sessions VALUES(${ids.session},${ids.user},${ids.workspace},null,clock_timestamp()+interval '1 day')`;
  await pg`INSERT INTO agent_policies(workspace_id,enabled) VALUES(${ids.workspace},true)`;
  await pageWithDoc();
  audit.log.mockClear();
});
afterAll(async () => {
  delete process.env.DOCUMENT_COMMAND_ENABLED;
  delete process.env.DOCUMENT_COMMAND_SIGNING_KEY;
  delete process.env.AGENT_OAUTH_ENABLED;
  delete process.env.AGENT_OAUTH_DCR_ENABLED;
  delete process.env.AGENT_OAUTH_ORIGIN;
  delete process.env.AGENT_OAUTH_RESPONSE_KEY;
  await database.destroy();
});

describe('MCP scoped API token lifecycle and write barrier', () => {
  test('defaults to knowledge.read, stores only a hash, and cannot access non-MCP HTTP routes', async () => {
    const created = await tokens.createMcpToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      {
        name: 'read only',
        spaceIds: [ids.space],
        scopes: ['knowledge.read'],
        requestId: randomUUID(),
      },
    );
    expect(created.scopes).toEqual(['knowledge.read']);
    expect(created.token).toMatch(/^mcp_/);
    const stored = (
      await pg`SELECT token_hash,credential_type,scopes,space_ids FROM sc_api_tokens WHERE id=${created.id}`
    )[0];
    expect(stored.credential_type).toBe('mcp_scoped');
    expect(stored.scopes).toEqual(['knowledge.read']);
    expect(stored.space_ids).toEqual([ids.space]);
    await expect(
      tokens.validateApiToken(request('/mcp', created.token), {
        apiKeyId: created.id,
        sub: ids.user,
        workspaceId: ids.workspace,
      }),
    ).resolves.toMatchObject({ apiToken: { id: created.id } });
    await expect(
      tokens.validateApiToken(request('/api/pages', created.token), {
        apiKeyId: created.id,
        sub: ids.user,
        workspaceId: ids.workspace,
      }),
    ).rejects.toThrow('MCP_TOKEN_HTTP_SCOPE_DENIED');
  });

  test('legacy tokens remain read-only, cannot become scoped, and keep their HTTP surface', async () => {
    const legacy = await tokens.createPersonalToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: {} } as any,
      { name: 'legacy', expiresAt: null } as any,
    );
    const validated = await tokens.validateApiToken(request('/api/pages', legacy.token), {
      apiKeyId: legacy.id,
      sub: ids.user,
      workspaceId: ids.workspace,
    });
    expect((validated.apiToken as any).credentialType).toBe('legacy');
    expect(validated.apiToken.scopeJson).toEqual([]);
    expect(() =>
      credentials.fromApiToken(validated.apiToken as any),
    ).toThrow('MCP_SCOPED_TOKEN_REQUIRED');
    await expect(
      tokens.updateMcpToken(
        { id: ids.user } as any,
        { id: ids.workspace } as any,
        actor,
        {
          tokenId: legacy.id,
          expectedVersion: '1',
          scopes: ['knowledge.read'],
          spaceIds: [ids.space],
        },
      ),
    ).rejects.toThrow('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
  });

  test('write token edits through document command, downgrade blocks the next commit, and upgrade requires confirmation', async () => {
    const created = await tokens.createMcpToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      {
        name: 'writer',
        spaceIds: [ids.space],
        scopes: ['knowledge.read', 'pages.edit'],
        requestId: randomUUID(),
      },
    );
    const validated = await tokens.validateApiToken(request('/mcp', created.token), {
      apiKeyId: created.id,
      sub: ids.user,
      workspaceId: ids.workspace,
    });
    const context = await commands.editContext(actorFor(validated.apiToken));
    const result = await commands.edit(
      actorFor(validated.apiToken),
      {
        key: 'first-write',
        versionToken: context.token,
        commands: [{ type: 'append', text: 'agent write' }],
      },
      (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
    );
    expect(result.status).toBe('committed');
    const stored = (await pg`SELECT content FROM pages WHERE id=${ids.page}`)[0];
    expect(JSON.stringify(stored.content)).toContain('agent write');

    await expect(
      tokens.updateMcpToken(
        { id: ids.user } as any,
        { id: ids.workspace } as any,
        actor,
        {
          tokenId: created.id,
          expectedVersion: created.version,
          scopes: ['knowledge.read'],
          spaceIds: [ids.space],
          confirmUpgrade: false,
        },
      ),
    ).resolves.toMatchObject({ scopes: ['knowledge.read'] });

    await expect(
      commands.edit(
        actorFor(validated.apiToken),
        {
          key: 'after-downgrade',
          versionToken: context.token,
          commands: [{ type: 'append', text: 'must not land' }],
        },
        (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
      ),
    ).rejects.toThrow('RESOURCE_NOT_FOUND_OR_FORBIDDEN');

    await expect(
      tokens.updateMcpToken(
        { id: ids.user } as any,
        { id: ids.workspace } as any,
        actor,
        {
          tokenId: created.id,
          expectedVersion: String(Number(created.version) + 1),
          scopes: ['knowledge.read', 'pages.edit'],
          spaceIds: [ids.space],
          confirmUpgrade: false,
        },
      ),
    ).rejects.toThrow('UPGRADE_CONFIRMATION_REQUIRED');
  });

  test('downgrade during candidate construction is caught by the final commit barrier', async () => {
    const created = await tokens.createMcpToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      {
        name: 'race writer',
        spaceIds: [ids.space],
        scopes: ['knowledge.read', 'pages.edit'],
        requestId: randomUUID(),
      },
    );
    const validated = await tokens.validateApiToken(request('/mcp', created.token), {
      apiKeyId: created.id,
      sub: ids.user,
      workspaceId: ids.workspace,
    });
    const context = await commands.editContext(actorFor(validated.apiToken));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = commands.edit(
      actorFor(validated.apiToken),
      {
        key: 'race-write',
        versionToken: context.token,
        commands: [{ type: 'append', text: 'race content' }],
      },
      async (doc) => {
        await gate;
        return TiptapTransformer.fromYdoc(doc, 'default');
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await tokens.updateMcpToken(
      { id: ids.user } as any,
      { id: ids.workspace } as any,
      actor,
      {
        tokenId: created.id,
        expectedVersion: created.version,
        scopes: ['knowledge.read'],
        spaceIds: [ids.space],
        confirmUpgrade: false,
      },
    );
    release();
    await expect(pending).rejects.toThrow('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
    const stored = (await pg`SELECT content FROM pages WHERE id=${ids.page}`)[0];
    expect(JSON.stringify(stored.content)).not.toContain('race content');
  });

  test('revoke is idempotent and immediately invalidates authentication', async () => {
    const created = await tokens.createMcpToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      {
        name: 'revoked',
        spaceIds: [ids.space],
        scopes: ['knowledge.read'],
        requestId: randomUUID(),
      },
    );
    await expect(
      tokens.revokeMcpToken(
        { id: ids.user } as any,
        { id: ids.workspace } as any,
        actor,
        { tokenId: created.id },
      ),
    ).resolves.toEqual({ id: created.id, status: 'revoked' });
    await expect(
      tokens.revokeMcpToken(
        { id: ids.user } as any,
        { id: ids.workspace } as any,
        actor,
        { tokenId: created.id },
      ),
    ).resolves.toEqual({ id: created.id, status: 'revoked' });
    await expect(
      tokens.validateApiToken(request('/mcp', created.token), {
        apiKeyId: created.id,
        sub: ids.user,
        workspaceId: ids.workspace,
      }),
    ).rejects.toThrow('Token revoked');
  });

  test('DCR metadata and public registration endpoint return 201 without a resource grant', async () => {
    const { app, url } = await httpNode(database, oauth, members);
    try {
      const metadata = await fetch(
        url + '/.well-known/oauth-authorization-server',
      );
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toMatchObject({
        registration_endpoint: 'http://127.0.0.1:45678/oauth/register',
      });
      const response = await fetch(url + '/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://127.0.0.1:43119/callback'],
          client_name: '豆包工作',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: 'knowledge.read pages.edit',
        }),
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.client_id).toBeTruthy();
      expect(body.scope).toBe('knowledge.read pages.edit');
      const count = (
        await pg`SELECT count(*)::int AS count FROM document_agent_grants`
      )[0];
      expect(count.count).toBe(0);
    } finally {
      await app.close();
    }
  });



  test('DCR client completes authorization, consent, token exchange and MCP edit', async () => {
    const verifier = 'v'.repeat(43);
    const redirect = 'http://127.0.0.1:43119/callback';
    const registration = await oauth.registerClient(
      {
        redirect_uris: [redirect],
        client_name: 'DCR E2E',
        scope: 'knowledge.read pages.edit',
      },
      '127.0.0.1',
    );
    const authorize = await oauth.start({
      client_id: registration.client_id,
      redirect_uri: redirect,
      response_type: 'code',
      resource: 'http://127.0.0.1:45678/mcp',
      scope: 'knowledge.read pages.edit',
      state: 'dcr-state',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const requestId = new URL(authorize).searchParams.get('request_id')!;
    const consent = await oauth.consent(requestId, actor);
    expect(consent.application_verified).toBe(false);
    expect(consent.requested_scopes).toEqual([
      'knowledge.read',
      'pages.edit',
    ]);
    const decision = await oauth.decide(
      requestId,
      actor,
      {
        decision: 'allow',
        space_ids: [ids.space],
        scopes: ['knowledge.read', 'pages.edit'],
        duration_days: 1,
      },
      consent.csrf_token,
    );
    const code = new URL(decision.redirect_url).searchParams.get('code')!;
    const token = await oauth.token(
      {
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code,
        redirect_uri: redirect,
        code_verifier: verifier,
        resource: 'http://127.0.0.1:45678/mcp',
      },
      { method: 'none' },
    );
    expect(token.access_token).toMatch(/^dma_/);
    const principal = await oauth.authenticate(token.access_token!);
    expect(principal.spaceIds).toEqual([ids.space]);
    const context = await commands.editContext({
      workspaceId: ids.workspace,
      userId: ids.user,
      pageId: ids.page,
      ...principal,
    });
    const result = await commands.edit(
      {
        workspaceId: ids.workspace,
        userId: ids.user,
        pageId: ids.page,
        ...principal,
      },
      {
        key: 'dcr-write',
        versionToken: context.token,
        commands: [{ type: 'append', text: 'DCR content' }],
      },
      (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
    );
    expect(result.status).toBe('committed');
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${ids.page}`)[0].content,
      ),
    ).toContain('DCR content');
  });

  test('create is idempotency-recorded but never replays the plaintext token', async () => {
    const requestId = randomUUID();
    const payload = {
      name: 'idempotent',
      spaceIds: [ids.space],
      scopes: ['knowledge.read'] as const,
      requestId,
    };
    const created = await tokens.createMcpToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      { ...payload, scopes: [...payload.scopes] },
    );
    await expect(
      tokens.createMcpToken(
        { id: ids.user, name: 'User', email: 'u@example.com' } as any,
        { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
        actor,
        { ...payload, scopes: [...payload.scopes] },
      ),
    ).rejects.toThrow('CREATE_RESULT_UNKNOWN');
    const list = await tokens.listMcpTokens(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      {},
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0].id).toBe(created.id);
    expect(list.items[0].scopes).toEqual(['knowledge.read']);
    expect((list.items[0] as any).token).toBeUndefined();
    const detail = await tokens.mcpTokenDetail(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      created.id,
    );
    expect(detail.id).toBe(created.id);
    expect(detail.spaces).toEqual([{ id: ids.space, name: 'space' }]);
  });

  test('expired scoped token is rejected and cannot be used for writes', async () => {
    const created = await tokens.createMcpToken(
      { id: ids.user, name: 'User', email: 'u@example.com' } as any,
      { id: ids.workspace, settings: { ai: { mcp: true } } } as any,
      actor,
      {
        name: 'expires',
        spaceIds: [ids.space],
        scopes: ['knowledge.read'],
        requestId: randomUUID(),
      },
    );
    await pg`UPDATE sc_api_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${created.id}`;
    await expect(
      tokens.validateApiToken(request('/mcp', created.token), {
        apiKeyId: created.id,
        sub: ids.user,
        workspaceId: ids.workspace,
      }),
    ).rejects.toThrow('Token expired');
  });

  test('DCR limit, disabled mode and unknown fields are rejected', async () => {
    process.env.AGENT_OAUTH_DCR_MAX_CLIENTS_PER_IP = '2';
    await pg`DELETE FROM agent_oauth_clients WHERE source='dcr'`;
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['http://127.0.0.1:43119/callback'],
          client_name: 'one',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).resolves.toBeTruthy();
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['http://127.0.0.1:43120/callback'],
          client_name: 'two',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).resolves.toBeTruthy();
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['http://127.0.0.1:43121/callback'],
          client_name: 'three',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['http://127.0.0.1:43122/callback'],
          client_name: 'unknown',
          scope: 'knowledge.read',
          dangerous_metadata: 'https://evil.example',
        },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
    process.env.AGENT_OAUTH_DCR_ENABLED = 'false';
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['http://127.0.0.1:43123/callback'],
          client_name: 'disabled',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
    process.env.AGENT_OAUTH_DCR_ENABLED = 'true';
    delete process.env.AGENT_OAUTH_DCR_MAX_CLIENTS_PER_IP;
  });

  test('DCR registers a public client without granting resources and rejects unsafe redirects', async () => {
    const registration = await oauth.registerClient(
      {
        redirect_uris: ['http://127.0.0.1:43119/callback'],
        client_name: '豆包工作',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'knowledge.read pages.edit',
      },
      '127.0.0.1',
    );
    expect(registration.client_id).toBeTruthy();
    expect(registration.scope).toBe('knowledge.read pages.edit');
    const row = (
      await pg`SELECT source,type,redirect_uris FROM agent_oauth_clients WHERE id=${registration.client_id}`
    )[0];
    expect(row.source).toBe('dcr');
    expect(row.type).toBe('public');
    expect(row.redirect_uris).toEqual(['http://127.0.0.1:43119/callback']);
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['https://evil.example/callback'],
          client_name: 'evil',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).resolves.toBeTruthy();
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['http://localhost/callback'],
          client_name: 'bad',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
    await expect(
      oauth.registerClient(
        {
          redirect_uris: ['https://evil.example/callback#fragment'],
          client_name: 'bad',
          scope: 'knowledge.read',
        },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
  });
});
