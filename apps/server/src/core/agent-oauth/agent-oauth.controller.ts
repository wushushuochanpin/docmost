import {
  AUTH_THROTTLER,
  AI_CHAT_THROTTLER,
  FORGOT_PASSWORD_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { AgentOAuthService } from './agent-oauth.service';
import { OAUTH_SCOPES, oauthError } from './oauth-contract';

function credentials(req: FastifyRequest) {
  const value = req.headers.authorization;
  if (!value) return { method: 'none' as const };
  if (!/^Basic [A-Za-z0-9+/]+=*$/.test(value))
    return oauthError('invalid_client');
  const decoded = Buffer.from(value.slice(6), 'base64').toString();
  const colon = decoded.indexOf(':');
  if (colon < 1) return oauthError('invalid_client');
  try {
    return {
      method: 'basic' as const,
      id: decodeURIComponent(decoded.slice(0, colon)),
      secret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  } catch {
    return oauthError('invalid_client');
  }
}
function form(req: FastifyRequest) {
  const body = Buffer.isBuffer((req as any).rawBody)
    ? (req as any).rawBody.toString('utf8')
    : req.body;
  if (
    !req.headers['content-type']?.startsWith(
      'application/x-www-form-urlencoded',
    ) ||
    typeof body !== 'string' ||
    Buffer.byteLength(body) > 16384
  )
    return oauthError('invalid_request');
  const params = new URLSearchParams(body as string);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.prototype.hasOwnProperty.call(result, key))
      return oauthError('invalid_request');
    result[key] = value;
  }
  return result;
}
@Controller()
@UseGuards(ThrottlerGuard)
@SkipThrottle({ [AI_CHAT_THROTTLER]: true, [FORGOT_PASSWORD_THROTTLER]: true })
@Throttle({ [AUTH_THROTTLER]: { ttl: 60000, limit: 60 } })
export class AgentOAuthController {
  constructor(private readonly oauth: AgentOAuthService) {}
  @SkipTransform()
  @Get('.well-known/oauth-protected-resource/mcp')
  protectedMetadata() {
    this.oauth.assertEnabled();
    return {
      resource: this.oauth.resource,
      authorization_servers: [this.oauth.origin],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ['header'],
    };
  }
  @SkipTransform()
  @Get('.well-known/oauth-authorization-server')
  metadata() {
    this.oauth.assertEnabled();
    const o = this.oauth.origin;
    return {
      issuer: o,
      authorization_endpoint: o + '/oauth/authorize',
      token_endpoint: o + '/oauth/token',
      revocation_endpoint: o + '/oauth/revoke',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
      scopes_supported: OAUTH_SCOPES,
    };
  }
  @SkipTransform()
  @Get('oauth/authorize')
  async authorize(@Query() query: unknown, @Res() reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    return reply.redirect(await this.oauth.start(query), 302);
  }
  @SkipTransform()
  @HttpCode(200)
  @Post('oauth/token')
  async token(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    reply.header('Pragma', 'no-cache');
    return reply.send(
      await this.oauth.token(form(req), credentials(req), req.headers.origin),
    );
  }
  @SkipTransform()
  @HttpCode(200)
  @Post('oauth/revoke')
  async revoke(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    await this.oauth.revoke(form(req), credentials(req));
    return reply.send({});
  }
}
@Controller('agent-oauth')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@SkipThrottle({ [AI_CHAT_THROTTLER]: true, [FORGOT_PASSWORD_THROTTLER]: true })
@Throttle({ [AUTH_THROTTLER]: { ttl: 60000, limit: 60 } })
export class AgentOAuthConsentController {
  constructor(private readonly oauth: AgentOAuthService) {}
  private actor(req: FastifyRequest) {
    return {
      userId: (req as any).user.user.id,
      workspaceId: (req as any).user.workspace.id,
      sessionId: (req.raw as any).sessionId,
    };
  }
  private sameOrigin(req: FastifyRequest) {
    if (req.headers.origin !== this.oauth.origin)
      throw new ForbiddenException('ORIGIN_REJECTED');
  }
  @Get('requests/:id')
  consent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.oauth.consent(id, this.actor(req));
  }
  @HttpCode(200)
  @Post('requests/:id/decision')
  decision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
    @Body() body: any,
  ) {
    this.sameOrigin(req);
    return this.oauth.decide(
      id,
      this.actor(req),
      body,
      String(req.headers['x-csrf-token'] ?? ''),
    );
  }
  @HttpCode(200)
  @Post('clients')
  register(
    @Req() req: FastifyRequest,
    @Body() body: any,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.sameOrigin(req);
    reply.header('Cache-Control', 'no-store');
    return this.oauth.register(this.actor(req), body);
  }
}
