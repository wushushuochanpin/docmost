import { AgentRateLimitError } from '../document-command/agent-quota';
import { toolError } from './tool-result';
import { AgentMcpAuthGuard } from '../agent-oauth/agent-mcp-auth.guard';
import { AgentOAuthService } from '../agent-oauth/agent-oauth.service';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { McpGatewayService } from './mcp-gateway.service';

@UseGuards(AgentMcpAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpGatewayService: McpGatewayService,
    private readonly environmentService: EnvironmentService,
    private readonly oauth: AgentOAuthService,
  ) {}

  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post()
  async handlePost(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.mcpGatewayService.assertMcpEnabled(workspace);
    if ((req as any).user?.agent) {
      try {
        await this.mcpGatewayService.entranceQuota((req as any).user.agent);
      } catch (error) {
        if (error instanceof AgentRateLimitError)
          return res
            .status(429)
            .header('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)))
            .send(toolError(error).structuredContent);
        throw error;
      }
    }

    const server = this.mcpGatewayService.createServer({
      user,
      workspace,
      baseUrl: (req as any).user?.agent
        ? this.oauth.origin
        : this.getBaseUrl(req),
      agent: (req as any).user?.agent,
      apiToken: (req as any).user?.apiToken,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.hijack();

    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, res.raw, req.body);
    } catch (error) {
      if (!res.raw.headersSent) {
        res.raw.statusCode = 500;
        res.raw.setHeader('content-type', 'application/json');
        res.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          }),
        );
      }
    } finally {
      await transport.close();
      await server.close();
    }
  }

  @SkipTransform()
  @Get()
  handleGet(@Res() res: FastifyReply) {
    return res
      .status(HttpStatus.METHOD_NOT_ALLOWED)
      .header('Allow', 'POST')
      .send('Method Not Allowed');
  }

  @SkipTransform()
  @Delete()
  handleDelete(@Res() res: FastifyReply) {
    return res
      .status(HttpStatus.METHOD_NOT_ALLOWED)
      .header('Allow', 'POST')
      .send('Method Not Allowed');
  }

  private getBaseUrl(req: FastifyRequest) {
    const host = req.headers.host;
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto ||
        (this.environmentService.isHttps() ? 'https' : 'http');

    if (!host) {
      return this.environmentService.getAppUrl();
    }

    return `${protocol}://${host}`;
  }
}
