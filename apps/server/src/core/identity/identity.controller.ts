import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IdentityService } from './identity.service';
import { IdentityConfigService } from './identity.config';
import { IDENTITY_BROWSER_COOKIE } from './identity.security';
import {
  AUTH_THROTTLER,
  AI_CHAT_THROTTLER,
  FORGOT_PASSWORD_THROTTLER,
} from '../../integrations/throttle/throttler-names';

const errors = new Set([
  'invalid_transaction',
  'center_unavailable',
  'identity_invalid',
  'identity_not_linked',
  'identity_conflict',
  'session_changed',
  'identity_disabled',
  'identity_assurance_required',
  'identity_unavailable',
]);

@Controller('identity')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ [AI_CHAT_THROTTLER]: true, [FORGOT_PASSWORD_THROTTLER]: true })
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);
  constructor(
    private readonly identity: IdentityService,
    private readonly config: IdentityConfigService,
  ) {}

  @Get('status')
  status(@AuthWorkspace() workspace: Workspace) {
    return {
      enabled: Boolean(workspace && this.identity.enabled(workspace.id)),
    };
  }

  @Get('account')
  @UseGuards(JwtAuthGuard)
  account(@AuthUser() user: User) {
    return this.identity.account(user);
  }

  @Post('bootstrap')
  @Throttle({ [AUTH_THROTTLER]: { ttl: 60_000, limit: 10 } })
  async bootstrap(
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.assertOrigin(req);
    const result = await this.identity.bootstrap(
      workspace,
      req.cookies[IDENTITY_BROWSER_COOKIE],
      req.cookies.authToken,
    );
    if (result.binding && result.token) {
      this.binding(res, result.binding);
      res.setCookie('authToken', result.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 86400,
      });
    }
    res.header('Cache-Control', 'no-store');
    return { ready: true, authenticated: result.authenticated === true };
  }

  @Get('start')
  @Throttle({ [AUTH_THROTTLER]: { ttl: 60_000, limit: 10 } })
  async start(
    @AuthWorkspace() workspace: Workspace,
    @Query('returnTo') returnTo: string | undefined,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    res.header('Cache-Control', 'no-store');
    try {
      const started = await this.identity.start(
        workspace,
        req.cookies[IDENTITY_BROWSER_COOKIE],
        returnTo,
        undefined,
        req.cookies.authToken,
      );
      return res.code(302).redirect(started.url);
    } catch (error) {
      const code =
        error instanceof Error && errors.has(error.message)
          ? error.message
          : 'invalid_transaction';
      this.logger.warn(
        `Identity start rejected: ${code}; errorType=${error instanceof Error ? error.constructor.name : 'unknown'}; browserCookie=${Boolean(req.cookies[IDENTITY_BROWSER_COOKIE])}; authCookie=${Boolean(req.cookies.authToken)}`,
      );
      return res.code(302).redirect(`/login?identity_error=${code}`);
    }
  }

  @Post('link/start')
  @UseGuards(JwtAuthGuard)
  @Throttle({ [AUTH_THROTTLER]: { ttl: 60_000, limit: 5 } })
  async link(
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() body: { password?: string; returnTo?: string },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.assertOrigin(req);
    if (
      !body ||
      typeof body.password !== 'string' ||
      body.password.length > 1024 ||
      (body.returnTo !== undefined && typeof body.returnTo !== 'string') ||
      Object.keys(body).some((k) => !['password', 'returnTo'].includes(k))
    ) {
      throw new BadRequestException('invalid_identity_request');
    }
    const started = await this.identity.start(
      workspace,
      req.cookies[IDENTITY_BROWSER_COOKIE],
      body.returnTo,
      { user, password: body.password, sessionId: (req.raw as any).sessionId },
    );
    this.binding(res, started.binding);
    return { url: started.url };
  }

  @Get('callback')
  async callback(
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    res.header('Cache-Control', 'no-store');
    res.header('Referrer-Policy', 'no-referrer');
    try {
      const result = await this.identity.callback(
        workspace,
        (req.raw.url ?? '').split('?').slice(1).join('?'),
        req.cookies[IDENTITY_BROWSER_COOKIE],
        req.cookies.authToken,
      );
      return res.code(302).redirect(result.returnTo);
    } catch (error) {
      const code =
        error instanceof Error && errors.has(error.message)
          ? error.message
          : 'identity_invalid';
      this.logger.warn(`Identity callback rejected: ${code}`);
      const path =
        (error as { identityPurpose?: string })?.identityPurpose === 'link'
          ? '/settings/account/profile'
          : '/login';
      const query = new URLSearchParams({ identity_error: code });
      const returnTo = (error as { identityReturnTo?: string })
        ?.identityReturnTo;
      if (path === '/login' && returnTo) query.set('redirect', returnTo);
      return res.code(302).redirect(`${path}?${query.toString()}`);
    }
  }

  private assertOrigin(req: FastifyRequest) {
    if (req.headers.origin !== new URL(this.config.get().callback).origin)
      throw new BadRequestException('invalid_identity_request');
  }

  private binding(res: FastifyReply, value: string) {
    res.header('Cache-Control', 'no-store');
    res.header('Referrer-Policy', 'no-referrer');
    res.setCookie(IDENTITY_BROWSER_COOKIE, value, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });
  }
}
