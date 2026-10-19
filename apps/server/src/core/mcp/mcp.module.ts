import { DocumentCommandModule } from '../document-command/document-command.module';
import { DocumentToolsService } from './document-tools.service';
import { AgentOAuthModule } from '../agent-oauth/agent-oauth.module';
import { AgentMcpAuthGuard } from '../agent-oauth/agent-mcp-auth.guard';
import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { PageModule } from '../page/page.module';
import { McpController } from './mcp.controller';
import { McpGatewayService } from './mcp-gateway.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

@Module({
  imports: [SearchModule, PageModule, AgentOAuthModule, DocumentCommandModule],
  controllers: [McpController],
  providers: [
    DocumentToolsService,
    AgentMcpAuthGuard,
    McpGatewayService,
    KnowledgeRetrievalService,
  ],
})
export class McpModule {}
