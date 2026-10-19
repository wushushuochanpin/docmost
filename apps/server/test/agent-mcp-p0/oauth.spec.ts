import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import * as Y from 'yjs';
import { db, Store, hash } from './store';
import { OAuthProbe, resource, redirect } from './oauth-probe';
const sql = db('p0_oauth');
const probe = new OAuthProbe(sql);
const verifier = () => randomBytes(32).toString('base64url');
const challenge = (v: string) =>
  createHash('sha256').update(v).digest('base64url');
const query = (v: string) => ({
  client_id: 'client',
  redirect_uri: redirect,
  response_type: 'code',
  state: 'random-fixture-state',
  scope: 'knowledge.read pages.edit',
  resource,
  code_challenge: challenge(v),
  code_challenge_method: 'S256',
});
const exchange = (code: string, v: string) => ({
  grant_type: 'authorization_code',
  client_id: 'client',
  redirect_uri: redirect,
  resource,
  code,
  code_verifier: v,
});
beforeAll(async () => {
  await sql`CREATE SCHEMA p0_oauth`;
  await sql.unsafe(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
});
beforeEach(async () => {
  await sql`TRUNCATE grants,documents,permits,operations,history,outbox,journal,oauth_codes,oauth_families,oauth_tokens CASCADE`;
  const d = new Y.Doc();
  await new Store(sql).seed(Y.encodeStateAsUpdate(d));
  d.destroy();
});
afterAll(async () => {
  await sql.end();
});
describe('P0 AC-01/02 real OAuth 5.3.1 + PostgreSQL', () => {
  test('S256 authorizes, issues resource-bound opaque tokens and stores hashes only', async () => {
    const v = verifier();
    const code = await probe.authorize(query(v));
    const token = await probe.token(exchange(code.authorizationCode, v));
    expect(token.accessToken).toMatch(/^dma_/);
    expect(token.refreshToken).toMatch(/^dmr_/);
    expect((await probe.authenticate(token.accessToken)).scope).toContain(
      'pages.edit',
    );
    const dump = JSON.stringify(await sql`SELECT * FROM oauth_tokens`);
    expect(dump).not.toContain(token.accessToken);
    expect(dump).not.toContain(token.refreshToken);
    expect(JSON.stringify(await sql`SELECT * FROM oauth_codes`)).not.toContain(
      code.authorizationCode,
    );
    expect(+token.accessTokenExpiresAt - Date.now()).toBeLessThanOrEqual(
      600000,
    );
    await expect(
      probe.authenticate(token.accessToken, 'https://foreign.invalid/mcp'),
    ).rejects.toThrow('invalid_target');
  });
  test.each(['missing-pkce', 'plain', 'redirect', 'resource', 'scope'])(
    'rejects %s authorization',
    async (kind) => {
      const q = query(verifier());
      if (kind === 'missing-pkce') q.code_challenge = '';
      if (kind === 'plain') q.code_challenge_method = 'plain';
      if (kind === 'redirect') q.redirect_uri = 'https://evil.invalid/callback';
      if (kind === 'resource') q.resource = 'https://evil.invalid/mcp';
      if (kind === 'scope') q.scope = 'knowledge.read pages.delete';
      await expect(probe.authorize(q)).rejects.toThrow();
      expect(await sql`SELECT * FROM oauth_codes`).toHaveLength(0);
    },
  );
  test('concurrent authorization-code exchanges consume once', async () => {
    const v = verifier();
    const code = await probe.authorize(query(v));
    const results = await Promise.allSettled([
      probe.token(exchange(code.authorizationCode, v)),
      probe.token(exchange(code.authorizationCode, v)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await sql`SELECT * FROM oauth_tokens`).toHaveLength(1);
  });
  test('wrong verifier consumes code without issuing tokens', async () => {
    const v = verifier();
    const code = await probe.authorize(query(v));
    await expect(
      probe.token(exchange(code.authorizationCode, verifier())),
    ).rejects.toMatchObject({ name: 'invalid_grant' });
    expect((await sql`SELECT consumed FROM oauth_codes`)[0].consumed).toBe(
      true,
    );
    await expect(
      probe.token(exchange(code.authorizationCode, v)),
    ).rejects.toMatchObject({ name: 'invalid_grant' });
    expect(await sql`SELECT * FROM oauth_tokens`).toHaveLength(0);
  });
  test('expired codes and wrong token resource are rejected', async () => {
    const v = verifier();
    const code = await probe.authorize(query(v));
    await expect(
      probe.token({
        ...exchange(code.authorizationCode, v),
        resource: 'https://evil.invalid/mcp',
      }),
    ).rejects.toThrow('invalid_target');
    await sql`UPDATE oauth_codes SET data=jsonb_set(data,'{expiresAt}',to_jsonb(clock_timestamp()-interval '1 minute')) WHERE hash=${hash(code.authorizationCode)}`;
    await expect(
      probe.token(exchange(code.authorizationCode, v)),
    ).rejects.toMatchObject({ name: 'invalid_grant' });
  });
  test('refresh rotates and replay revokes the entire family even though request fails', async () => {
    const v = verifier();
    const code = await probe.authorize(query(v));
    const first = await probe.token(exchange(code.authorizationCode, v));
    const body = {
      grant_type: 'refresh_token',
      client_id: 'client',
      resource,
      refresh_token: first.refreshToken,
    };
    const next = await probe.token(body);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    await expect(probe.token(body)).rejects.toMatchObject({
      name: 'invalid_grant',
    });
    await expect(probe.authenticate(first.accessToken)).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    await expect(probe.authenticate(next.accessToken)).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    expect((await sql`SELECT revoked FROM oauth_families`)[0].revoked).toBe(
      true,
    );
  });
  test('grant revocation prevents access and refresh', async () => {
    const v = verifier();
    const code = await probe.authorize(query(v));
    const token = await probe.token(exchange(code.authorizationCode, v));
    await new Store(sql).revoke();
    await expect(probe.authenticate(token.accessToken)).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    await expect(
      probe.token({
        grant_type: 'refresh_token',
        client_id: 'client',
        resource,
        refresh_token: token.refreshToken,
      }),
    ).rejects.toThrow('SCOPE_DENIED');
  });
});
