import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { PageModule } from '../page/page.module';
import { McpController } from './mcp.controller';
import { McpGatewayService } from './mcp-gateway.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

@Module({
  imports: [SearchModule, PageModule],
  controllers: [McpController],
  providers: [McpGatewayService, KnowledgeRetrievalService],
})
export class McpModule {}
