import { ForbiddenException, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { Workspace } from '@docmost/db/types/entity.types';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { McpToolContext } from './mcp.types';

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

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
        annotations: READ_ONLY_ANNOTATIONS,
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
      'get_page',
      {
        title: 'Get Docmost page by URL or slug',
        description:
          'Directly fetch a Docmost page by its URL or slug ID. Use this when you have a page URL or slug — no search step needed. Returns the same content as fetch.',
        inputSchema: {
          url: z
            .string()
            .optional()
            .describe(
              'Full page URL, e.g. https://host/s/general/p/untitled-ppWKvRMSRW. The slug is extracted automatically.',
            ),
          slug_id: z
            .string()
            .optional()
            .describe(
              'Page slug ID (e.g. untitled-ppWKvRMSRW) or raw page UUID. Use when you have the slug without a full URL.',
            ),
          format: z
            .enum(['markdown', 'html'])
            .optional()
            .default('markdown')
            .describe('Content format. Markdown is the default.'),
          mode: z
            .enum(['snippet', 'section', 'full'])
            .optional()
            .default('section')
            .describe('Amount of text to return.'),
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
            .describe('Image return mode.'),
          include_children: z
            .boolean()
            .optional()
            .default(false)
            .describe('Include child pages.'),
          max_depth: z
            .number()
            .int()
            .min(0)
            .max(5)
            .optional()
            .default(0)
            .describe('Maximum child depth when include_children is true.'),
        },
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        this.assertKnowledgeReadScope(context);
        return this.knowledgeRetrievalService.getPage(input, context);
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        this.assertKnowledgeReadScope(context);
        return this.knowledgeRetrievalService.fetch(input, context);
      },
    );

    server.registerTool(
      'list_pages',
      {
        title: 'List Docmost pages',
        description:
          'List pages in a space or under a parent page. Returns page metadata (title, slug, URL, node type) without content. Use to explore the document tree before fetching specific pages.',
        inputSchema: {
          space_id: z
            .string()
            .optional()
            .describe('Space UUID or slug to list pages from.'),
          parent_page_id: z
            .string()
            .optional()
            .describe(
              'Restrict listing to children of this page. Accepts page:<id>, raw UUID, URL, or slug ID.',
            ),
          max_depth: z
            .number()
            .int()
            .min(0)
            .max(5)
            .optional()
            .default(2)
            .describe(
              'Recursion depth. 0 = top-level only, 1 = one level deep, etc.',
            ),
          max_results: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .default(50)
            .describe('Maximum number of pages to return.'),
        },
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        this.assertKnowledgeReadScope(context);
        const result = await this.knowledgeRetrievalService.listPages(
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

    return server;
  }
}
