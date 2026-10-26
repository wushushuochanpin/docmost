import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SessionService } from '../session/session.service';
import { AgentOAuthService } from './agent-oauth.service';
import { UserRepo } from '../../database/repos/user/user.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';

@Injectable()
export class AgentMcpAuthGuard extends JwtAuthGuard {
  constructor(
    reflector: Reflector,
    environment: EnvironmentService,
    private readonly oauth: AgentOAuthService,
    private readonly users: UserRepo,
    private readonly workspaces: WorkspaceRepo,
    sessions: SessionService,
  ) {
    super(reflector, environment, sessions);
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const reply = context.switchToHttp().getResponse();
    const bearer = req.headers.authorization;
    if (typeof bearer === 'string' && bearer.startsWith('Bearer dma_')) {
      try {
        const principal = await this.oauth.authenticate(
          bearer.slice(7),
          req.headers.origin,
        );
        if (
          req.raw.workspaceId &&
          req.raw.workspaceId !== principal.workspaceId
        )
          throw new UnauthorizedException();
        const user = await this.users.findById(
          principal.userId,
          principal.workspaceId,
        );
        const workspace = await this.workspaces.findById(principal.workspaceId);
        if (!user || !workspace) throw new UnauthorizedException();
        req.user = { user, workspace, agent: principal };
        return true;
      } catch (error) {
        if (process.env.AGENT_OAUTH_ENABLED === 'true')
          reply.header(
            'WWW-Authenticate',
            `Bearer resource_metadata="${this.oauth.origin}/.well-known/oauth-protected-resource/mcp", scope="knowledge.read"`,
          );
        throw error;
      }
    }
    if (
      process.env.AGENT_OAUTH_ENABLED === 'true' &&
      !bearer &&
      !req.cookies?.authToken
    )
      reply.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${this.oauth.origin}/.well-known/oauth-protected-resource/mcp", scope="knowledge.read"`,
      );
    return (await super.canActivate(context)) as boolean;
  }
}
