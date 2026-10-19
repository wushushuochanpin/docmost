// Real OAuth library + PG model; fixture authentication is NOT a production consent endpoint.
import { randomBytes, randomUUID } from 'node:crypto';
import { db, hash, fail, Store, principal } from './store';
const OAuth = require(process.env.P0_OAUTH_MODULE!);
export const resource = 'https://p0.invalid/mcp';
export const redirect = 'http://127.0.0.1:39111/callback';
const client = {
  id: 'client',
  grants: ['authorization_code', 'refresh_token'],
  redirectUris: [redirect],
};
export class OAuthProbe {
  constructor(readonly sql: ReturnType<typeof db>) {}
  private model(tx: any) {
    let family: string | undefined;
    return {
      getClient: async (id: string) => (id === client.id ? client : false),
      validateRedirectUri: async (uri: string) => uri === redirect,
      validateScope: async (
        _user: unknown,
        _client: unknown,
        scopes: string[],
      ) => {
        const grant = await new Store(this.sql).authorize(tx, principal);
        return scopes.every((s) => grant.scopes.includes(s)) ? scopes : false;
      },
      generateAccessToken: async () =>
        'dma_' + randomBytes(32).toString('base64url'),
      generateRefreshToken: async () =>
        'dmr_' + randomBytes(32).toString('base64url'),
      saveAuthorizationCode: async (code: any, app: any, user: any) => {
        const { authorizationCode, ...metadata } = code;
        const data = { ...metadata, client: app, user, resource };
        await tx`INSERT INTO oauth_codes(hash,data) VALUES(${hash(authorizationCode)},${tx.json(data)})`;
        return { ...data, authorizationCode };
      },
      getAuthorizationCode: async (code: string) => {
        const [row] =
          await tx`SELECT * FROM oauth_codes WHERE hash=${hash(code)} FOR UPDATE`;
        if (!row || row.consumed || row.data.resource !== resource)
          return false;
        return {
          ...row.data,
          authorizationCode: code,
          expiresAt: new Date(row.data.expiresAt),
        };
      },
      revokeAuthorizationCode: async (code: any) => {
        const rows =
          await tx`UPDATE oauth_codes SET consumed=true WHERE hash=${hash(code.authorizationCode)} AND consumed=false RETURNING hash`;
        return rows.length === 1;
      },
      getRefreshToken: async (token: string) => {
        const [locator] =
          await tx`SELECT family FROM oauth_tokens WHERE refresh_hash=${hash(token)}`;
        if (!locator) return false;
        const [familyRow] =
          await tx`SELECT * FROM oauth_families WHERE id=${locator.family} FOR UPDATE`;
        const [row] =
          await tx`SELECT * FROM oauth_tokens WHERE refresh_hash=${hash(token)} FOR UPDATE`;
        if (!row || familyRow.revoked) return false;
        family = row.family;
        if (row.consumed) {
          await tx`UPDATE oauth_families SET revoked=true WHERE id=${family}`;
          return false;
        }
        return {
          ...row.data,
          refreshToken: token,
          refreshTokenExpiresAt: new Date(row.data.refreshTokenExpiresAt),
        };
      },
      revokeToken: async (token: any) =>
        (
          await tx`UPDATE oauth_tokens SET consumed=true WHERE refresh_hash=${hash(token.refreshToken)} AND consumed=false RETURNING access_hash`
        ).length === 1,
      saveToken: async (token: any, app: any, user: any) => {
        const grant = await new Store(this.sql).authorize(tx, principal);
        if (!family) {
          family = randomUUID();
          await tx`INSERT INTO oauth_families(id,grant_id) VALUES(${family},'grant')`;
        }
        const { accessToken, refreshToken, ...metadata } = token;
        const data = {
          ...metadata,
          accessTokenExpiresAt: new Date(
            Math.min(+token.accessTokenExpiresAt, +grant.expires_at),
          ),
          refreshTokenExpiresAt: new Date(
            Math.min(+token.refreshTokenExpiresAt, +grant.expires_at),
          ),
          client: app,
          user,
          resource,
        };
        await tx`INSERT INTO oauth_tokens(access_hash,refresh_hash,family,data) VALUES(${hash(accessToken)},${hash(refreshToken)},${family},${tx.json(data)})`;
        return { ...data, accessToken, refreshToken };
      },
    };
  }
  async authorize(query: Record<string, string>) {
    if (query.resource !== resource) fail('invalid_target');
    if (query.code_challenge_method !== 'S256') fail('invalid_request');
    return this.sql.begin(async (tx) => {
      await new Store(this.sql).authorize(tx, principal);
      const server = new OAuth({
        model: this.model(tx),
        requirePKCE: true,
        enablePlainPKCE: false,
        authorizationCodeLifetime: 60,
      });
      return server.authorize(
        new OAuth.Request({ method: 'GET', query, headers: {} }),
        new OAuth.Response(),
        {
          authenticateHandler: { handle: async () => ({ id: 'user' }) },
        },
      );
    });
  }
  async token(body: Record<string, string>) {
    if (body.resource !== resource) fail('invalid_target');
    const outcome: any = await this.sql.begin(async (tx) => {
      await new Store(this.sql).authorize(tx, principal);
      const server = new OAuth({
        model: this.model(tx),
        requirePKCE: true,
        enablePlainPKCE: false,
        accessTokenLifetime: 600,
        refreshTokenLifetime: 30 * 86400,
      });
      try {
        return {
          value: await server.token(
            new OAuth.Request({
              method: 'POST',
              query: {},
              body,
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'content-length': String(
                  Buffer.byteLength(new URLSearchParams(body).toString()),
                ),
              },
            }),
            new OAuth.Response(),
            {
              requireClientAuthentication: {
                authorization_code: false,
                refresh_token: false,
              },
            },
          ),
        };
      } catch (error: any) {
        // Commit consumed-code / replay-revocation facts, but roll back storage failures.
        if (
          [
            'invalid_grant',
            'invalid_request',
            'invalid_scope',
            'invalid_client',
          ].includes(error.name)
        )
          return { error };
        throw error;
      }
    });
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }
  async authenticate(token: string, target = resource) {
    if (target !== resource) fail('invalid_target');
    const [row] = await this
      .sql`SELECT t.data FROM oauth_tokens t JOIN oauth_families f ON f.id=t.family JOIN grants g ON g.id=f.grant_id
      WHERE t.access_hash=${hash(token)} AND NOT f.revoked AND g.active AND g.expires_at>clock_timestamp()
      AND (t.data->>'accessTokenExpiresAt')::timestamptz>clock_timestamp()`;
    if (!row) fail('UNAUTHENTICATED');
    return row.data;
  }
}
