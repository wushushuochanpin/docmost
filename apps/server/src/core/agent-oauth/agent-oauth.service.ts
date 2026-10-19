import { agentTelemetry } from '../agent-operations/agent-telemetry';
import { agentPolicy } from '../document-command/agent-quota';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as z from 'zod/v4';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import {
  OAUTH_SCOPES,
  exactParameters,
  matchesRedirect,
  oauthError,
  opaque,
  scopeSet,
  secretHash,
  validateRedirect,
} from './oauth-contract';
// The library exports a CommonJS constructor; support production tsc and test interop.
import * as OAuthLibrary from '@node-oauth/oauth2-server';
const OAuth: any = (OAuthLibrary as any).default ?? OAuthLibrary;
type SessionActor = { userId: string; workspaceId: string; sessionId: string };
type Client = {
  id: string;
  name: string;
  type: 'public' | 'confidential';
  redirectUris: string[];
  scopes: string[];
  origins: string[];
  secretHash: string | null;
  version: string;
  active: boolean;
};

@Injectable()
export class AgentOAuthService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly members: SpaceMemberRepo,
  ) {}
  onModuleInit() {
    if (process.env.AGENT_OAUTH_ENABLED === 'true') {
      void this.origin;
      this.key();
    }
  }
  assertEnabled() {
    this.enabled();
  }
  get origin() {
    let url: URL;
    try {
      url = new URL(process.env.AGENT_OAUTH_ORIGIN ?? '');
    } catch {
      throw new Error('AGENT_OAUTH_ORIGIN_REQUIRED');
    }
    if (
      url.origin !== process.env.AGENT_OAUTH_ORIGIN ||
      (url.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV === 'test' &&
          ['127.0.0.1', '[::1]'].includes(url.hostname)
        ))
    )
      throw new Error('INVALID_AGENT_OAUTH_ORIGIN');
    return url.origin;
  }
  get resource() {
    return this.origin + '/mcp';
  }
  private enabled() {
    if (process.env.AGENT_OAUTH_ENABLED !== 'true')
      throw new ForbiddenException('MCP_DISABLED');
  }
  private async tx<T>(
    fn: (trx: KyselyTransaction) => Promise<T>,
    exclusive = false,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('lock_timeout','2s',true),set_config('statement_timeout','5s',true)`.execute(
        trx,
      );
      if (exclusive)
        await sql`select pg_advisory_xact_lock(20261018,1)`.execute(trx);
      else
        await sql`select pg_advisory_xact_lock_shared(20261018,1)`.execute(trx);
      return fn(trx);
    });
  }
  private async tenant(trx: KyselyTransaction, id: string) {
    await sql`select set_config('app.workspace_id',${id},true)`.execute(trx);
  }
  async assertSession(trx: KyselyTransaction, actor: SessionActor) {
    if (!actor.sessionId) throw new UnauthorizedException();
    const session = await trx
      .selectFrom('userSessions as s')
      .innerJoin('users as u', 'u.id', 's.userId')
      .select('s.id')
      .where('s.id', '=', actor.sessionId)
      .where('s.userId', '=', actor.userId)
      .where('s.workspaceId', '=', actor.workspaceId)
      .where('u.workspaceId', '=', actor.workspaceId)
      .where('s.revokedAt', 'is', null)
      .where('s.expiresAt', '>', new Date())
      .where('u.deletedAt', 'is', null)
      .where('u.deactivatedAt', 'is', null)
      .executeTakeFirst();
    if (!session) throw new UnauthorizedException();
  }
  private async client(trx: KyselyTransaction, id: string): Promise<Client> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id ?? '',
      )
    )
      return oauthError('invalid_client');
    const row = (
      await sql<Client>`select *,version::text from agent_oauth_clients where id=${id}::uuid and active`.execute(
        trx,
      )
    ).rows[0];
    if (!row) return oauthError('invalid_client');
    return row;
  }
  async register(
    actor: SessionActor,
    input: {
      name: string;
      type: 'public' | 'confidential';
      redirect_uris: string[];
      scopes: string[];
      origins: string[];
    },
  ) {
    this.enabled();
    const parsed = z
      .strictObject({
        name: z.string().trim().min(1).max(100),
        type: z.enum(['public', 'confidential']),
        redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
        scopes: z.array(z.enum(OAUTH_SCOPES)).min(1).max(4),
        origins: z.array(z.string().max(2048)).max(10),
      })
      .safeParse(input);
    if (!parsed.success) return oauthError('invalid_request');
    input = parsed.data;
    const admins = (process.env.AGENT_OAUTH_ADMIN_USER_IDS ?? '').split(',');
    if (!admins.includes(actor.userId)) throw new ForbiddenException();
    if (
      !input.name?.trim() ||
      input.name.length > 100 ||
      !['public', 'confidential'].includes(input.type) ||
      !Array.isArray(input.redirect_uris) ||
      !input.redirect_uris.length ||
      input.redirect_uris.length > 10 ||
      !Array.isArray(input.origins) ||
      input.origins.length > 10
    )
      return oauthError('invalid_request');
    input.redirect_uris.forEach((uri) =>
      validateRedirect(uri, input.type === 'public'),
    );
    scopeSet(input.scopes?.join(' '));
    input.origins.forEach((value) => {
      const u = validateRedirect(value, input.type === 'public');
      if (u.origin !== value) oauthError('invalid_request');
    });
    const id = randomUUID();
    const secret = input.type === 'confidential' ? opaque('') : undefined;
    await this.tx(async (trx) => {
      await this.assertSession(trx, actor);
      await sql`insert into agent_oauth_clients(id,name,type,redirect_uris,scopes,origins,secret_hash)
      values(${id}::uuid,${input.name.trim()},${input.type},${input.redirect_uris},${input.scopes},${input.origins},${secret ? secretHash(secret) : null})`.execute(
        trx,
      );
    }, true);
    return { client_id: id, ...(secret ? { client_secret: secret } : {}) };
  }
  async start(...args: Parameters<AgentOAuthService['startInternal']>) {
    return agentTelemetry.measure('oauth_authorize', () =>
      this.startInternal(...args),
    );
  }
  private async startInternal(value: unknown) {
    this.enabled();
    const q = exactParameters(value, [
      'client_id',
      'redirect_uri',
      'response_type',
      'resource',
      'scope',
      'state',
      'code_challenge',
      'code_challenge_method',
    ]);
    if (
      q.response_type !== 'code' ||
      q.resource !== this.resource ||
      !q.state ||
      Buffer.byteLength(q.state) > 1024 ||
      q.code_challenge_method !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? '')
    )
      return oauthError('invalid_request');
    const scopes = scopeSet(q.scope);
    const id = randomUUID();
    await this.tx(async (trx) => {
      const client = await this.client(trx, q.client_id);
      if (
        !matchesRedirect(
          q.redirect_uri,
          client.redirectUris,
          client.type === 'public',
        )
      )
        return oauthError('invalid_request');
      if (scopes.some((scope) => !client.scopes.includes(scope)))
        return oauthError('invalid_scope');
      await sql`insert into agent_oauth_requests(id,client_id,client_version,parameters,expires_at) values(${id}::uuid,${client.id}::uuid,${client.version}::bigint,${JSON.stringify(q)}::text::jsonb,clock_timestamp()+interval '10 minutes')`.execute(
        trx,
      );
    });
    return this.origin + '/oauth/consent?request_id=' + id;
  }
  private async request(
    trx: KyselyTransaction,
    id: string,
    actor: SessionActor,
  ) {
    await this.assertSession(trx, actor);
    const row = (
      await sql<any>`select *,parameters::text as parameters_json from agent_oauth_requests where id=${id}::uuid for update`.execute(
        trx,
      )
    ).rows[0];
    if (
      !row ||
      +new Date(row.expiresAt) <= Date.now() ||
      (row.userId &&
        (row.userId !== actor.userId ||
          row.sessionId !== actor.sessionId ||
          row.workspaceId !== actor.workspaceId))
    )
      return oauthError('invalid_request');
    row.parameters = JSON.parse(row.parametersJson);
    const client = await this.client(trx, row.clientId);
    if (String(row.clientVersion) !== String(client.version))
      return oauthError('invalid_request');
    if (!row.userId)
      await sql`update agent_oauth_requests set user_id=${actor.userId}::uuid,workspace_id=${actor.workspaceId}::uuid,session_id=${actor.sessionId}::uuid where id=${id}::uuid`.execute(
        trx,
      );
    return { row, client };
  }
  async consent(id: string, actor: SessionActor) {
    this.enabled();
    return this.tx(async (trx) => {
      const { row, client } = await this.request(trx, id, actor);
      await this.tenant(trx, actor.workspaceId);
      const policy = await agentPolicy(trx, actor.workspaceId);
      const accessible = (
        await sql<{
          id: string;
          name: string;
        }>`select s.id,s.name from spaces s where s.workspace_id=${actor.workspaceId}::uuid
      and exists(select 1 from space_members m left join group_users gu on gu.group_id=m.group_id
        where m.space_id=s.id and (m.user_id=${actor.userId}::uuid or gu.user_id=${actor.userId}::uuid))
      order by s.id limit 100`.execute(trx)
      ).rows;
      return {
        id,
        application: client.name,
        redirect_origin: new URL(row.parameters.redirect_uri).origin,
        scopes: row.parameters.scope
          .split(' ')
          .filter(
            (scope: string) => policy.enabled || scope === 'knowledge.read',
          ),
        max_grant_days: policy.maxGrantDays,
        spaces: accessible.slice(0, 100),
        expires_at: row.expiresAt,
        consumed: row.consumed,
        csrf_token: this.csrf(id, actor),
      };
    });
  }
  private key() {
    const key = Buffer.from(
      process.env.AGENT_OAUTH_RESPONSE_KEY ?? '',
      'base64',
    );
    if (key.length !== 32) throw new Error('AGENT_OAUTH_RESPONSE_KEY_REQUIRED');
    return key;
  }
  managementCsrf(actor: SessionActor) {
    return this.csrf('agent-management', actor);
  }
  private csrf(id: string, actor: SessionActor) {
    return createHmac('sha256', this.key())
      .update(id + '\0' + actor.sessionId + '\0' + actor.userId)
      .digest('hex');
  }
  private seal(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    return Buffer.concat([
      iv,
      cipher.update(value),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
  }
  private unseal(value: Buffer) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      value.subarray(0, 12),
    );
    decipher.setAuthTag(value.subarray(-16));
    return Buffer.concat([
      decipher.update(value.subarray(12, -16)),
      decipher.final(),
    ]).toString();
  }
  async decide(
    id: string,
    actor: SessionActor,
    input: {
      decision: 'allow' | 'deny';
      space_ids: string[];
      scopes: string[];
      duration_days: number;
    },
    csrf: string,
  ) {
    this.enabled();
    const parsed = z
      .strictObject({
        decision: z.enum(['allow', 'deny']),
        space_ids: z.array(z.uuid()).max(100),
        scopes: z.array(z.enum(OAUTH_SCOPES)).max(4),
        duration_days: z.number().int(),
      })
      .safeParse(input);
    if (!parsed.success) return oauthError('invalid_request');
    input = parsed.data;
    if (csrf !== this.csrf(id, actor))
      throw new ForbiddenException('CSRF_REJECTED');
    return this.tx(async (trx) => {
      const { row, client } = await this.request(trx, id, actor);
      await this.tenant(trx, actor.workspaceId);
      if (row.consumed) {
        if (row.response && +new Date(row.responseUntil) > Date.now())
          return { redirect_url: this.unseal(row.response) };
        return oauthError('invalid_request');
      }
      const redirect = new URL(row.parameters.redirect_uri);
      redirect.searchParams.set('state', row.parameters.state);
      redirect.searchParams.set('iss', this.origin);
      if (input.decision === 'deny')
        redirect.searchParams.set('error', 'access_denied');
      else if (input.decision === 'allow') {
        const policy = await agentPolicy(trx, actor.workspaceId);
        if (
          input.duration_days > policy.maxGrantDays ||
          (!policy.enabled &&
            input.scopes.some((scope) => scope !== 'knowledge.read'))
        )
          return oauthError('invalid_scope');
        const scopes = scopeSet(input.scopes?.join(' '));
        if (
          scopes.some((s) => !row.parameters.scope.split(' ').includes(s)) ||
          ![1, 7, 30, 90].includes(input.duration_days) ||
          !Array.isArray(input.space_ids) ||
          !input.space_ids.length ||
          input.space_ids.length > 100 ||
          new Set(input.space_ids).size !== input.space_ids.length
        )
          return oauthError('invalid_scope');
        for (const id of input.space_ids) {
          const space = await trx
            .selectFrom('spaces')
            .select('id')
            .where('id', '=', id)
            .where('workspaceId', '=', actor.workspaceId)
            .executeTakeFirst();
          if (
            !space ||
            !(await this.members.getUserSpaceRoles(actor.userId, id, trx))
              ?.length
          )
            return oauthError('invalid_scope');
        }
        const grantId = randomUUID();
        await sql`insert into document_agent_grants(id,workspace_id,user_id,client_id,space_ids,scopes,expires_at) values(${grantId}::uuid,${actor.workspaceId}::uuid,${actor.userId}::uuid,${client.id},${input.space_ids}::uuid[],${scopes},clock_timestamp()+${input.duration_days}*interval '1 day')`.execute(
          trx,
        );
        const server = this.server(
          this.model(trx, client, { grantId, workspaceId: actor.workspaceId }),
        );
        const code = await server.authorize(
          new OAuth.Request({
            method: 'GET',
            query: { ...row.parameters, scope: scopes.join(' ') },
            headers: {},
          }),
          new OAuth.Response(),
          {
            authenticateHandler: { handle: async () => ({ id: actor.userId }) },
          },
        );
        redirect.searchParams.set('code', code.authorizationCode);
      } else return oauthError('invalid_request');
      const response = redirect.toString();
      await sql`update agent_oauth_requests set consumed=true,response=${this.seal(response)},response_until=clock_timestamp()+interval '60 seconds' where id=${id}::uuid`.execute(
        trx,
      );
      return { redirect_url: response };
    }, true);
  }
  private server(model: any) {
    return new OAuth({
      model,
      requirePKCE: true,
      enablePlainPKCE: false,
      authorizationCodeLifetime: 60,
      accessTokenLifetime: 600,
      refreshTokenLifetime: 90 * 86400,
    });
  }
  private async grant(
    trx: KyselyTransaction,
    workspaceId: string,
    grantId: string,
    clientId: string,
  ) {
    await this.tenant(trx, workspaceId);
    const g = (
      await sql<any>`select g.* from document_agent_grants g join users u on u.id=g.user_id and u.workspace_id=g.workspace_id
      where g.id=${grantId}::uuid and g.client_id=${clientId} and g.revoked_at is null and g.expires_at>clock_timestamp() and u.deleted_at is null and u.deactivated_at is null for share of g`.execute(
        trx,
      )
    ).rows[0];
    if (!g) return oauthError('invalid_grant');
    return g;
  }
  private model(
    trx: KyselyTransaction,
    client: Client,
    binding?: { grantId: string; workspaceId: string },
    onReplay?: () => void,
  ) {
    let bound = binding;
    let family: string | undefined;
    const app = {
      id: client.id,
      grants: ['authorization_code', 'refresh_token'],
      redirectUris: client.redirectUris,
    };
    return {
      getClient: async (id: string) => (id === client.id ? app : false),
      validateRedirectUri: async (uri: string) =>
        matchesRedirect(uri, client.redirectUris, client.type === 'public'),
      validateScope: async (_u: any, _c: any, scopes: string[]) =>
        scopes.every((s) => client.scopes.includes(s)) ? scopes : false,
      generateAccessToken: async () => opaque('dma_'),
      generateRefreshToken: async () => opaque('dmr_'),
      saveAuthorizationCode: async (code: any, _app: any, user: any) => {
        const { authorizationCode, ...data } = code;
        const metadata = {
          ...data,
          client: app,
          user,
          resource: this.resource,
        };
        await sql`insert into agent_oauth_codes(hash,client_id,workspace_id,grant_id,metadata,expires_at) values(${secretHash(authorizationCode)},${client.id}::uuid,${bound.workspaceId}::uuid,${bound.grantId}::uuid,${JSON.stringify(metadata)}::text::jsonb,${code.expiresAt})`.execute(
          trx,
        );
        return { ...metadata, authorizationCode };
      },
      getAuthorizationCode: async (code: string) => {
        const row = (
          await sql<any>`select * from agent_oauth_codes where hash=${secretHash(code)} and client_id=${client.id}::uuid for update`.execute(
            trx,
          )
        ).rows[0];
        if (!row || row.consumed || row.metadata.resource !== this.resource)
          return false;
        bound = { workspaceId: row.workspaceId, grantId: row.grantId };
        await this.grant(trx, bound.workspaceId, bound.grantId, client.id);
        return {
          ...row.metadata,
          authorizationCode: code,
          expiresAt: new Date(row.expiresAt),
        };
      },
      revokeAuthorizationCode: async (code: any) => {
        await sql`update agent_oauth_codes set consumed=true where hash=${secretHash(code.authorizationCode)}`.execute(
          trx,
        );
        return true;
      },
      getRefreshToken: async (token: string) => {
        const row = (
          await sql<any>`select t.*,f.id as family_id,f.workspace_id,f.grant_id,f.revoked from agent_oauth_tokens t join agent_oauth_families f on f.id=t.family_id where refresh_hash=${secretHash(token)} and f.client_id=${client.id}::uuid for update of f,t`.execute(
            trx,
          )
        ).rows[0];
        if (!row || row.revoked || row.metadata.resource !== this.resource)
          return false;
        if (row.consumed) {
          onReplay?.();
          await sql`update agent_oauth_families set revoked=true where id=${row.familyId}::uuid`.execute(
            trx,
          );
          return false;
        }
        bound = { workspaceId: row.workspaceId, grantId: row.grantId };
        family = row.familyId;
        await this.grant(trx, bound.workspaceId, bound.grantId, client.id);
        return {
          ...row.metadata,
          refreshToken: token,
          refreshTokenExpiresAt: new Date(row.refreshExpiresAt),
        };
      },
      revokeToken: async (token: any) => {
        await sql`update agent_oauth_tokens set consumed=true where refresh_hash=${secretHash(token.refreshToken)}`.execute(
          trx,
        );
        return true;
      },
      saveToken: async (token: any, _app: any, user: any) => {
        const grant = await this.grant(
          trx,
          bound.workspaceId,
          bound.grantId,
          client.id,
        );
        if (!family) {
          family = randomUUID();
          await sql`insert into agent_oauth_families(id,client_id,workspace_id,grant_id) values(${family}::uuid,${client.id}::uuid,${bound.workspaceId}::uuid,${bound.grantId}::uuid)`.execute(
            trx,
          );
        }
        const { accessToken, refreshToken, ...rest } = token;
        const metadata = {
          ...rest,
          client: app,
          user,
          resource: this.resource,
          scope: token.scope.filter((s: string) => grant.scopes.includes(s)),
          accessTokenExpiresAt: new Date(
            Math.min(+token.accessTokenExpiresAt, +new Date(grant.expiresAt)),
          ),
          refreshTokenExpiresAt: new Date(
            Math.min(+token.refreshTokenExpiresAt, +new Date(grant.expiresAt)),
          ),
        };
        await sql`insert into agent_oauth_tokens(access_hash,refresh_hash,family_id,metadata,access_expires_at,refresh_expires_at) values(${secretHash(accessToken)},${secretHash(refreshToken)},${family}::uuid,${JSON.stringify(metadata)}::text::jsonb,${metadata.accessTokenExpiresAt},${metadata.refreshTokenExpiresAt})`.execute(
          trx,
        );
        return { ...metadata, accessToken, refreshToken };
      },
    };
  }
  private authenticateClient(
    client: Client,
    secret: string | undefined,
    method: 'basic' | 'none',
  ) {
    if (client.type === 'public') {
      if (method !== 'none' || secret) return oauthError('invalid_client');
      return;
    }
    if (method !== 'basic' || !secret || !client.secretHash)
      return oauthError('invalid_client');
    const hash = secretHash(secret);
    if (!timingSafeEqual(Buffer.from(hash), Buffer.from(client.secretHash)))
      return oauthError('invalid_client');
  }
  async token(...args: Parameters<AgentOAuthService['tokenInternal']>) {
    return agentTelemetry.measure('oauth_token', () =>
      this.tokenInternal(...args),
    );
  }
  private async tokenInternal(
    value: unknown,
    credentials: { id?: string; secret?: string; method: 'basic' | 'none' },
    origin?: string,
  ) {
    this.enabled();
    const body = exactParameters(value, [
      'grant_type',
      'client_id',
      'code',
      'redirect_uri',
      'code_verifier',
      'refresh_token',
      'resource',
      'scope',
    ]);
    if (
      !['authorization_code', 'refresh_token'].includes(body.grant_type) ||
      body.resource !== this.resource
    )
      return oauthError('invalid_request');
    if (credentials.id && body.client_id && credentials.id !== body.client_id)
      return oauthError('invalid_client');
    const outcome = await this.tx(async (trx) => {
      const client = await this.client(trx, credentials.id ?? body.client_id);
      this.authenticateClient(client, credentials.secret, credentials.method);
      if (origin && origin !== this.origin && !client.origins.includes(origin))
        throw new ForbiddenException('ORIGIN_REJECTED');
      let replay = false;
      try {
        const token = await this.server(
          this.model(trx, client, undefined, () => {
            replay = true;
            agentTelemetry.increment('refresh_replay');
          }),
        ).token(
          new OAuth.Request({
            method: 'POST',
            query: {},
            body: { ...body, client_id: client.id },
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
        );
        return {
          value: {
            access_token: token.accessToken,
            refresh_token: token.refreshToken,
            token_type: 'Bearer',
            expires_in: Math.max(
              0,
              Math.floor((+token.accessTokenExpiresAt - Date.now()) / 1000),
            ),
            scope: token.scope.join(' '),
          },
        };
      } catch (error: any) {
        if (replay && error.name === 'invalid_grant')
          return { error: error.name };
        throw error;
      }
    }, true).catch((error: any) => {
      if (
        [
          'invalid_grant',
          'invalid_request',
          'invalid_scope',
          'invalid_client',
        ].includes(error.name)
      )
        return oauthError(error.name);
      throw error;
    });
    if (outcome.error) return oauthError(outcome.error);
    return outcome.value;
  }
  async authenticate(
    ...args: Parameters<AgentOAuthService['authenticateInternal']>
  ) {
    return agentTelemetry.measure('oauth_authenticate', () =>
      this.authenticateInternal(...args),
    );
  }
  private async authenticateInternal(token: string, origin?: string) {
    this.enabled();
    if (!/^dma_[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException();
    return this.authenticateHash(secretHash(token), origin);
  }
  async authenticateHash(hash: string, origin?: string) {
    this.enabled();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new UnauthorizedException();
    return this.tx(async (trx) => {
      const row = (
        await sql<any>`select t.metadata,f.workspace_id,f.grant_id,f.client_id from agent_oauth_tokens t join agent_oauth_families f on f.id=t.family_id where t.access_hash=${hash} and t.access_expires_at>clock_timestamp() and not f.revoked`.execute(
          trx,
        )
      ).rows[0];
      if (!row || row.metadata.resource !== this.resource)
        throw new UnauthorizedException();
      const client = await this.client(trx, row.clientId).catch(() => {
        throw new UnauthorizedException();
      });
      if (origin && origin !== this.origin && !client.origins.includes(origin))
        throw new ForbiddenException('ORIGIN_REJECTED');
      const grant = await this.grant(
        trx,
        row.workspaceId,
        row.grantId,
        row.clientId,
      ).catch(() => {
        throw new UnauthorizedException();
      });
      await sql`update agent_oauth_tokens set last_used_at=clock_timestamp() where access_hash=${hash} and (last_used_at is null or last_used_at<clock_timestamp()-interval '1 minute')`.execute(
        trx,
      );
      return {
        workspaceId: row.workspaceId,
        userId: grant.userId,
        grantId: grant.id,
        clientId: row.clientId,
        tokenHash: hash,
        scopes: row.metadata.scope.filter(
          (s: string) => grant.scopes.includes(s) && client.scopes.includes(s),
        ),
        spaceIds: grant.spaceIds,
      };
    });
  }
  async revoke(
    value: unknown,
    credentials: { id?: string; secret?: string; method: 'basic' | 'none' },
  ) {
    const body = exactParameters(value, [
      'token',
      'token_type_hint',
      'client_id',
    ]);
    if (
      !body.token ||
      (credentials.id && body.client_id && credentials.id !== body.client_id)
    )
      return oauthError('invalid_request');
    await this.tx(async (trx) => {
      const client = await this.client(trx, credentials.id ?? body.client_id);
      this.authenticateClient(client, credentials.secret, credentials.method);
      await sql`update agent_oauth_families set revoked=true where client_id=${client.id}::uuid and id in (select family_id from agent_oauth_tokens where access_hash=${secretHash(body.token)} or refresh_hash=${secretHash(body.token)})`.execute(
        trx,
      );
    }, true);
  }
}
