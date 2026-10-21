import { ImageUploadService } from '../../src/core/mcp/image-upload.service';
import { KnowledgeRetrievalService } from '../../src/core/mcp/knowledge-retrieval.service';
import fastifyCookie from '@fastify/cookie';
import { TransformHttpResponseInterceptor } from '../../src/common/interceptors/http-response.interceptor';
import { PageService } from '../../src/core/page/services/page.service';
import { PageNodeMetaRepo } from '../../src/database/repos/page/page-node-meta.repo';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ThrottlerModule } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import {
  AgentOAuthController,
  AgentOAuthConsentController,
} from '../../src/core/agent-oauth/agent-oauth.controller';
import { AgentOAuthService } from '../../src/core/agent-oauth/agent-oauth.service';
import { AgentMcpAuthGuard } from '../../src/core/agent-oauth/agent-mcp-auth.guard';
import { McpController } from '../../src/core/mcp/mcp.controller';
import { McpGatewayService } from '../../src/core/mcp/mcp-gateway.service';
import { DocumentToolsService } from '../../src/core/mcp/document-tools.service';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { EnvironmentService } from '../../src/integrations/environment/environment.service';
import { UserRepo } from '../../src/database/repos/user/user.repo';
import { WorkspaceRepo } from '../../src/database/repos/workspace/workspace.repo';
import { JwtStrategy } from '../../src/core/auth/strategies/jwt.strategy';
import { KyselyDB } from '../../src/database/types/kysely.types';
import { PagePermissionRepo } from '../../src/database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../src/database/repos/space/space-member.repo';

export const sessionSecret = 'isolated-test-session-secret-never-production';
export async function httpNode(
  database: KyselyDB,
  oauth: AgentOAuthService,
  members: SpaceMemberRepo,
  browserAssets?: { js: string; css: string },
  storage: any = {},
) {
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
  const sessions = {
    findActiveById: (id: string) =>
      database
        .selectFrom('userSessions')
        .selectAll()
        .where('id', '=', id)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', new Date())
        .executeTakeFirst(),
  };
  const environment = {
    getAppSecret: () => sessionSecret,
    isCloud: () => false,
    isHttps: () => false,
    getAppUrl: () => process.env.AGENT_OAUTH_ORIGIN,
  };
  const commands = new DocumentCommandService(
    database,
    new PagePermissionRepo(
      database,
      null as any,
      {
        get: () => {
          throw Error('cached ACL');
        },
      } as any,
    ),
    members,
  );
  const pageRepository = {
    findById: (id: string, opts: { workspaceId: string }) =>
      database
        .selectFrom('pages')
        .selectAll()
        .where('id', '=', id)
        .where('workspaceId', '=', opts.workspaceId)
        .executeTakeFirst(),
  };
  const pages = new PageService(
    pageRepository as any,
    new PageNodeMetaRepo(database),
    null as any,
    null as any,
    null as any,
    database,
    null as any,
    null as any,
    null as any,
    null as any,
    { emit: () => {} } as any,
    null as any,
    null as any,
    null as any,
    null as any,
    commands,
  );
  const documents = new DocumentToolsService(commands, oauth, pages, new ImageUploadService(commands, storage as any, database));
  // Production JWT strategy verifies signatures and DB-backed sessions. Fixture repositories select the minimal test schema.
  const strategy = new JwtStrategy(
    users as any,
    workspaces as any,
    sessions as any,
    { trackActivity: () => {} } as any,
    environment as any,
    {
      validateApiToken: () => {
        throw Error('API keys not authorized in this fixture');
      },
    } as any,
  );
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
    controllers: [
      AgentOAuthController,
      AgentOAuthConsentController,
      McpController,
    ],
    providers: [
      { provide: AgentOAuthService, useValue: oauth },
      { provide: EnvironmentService, useValue: environment },
      { provide: UserRepo, useValue: users },
      { provide: WorkspaceRepo, useValue: workspaces },
      { provide: JwtStrategy, useValue: strategy },
      {
        provide: McpGatewayService,
        useValue: new McpGatewayService(
          new KnowledgeRetrievalService(
            database,
            {} as any,
            pages,
            {} as any,
            storage,
            new PagePermissionRepo(database, null as any, {} as any),
            members,
          ),
          oauth,
          documents,
        ),
      },
      AgentMcpAuthGuard,
      Reflector,
    ],
  }).compile();
  const adapter = new FastifyAdapter();
  const app = module.createNestApplication(adapter, {
    logger: false,
    rawBody: true,
  });
  adapter.getInstance().register(fastifyCookie as any);
  app.setGlobalPrefix('api', {
    exclude: [
      'mcp',
      'oauth/authorize',
      'oauth/token',
      'oauth/revoke',
      '.well-known/oauth-authorization-server',
      '.well-known/oauth-protected-resource/mcp',
    ],
  });
  app.useGlobalInterceptors(
    new TransformHttpResponseInterceptor(new Reflector()),
  );
  if (browserAssets) {
    adapter
      .getInstance()
      .get('/oauth/consent', (_req, reply) =>
        reply
          .type('text/html')
          .send(
            '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/consent.css"><div id="root"></div><script src="/consent.js"></script>',
          ),
      );
    adapter
      .getInstance()
      .get('/consent.js', (_req, reply) =>
        reply.type('text/javascript').send(browserAssets.js),
      );
    adapter
      .getInstance()
      .get('/consent.css', (_req, reply) =>
        reply.type('text/css').send(browserAssets.css),
      );
  }
  await app.listen(0, '127.0.0.1');
  return { app, commands, url: await app.getUrl() };
}
