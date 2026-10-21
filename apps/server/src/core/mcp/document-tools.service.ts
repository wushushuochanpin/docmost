import { imageReferences } from '../document-command/image-reference';
import { ImageUploadService } from './image-upload.service';
import { richContent, RICH_CONTENT_CAPABILITIES } from './rich-content';
import { agentTelemetry } from '../agent-operations/agent-telemetry';
import { toolError } from './tool-result';
import { markdownContent } from './markdown-content';
import { openCursor, sealCursor } from '../document-command/agent-cursor';
import { isEditableBlock } from '../document-command/document-candidate';
import { PageService } from '../page/services/page.service';
import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as z from 'zod/v4';
import * as Y from 'yjs';
import { DocumentCommandService } from '../document-command/document-command.service';
import {
  DocumentCandidate,
  DocumentCommandError,
  TextBlockCommand,
} from '../document-command/document-candidate';
import { AgentOAuthService } from '../agent-oauth/agent-oauth.service';
import { McpToolContext } from './mcp.types';

const key = z.string().regex(/^[\x21-\x7e]{1,128}$/);
const markdown = z
  .string()
  .max(262144)
  .refine((s) => Buffer.byteLength(s) <= 262144);
const content = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.record(z.string(), z.unknown())).max(10000),
  })
  .strict()
  .describe(
    'Native Tiptap document. Supported nodes and limits are returned by get_edit_context. Use exactly one of markdown or content.',
  );
const body = { markdown: markdown.optional(), content: content.optional() };
const operation = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('append'), ...body }),
  z.strictObject({ type: z.literal('prepend'), ...body }),
  z.strictObject({
    type: z.literal('replace_block'),
    block_ref: z.string().max(4096),
    ...body,
  }),
]);
const sourceText = (input: { markdown?: string; content?: unknown }) =>
  input.markdown ?? JSON.stringify(input.content);
