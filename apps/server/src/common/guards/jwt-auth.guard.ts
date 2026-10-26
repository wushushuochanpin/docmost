import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  SessionService,
  isOpaqueSessionToken,
} from '../../core/session/session.service';
import { addDays } from 'date-fns';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private environmentService: EnvironmentService,
    private sessionService: SessionService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const token = req.cookies?.authToken;
    if (token?.startsWith('dms_')) {
      if (!isOpaqueSessionToken(token)) throw new UnauthorizedException();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers?.origin;
        try {
          if (
            !origin ||
            new URL(origin).origin !==
              `${req.protocol}://${req.headers.host}` ||
            req.headers['sec-fetch-site'] === 'cross-site'
          )
            throw new Error();
        } catch {
          throw new ForbiddenException('Same-origin request required');
        }
      }
      const actor = await this.sessionService.authenticateBrowserCredential(
        token,
        req.raw?.workspaceId,
      );
      req.raw.sessionId = actor.sessionId;
      req.user = actor;
      this.setJoinedWorkspacesCookie(actor, context);
      return true;
    }
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any, ctx: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }

    this.setJoinedWorkspacesCookie(user, ctx);
    return user;
  }

  setJoinedWorkspacesCookie(user: any, ctx: ExecutionContext) {
    if (this.environmentService.isCloud()) {
      const req = ctx.switchToHttp().getRequest();
      const res = ctx.switchToHttp().getResponse();

      const workspaceId = user?.workspace?.id;
      let workspaceIds = [];
      try {
        workspaceIds = req.cookies.joinedWorkspaces
          ? JSON.parse(req.cookies.joinedWorkspaces)
          : [];
      } catch (err) {
        // Cookie parse failed — safe to ignore, will default to empty array
      }

      if (!workspaceIds.includes(workspaceId)) {
        workspaceIds.push(workspaceId);
      }

      res.setCookie('joinedWorkspaces', JSON.stringify(workspaceIds), {
        httpOnly: false,
        domain: '.' + this.environmentService.getSubdomainHost(),
        path: '/',
        expires: addDays(new Date(), 365),
        secure: this.environmentService.isHttps(),
        sameSite: 'lax',
      });
    }
  }
}
