import { agentTelemetry } from '../agent-operations/agent-telemetry';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AgentOAuthService } from './agent-oauth.service';
import { AgentManagementService } from './agent-management.service';
@Controller()
@UseGuards(JwtAuthGuard)
export class AgentManagementController {
  constructor(
    private readonly management: AgentManagementService,
    private readonly oauth: AgentOAuthService,
  ) {}
  private actor(req: FastifyRequest, write = false) {
    const actor = {
      userId: (req as any).user.user.id,
      workspaceId: (req as any).user.workspace.id,
      sessionId: (req.raw as any).sessionId,
    };
    if (
      write &&
      (req.headers.origin !== this.oauth.origin ||
        req.headers['x-csrf-token'] !== this.oauth.managementCsrf(actor))
    )
      throw new ForbiddenException('CSRF_REJECTED');
    return actor;
  }
  @Get('agent-connections') list(
    @Req() req: FastifyRequest,
    @Query() query: any,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.management.list(this.actor(req), query);
  }
  @Get('agent-connections/:id') detail(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.management.detail(this.actor(req), id);
  }
  @Patch('agent-connections/:id') change(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: any,
  ) {
    return this.management.change(this.actor(req, true), id, body);
  }
  @Post('agent-connections/:id/revoke') @HttpCode(200) revoke(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: any,
  ) {
    return this.management.change(this.actor(req, true), id, body, true);
  }
  @Get('agent-connections/:id/operations') activity(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: any,
  ) {
    return this.management.activity(this.actor(req), id, query);
  }
  @Get('agent-policy') policy(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.management.policy(this.actor(req));
  }
  @Put('agent-policy') update(@Req() req: FastifyRequest, @Body() body: any) {
    return this.management.updatePolicy(this.actor(req, true), body);
  }
  @Get('agent-observability') async observability(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const actor = this.actor(req);
    if (
      !(process.env.AGENT_OAUTH_ADMIN_USER_IDS ?? '')
        .split(',')
        .includes(actor.userId)
    )
      throw new ForbiddenException('FORBIDDEN');
    await this.management.policy(actor);
    reply.header('Cache-Control', 'no-store');
    return agentTelemetry.snapshot();
  }
  @Get('agent-audit') audit(@Req() req: FastifyRequest, @Query() query: any) {
    return this.management.activity(this.actor(req), undefined, query);
  }
}
