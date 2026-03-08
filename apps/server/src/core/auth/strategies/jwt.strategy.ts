import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { JwtApiKeyPayload, JwtPayload, JwtType } from '../dto/jwt-payload';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader, isUserDisabled } from '../../../common/helpers';
import { IntegrationTokenService } from '../../integration-token/services/integration-token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private logger = new Logger('JwtStrategy');

  constructor(
    private userRepo: UserRepo,
    private workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
    private readonly integrationTokenService: IntegrationTokenService,
  ) {
    super({
      jwtFromRequest: (req: FastifyRequest) => {
        return req.cookies?.authToken || extractBearerTokenFromHeader(req);
      },
      ignoreExpiration: false,
      secretOrKey: environmentService.getAppSecret(),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload | JwtApiKeyPayload) {
    if (!payload.workspaceId) {
      throw new UnauthorizedException();
    }

    if (req.raw.workspaceId && req.raw.workspaceId !== payload.workspaceId) {
      throw new UnauthorizedException('Workspace does not match');
    }

    if (payload.type === JwtType.API_KEY) {
      return this.validateApiKey(req, payload as JwtApiKeyPayload);
    }

    if (payload.type !== JwtType.ACCESS) {
      throw new UnauthorizedException();
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);

    if (!workspace) {
      throw new UnauthorizedException();
    }
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    return { user, workspace };
  }

  private async validateApiKey(req: any, payload: JwtApiKeyPayload) {
    this.logger.debug('Validating self-built API token');
    return this.integrationTokenService.validateApiToken(req, payload);
  }
}
