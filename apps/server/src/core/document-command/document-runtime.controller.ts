import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DocumentCommandService } from './document-command.service';
@Controller('document-runtime')
@UseGuards(JwtAuthGuard)
export class DocumentRuntimeController {
  constructor(private readonly commands: DocumentCommandService) {}
  @Get(':id')
  runtime(
    @Param('id', new ParseUUIDPipe()) pageId: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = (req.raw as any).sessionId;
    if (!sessionId) throw new UnauthorizedException();
    reply.header('Cache-Control', 'no-store');
    const user = (req as any).user.user;
    return this.commands.runtime(
      { pageId, userId: user.id, workspaceId: user.workspaceId },
      sessionId,
    );
  }
}
