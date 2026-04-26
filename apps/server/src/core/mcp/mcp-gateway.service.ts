import { ForbiddenException, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { Workspace } from '@docmost/db/types/entity.types';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { McpToolContext } from './mcp.types';

@Injectable()
export class McpGatewayService {
  constructor(
    private readonly knowledgeRetrievalService: KnowledgeRetrievalService,
  ) {}

  assertMcpEnabled(workspace: Workspace) {
    const settings = (workspace.settings ?? {}) as Record<string, any>;
    if (settings?.ai?.mcp !== true) {
      throw new ForbiddenException('MCP_DISABLED');
    }
  }

  assertKnowledgeReadScope(context: McpToolContext) {
    const scopes = Array.isArray(context.apiToken?.scopeJson)
      ? context.apiToken.scopeJson
      : [];

    if (scopes.length === 0) {
      return;
    }

    if (
      scopes.includes('knowledge.read') ||
      scopes.includes('knowledge.read:*')
    ) {
      return;
    }

    throw new ForbiddenException('MCP_SCOPE_DENIED');
  }

  createServer(context: McpToolContext) {
    const server = new McpServer(
      {
        name: 'docmost-knowledge',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    server.registerTool(
      'search',
      {
        title: 'Search Docmost knowledge',
        description:
          'Search readable Docmost pages by query. Returns concise candidates with snippets and stable IDs; call fetch to read selected content.',
        inputSchema: {
          query: z.string().min(1).describe('Natural language search query.'),
          space_id: z
            .string()
            .optional()
            .describe('Restrict search to one Docmost space ID.'),
          parent_page_id: z
            .string()
            .optional()
            .describe(
              'Restrict search to a page or page tree. Accepts page:<id> or raw page ID.',
            ),
          include_children: z
            .boolean()
            .optional()
            .default(false)
            .describe(
              'When parent_page_id is provided, include child pages. Defaults to false.',
            ),
          max_depth: z
            .number()
            .int()
            .min(0)
            .max(5)
            .optional()
            .default(0)
            .describe('Maximum child depth when include_children is true.'),
          top_k: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .default(8)
            .describe('Maximum number of search results.'),
          source_types: z
            .array(z.enum(['page', 'attachment', 'comment']))
            .optional()
            .describe(
              'Reserved for future source filtering. Phase 1 searches pages.',
            ),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        this.assertKnowledgeReadScope(context);
        const result = await this.knowledgeRetrievalService.search(
          input,
          context,
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      },
    );

    server.registerTool(
      'fetch',
      {
        title: 'Fetch Docmost page content',
        description:
          'Fetch readable Docmost page content by ID returned from search. Defaults to bounded section content and image metadata to control token cost.',
        inputSchema: {
          id: z
            .string()
            .min(1)
            .describe('Stable result ID from search, usually page:<pageId>.'),
          format: z
            .enum(['markdown', 'html'])
            .optional()
            .default('markdown')
            .describe('Content format. Markdown is the default.'),
          mode: z
            .enum(['snippet', 'section', 'full'])
            .optional()
            .default('section')
            .describe(
              'Amount of text to return. Full remains bounded by max_tokens.',
            ),
          max_tokens: z
            .number()
            .int()
            .min(200)
            .max(12000)
            .optional()
            .default(3000)
            .describe('Approximate maximum output tokens.'),
          include_images: z
            .enum(['none', 'metadata', 'url', 'inline'])
            .optional()
            .default('metadata')
            .describe(
              'Image return mode. Inline uses MCP image blocks for small images only.',
            ),
          include_children: z
            .boolean()
            .optional()
            .default(false)
            .describe('Include child pages only when explicitly needed.'),
          max_depth: z
            .number()
            .int()
            .min(0)
            .max(5)
            .optional()
            .default(0)
            .describe('Maximum child depth when include_children is true.'),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        this.assertKnowledgeReadScope(context);
        return this.knowledgeRetrievalService.fetch(input, context);
      },
    );

    return server;
  }
}