async function parseContent(
  input: { markdown?: string; content?: any },
  allowEmpty = false,
  completeDocument = false,
) {
  if ((input.markdown === undefined) === (input.content === undefined))
    throw new DocumentCommandError('INVALID_ARGUMENT');
  const parsed =
    input.content !== undefined
      ? richContent(input.content, allowEmpty)
      : await markdownContent(input.markdown!, allowEmpty);
  if (
    completeDocument &&
    parsed.content.content?.[parsed.content.content.length - 1]?.type !==
      'paragraph'
  ) {
    return richContent(
      {
        ...parsed.content,
        content: [...parsed.content.content!, { type: 'paragraph' }],
      },
      allowEmpty,
    );
  }
  return parsed;
}
@Injectable()
export class DocumentToolsService {
  constructor(
    private readonly commands: DocumentCommandService,
    private readonly oauth: AgentOAuthService,
    private readonly pages: PageService,
    private readonly images: ImageUploadService,
  ) {}
  async entranceQuota(actor: NonNullable<McpToolContext['agent']>) {
    return this.commands.entranceQuota(actor);
  }
  async readQuota(context: McpToolContext) {
    if (context.agent)
      await this.commands.requestQuota(context.agent, ['read']);
  }
  register(server: McpServer, context: McpToolContext) {
    // Legacy API keys keep their existing read surface. Writes require explicit OAuth consent.
    if (!context.agent) return;
    const has = (scope: string) =>
      context.agent!.scopes.includes('knowledge.read') &&
      context.agent!.scopes.includes(scope);
    const run = async (fn: () => Promise<Record<string, any>>) => {
      try {
        const value = await agentTelemetry.measure('mcp_tool', fn);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(value) }],
          structuredContent: value,
        };
      } catch (error) {
        return toolError(error);
      }
    };
    const actor = async (pageId?: string, scope = 'pages.edit') => {
      const principal = await this.oauth.authenticateHash(
        context.agent!.tokenHash,
      );
      if (
        !principal.scopes.includes(scope) ||
        !principal.scopes.includes('knowledge.read')
      )
        throw new DocumentCommandError('SCOPE_DENIED');
      return { ...principal, pageId: pageId! };
    };
    const annotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
    if (has('pages.edit'))
      server.registerTool(
        'get_edit_context',
        {
          description:
            'Get paginated revision-bound blocks with protection and truncation flags.',
          inputSchema: z.strictObject({
            page_id: z.uuid(),
            cursor: z.string().max(8192).optional(),
            page_size: z.number().int().min(1).max(100).default(50),
          }),
          annotations,
        },
        (input) =>
          run(async () => {
            const a = await actor(input.page_id);
            await this.commands.requestQuota(a, ['read']);
            const state = await this.commands.editContext(a);
            const doc = new Y.Doc();
            try {
              Y.applyUpdate(doc, state.binary);
              const engine = new DocumentCandidate(
                Buffer.from(
                  process.env.DOCUMENT_COMMAND_SIGNING_KEY!,
                  'base64',
                ),
              );
              const binding = {
                tool: 'get_edit_context',
                grant: a.grantId,
                spaces: a.spaceIds,
                version: state.token,
                page_size: input.page_size,
              };
              const start = input.cursor
                ? Number(openCursor(input.cursor, binding))
                : 0;
              const nodes = doc.getXmlFragment('default').toArray();
              const json = TiptapTransformer.fromYdoc(doc, 'default') as any;
              if (
                !Number.isSafeInteger(start) ||
                start < 0 ||
                start > nodes.length
              )
                throw new DocumentCommandError('REVISION_CONFLICT');
              const blocks: Record<string, any>[] = [];
              let bytes = 0,
                next = start;
              for (
                ;
                next < nodes.length && blocks.length < input.page_size;
                next++
              ) {
                const node = nodes[next],
                  text = node.toString();
                const jsonBlock = json.content[next];
                const contentTruncated =
                  Buffer.byteLength(JSON.stringify(jsonBlock)) > 262144;
                const block = {
                  content: contentTruncated ? null : jsonBlock,
                  content_truncated: contentTruncated,
                  block_ref: engine.blockRef(state.version, doc, next),
                  type:
                    node instanceof Y.XmlElement ? node.nodeName : 'protected',
                  text: text.slice(0, 8000),
                  truncated: text.length > 8000,
                  protected: !isEditableBlock(node),
                };
                const size = Buffer.byteLength(JSON.stringify(block));
                if (blocks.length && bytes + size > 52000) break;
                bytes += size;
                blocks.push(block);
              }
              return {
                generation: state.version.generation,
                version_token: state.token,
                blocks,
                next_cursor:
                  next < nodes.length ? sealCursor(binding, next) : null,
                busy: state.busy,
                editable: !state.busy,
                supported_operations: ['append', 'prepend', 'replace_block'],
                content_format: 'tiptap-json',
                capabilities: RICH_CONTENT_CAPABILITIES,
              };
            } finally {
              doc.destroy();
            }
          }),
      );
    if (has('pages.edit'))
      server.registerTool(
        'edit_page',
        {
          description:
            'Atomically apply native rich JSON or Markdown block edits, including tables, attachment images, figures/captions, rules and Mermaid code. Unsupported Markdown is rejected, never silently flattened. Success means database commit.',
          inputSchema: z.strictObject({
            page_id: z.uuid(),
            version_token: z.string().max(4096),
            ops: z.array(operation).min(1).max(20),
            idempotency_key: key,
            preview: z.boolean().default(false),
          }),
          annotations: {
            ...annotations,
            readOnlyHint: false,
            destructiveHint: true,
          },
        },
        (input) =>
          run(async () => {
            const a = await actor(input.page_id);
            if (
              input.ops.reduce(
                (n, op) => n + Buffer.byteLength(sourceText(op) ?? ''),
                0,
              ) > 262144
            )
              throw new DocumentCommandError('CONTENT_TOO_LARGE');
            const commands: TextBlockCommand[] = await Promise.all(
              input.ops.map(async (op) => {
                const parsed = await parseContent(
                  op,
                  op.type === 'replace_block',
                );
                return op.type === 'replace_block'
                  ? {
                      type: op.type,
                      text: sourceText(op),
                      blockRef: op.block_ref,
                      fragment: parsed.fragment,
                    }
                  : {
                      type: op.type,
                      text: sourceText(op),
                      fragment: parsed.fragment,
                    };
              }),
            );
            if (input.preview) {
              await this.commands.requestQuota(a, ['read', 'preview']);
              await this.commands.previewImageReferences(
                a,
                commands.map((c) => c.fragment!),
              );
              const state = await this.commands.editContext(a);
              if (state.busy) throw new DocumentCommandError('DOCUMENT_BUSY');
              new DocumentCandidate(
                Buffer.from(
                  process.env.DOCUMENT_COMMAND_SIGNING_KEY!,
                  'base64',
                ),
              ).apply(
                state.binary,
                state.version,
                input.version_token,
                commands,
              );
              return {
                status: 'preview',
                base_version: state.token,
                summary: { operations: commands.length },
                warnings: [],
              };
            }
            const result = await this.commands.waitForOperation(
              a,
              { key: input.idempotency_key, tool: 'edit_page' },
              this.commands.edit(
                a,
                {
                  key: input.idempotency_key,
                  versionToken: input.version_token,
                  commands,
                },
                (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
              ),
            );
            return {
              operation_id: result.operationId,
              status: result.status,
              ...(result.status === 'pending' ? { retry_after_ms: 2000 } : {}),
              page_id: result.pageId,
              changed: result.changed,
              version_token: result.versionToken,
              persisted_at: result.persistedAt,
              url: context.baseUrl + '/p/' + result.pageId,
            };
          }),
      );
    if (has('pages.edit'))
      server.registerTool(
        'update_page_metadata',
        {
          description:
            'Change only the title using the current revision and an idempotency key.',
          inputSchema: z.strictObject({
            page_id: z.uuid(),
            title: z
              .string()
              .refine(
                (s) => s.trim().length > 0 && Array.from(s).length <= 200,
              ),
            version_token: z.string().max(4096),
            idempotency_key: key,
            preview: z.boolean().default(false),
          }),
          annotations: {
            ...annotations,
            readOnlyHint: false,
            destructiveHint: true,
          },
        },
        (input) =>
          run(async () => {
            const a = await actor(input.page_id);
            if (input.preview) {
              await this.commands.requestQuota(a, ['read', 'preview']);
              const state = await this.commands.editContext(a);
              if (state.busy) throw new DocumentCommandError('DOCUMENT_BUSY');
              new DocumentCandidate(
                Buffer.from(
                  process.env.DOCUMENT_COMMAND_SIGNING_KEY!,
                  'base64',
                ),
              ).assertVersion(input.version_token, state.version);
              return {
                status: 'preview',
                base_version: state.token,
                summary: { title: input.title },
                warnings: [],
              };
            }
            const result = await this.commands.waitForOperation(
              a,
              { key: input.idempotency_key, tool: 'update_page_metadata' },
              this.commands.edit(
                a,
                {
                  key: input.idempotency_key,
                  versionToken: input.version_token,
                  commands: [],
                  title: input.title,
                  tool: 'update_page_metadata',
                },
                (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
              ),
            );
            return {
              operation_id: result.operationId,
              status: result.status,
              ...(result.status === 'pending' ? { retry_after_ms: 2000 } : {}),
              page_id: result.pageId,
              changed: result.changed,
              version_token: result.versionToken,
              persisted_at: result.persistedAt,
              url: context.baseUrl + '/p/' + result.pageId,
            };
          }),
      );
    if (has('pages.edit'))
      server.registerTool(
        'upload_image',
        {
          description:
            'Upload PNG/GIF/JPEG/WebP original bytes (base64, max 7 MiB) as a page-owned attachment. Requires pages.edit. Repeating the same idempotency key returns the same attachment; different bytes conflict. Does not insert a block: use edit_page with the returned image node, optionally inside imageFigure with imageCaption. No external image URLs.',
          inputSchema: z.strictObject({
            page_id: z.uuid(),
            file_name: z.string().min(1).max(200),
            data_base64: z.string().min(4).max(9786712),
            idempotency_key: key,
          }),
          annotations: { ...annotations, readOnlyHint: false },
        },
        (input) =>
          run(async () =>
            this.images.upload(await actor(input.page_id), input),
          ),
      );
    for (const tool of ['create_page', 'create_folder'] as const) {
      if (!has(tool === 'create_page' ? 'pages.create' : 'folders.create'))
        continue;
      server.registerTool(
        tool,
        {
          description:
            tool === 'create_page'
              ? 'Create a Markdown or native rich JSON document inside a folder. To import images: create the page, upload_image to it, then edit_page using returned attachment nodes.'
              : 'Create a folder at the root or inside another folder.',
          inputSchema: z.strictObject({
            space_id: z.uuid(),
            parent_id: tool === 'create_page' ? z.uuid() : z.uuid().optional(),
            title: z
              .string()
              .refine(
                (s) => s.trim().length > 0 && Array.from(s).length <= 200,
              ),
            markdown:
              tool === 'create_page'
                ? markdown.optional()
                : z.never().optional(),
            content:
              tool === 'create_page'
                ? content.optional()
                : z.never().optional(),
            idempotency_key: key,
            preview: z.boolean().default(false),
          }),
          annotations: {
            ...annotations,
            readOnlyHint: false,
            destructiveHint: false,
          },
        },
        (input) =>
          run(async () => {
            const scope =
              tool === 'create_page' ? 'pages.create' : 'folders.create';
            const a = await actor(undefined, scope);
            if (!a.spaceIds.includes(input.space_id))
              throw new DocumentCommandError('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
            const { content } = await parseContent(
              tool === 'create_folder' ? { markdown: '' } : input,
              true,
              true,
            );
            // Attachments belong to an existing page. A newly allocated page cannot
            // adopt attachments from another page, including in preview mode.
            if (imageReferences(content).length)
              throw new DocumentCommandError('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
            const payload = {
              spaceId: input.space_id,
              parentPageId: input.parent_id,
              title: input.title,
              nodeType:
                tool === 'create_page'
                  ? ('file' as const)
                  : ('folder' as const),
              format: 'json' as const,
              content,
            };
            if (input.preview) {
              await this.commands.requestQuota(a, ['read', 'preview']);
              await this.commands.previewCreate(
                {
                  workspaceId: a.workspaceId,
                  userId: a.userId,
                  spaceId: input.space_id,
                  parentPageId: input.parent_id,
                },
                a,
                scope,
              );
              return {
                status: 'preview',
                summary: { title: input.title, node_type: payload.nodeType },
                warnings: [],
              };
            }
            const page = await this.pages.create(
              a.userId,
              a.workspaceId,
              payload,
              {
                principal: a,
                key: input.idempotency_key,
                tool,
                payload: {
                  space_id: input.space_id,
                  parent_id: input.parent_id,
                  title: input.title,
                  markdown: input.markdown,
                  content: input.content,
                },
              },
            );
            const result = page.agentOperation!;
            return {
              operation_id: result.operationId,
              status: result.status,
              ...(result.status === 'pending' ? { retry_after_ms: 2000 } : {}),
              page_id: result.pageId,
              changed: result.changed,
              version_token: result.versionToken,
              persisted_at: result.persistedAt,
              url: context.baseUrl + '/p/' + result.pageId,
            };
          }),
      );
    }
    if (has('knowledge.read'))
      server.registerTool(
        'list_spaces',
        {
          description: 'List currently accessible spaces within this grant.',
          inputSchema: z.strictObject({
            cursor: z.string().max(8192).optional(),
            page_size: z.number().int().min(1).max(100).default(50),
          }),
          annotations,
        },
        (input) =>
          run(async () => {
            const a = await actor(undefined, 'knowledge.read');
            await this.commands.requestQuota(a, ['read']);
            const binding = {
              tool: 'list_spaces',
              grant: a.grantId,
              spaces: a.spaceIds,
              page_size: input.page_size,
            };
            const after = input.cursor
              ? String(openCursor(input.cursor, binding))
              : '';
            const items = await this.commands.listAgentSpaces(
              a,
              after,
              input.page_size + 1,
            );
            return {
              items: items.slice(0, input.page_size),
              next_cursor:
                items.length > input.page_size
                  ? sealCursor(binding, items[input.page_size - 1].id)
                  : null,
            };
          }),
      );
    server.registerTool(
      'get_operation',
      {
        description:
          'Retrieve an operation belonging to this user, application and grant.',
        inputSchema: z
          .strictObject({
            operation_id: z.uuid().optional(),
            tool: z
              .enum([
                'edit_page',
                'update_page_metadata',
                'create_page',
                'create_folder',
                'upload_image',
              ])
              .optional(),
            idempotency_key: key.optional(),
          })
          .refine((input) =>
            input.operation_id
              ? !input.tool && !input.idempotency_key
              : !!input.tool && !!input.idempotency_key,
          ),
        annotations,
      },
      (input) =>
        run(async () => {
          const a = await actor(undefined, 'knowledge.read');
          await this.commands.requestQuota(a, ['query']);
          const result = await this.commands.findOperation(
            a,
            input.operation_id ?? {
              tool: input.tool!,
              key: input.idempotency_key!,
            },
          );
          return {
            operation_id: result.id,
            status: result.status === 'running' ? 'pending' : result.status,
            result: 'result' in result ? result.result : undefined,
          };
        }),
    );
  }
}
