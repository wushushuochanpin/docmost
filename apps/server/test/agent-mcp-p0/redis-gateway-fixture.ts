import { CollaborationGateway } from '../../src/collaboration/collaboration.gateway';
import { DurableDocumentExtension } from '../../src/collaboration/extensions/durable-document.extension';
import { DocumentCommandService } from '../../src/core/document-command/document-command.service';
import { WebSocketServer } from 'ws';
export async function redisGateway(
  commands: DocumentCommandService,
  actor: { userId: string; workspaceId: string; sessionId: string },
) {
  if (!process.env.P0_REDIS_URL?.startsWith('redis://127.0.0.1:'))
    throw Error('Isolated Redis required');
  const docs = new Set<any>();
  let disconnected = 0;
  const gateway = new CollaborationGateway(
    {
      onAuthenticate: async () => ({
        user: { id: actor.userId, workspaceId: actor.workspaceId },
        sessionId: actor.sessionId,
      }),
    } as any,
    {} as any,
    new DurableDocumentExtension(commands),
    {
      priority: 10000,
      onLoadDocument: async ({ document }: any) => {
        docs.add(document);
      },
      onDisconnect: async () => {
        disconnected++;
      },
    } as any,
    {
      getRedisUrl: () => process.env.P0_REDIS_URL,
      isCollabDisableRedis: () => false,
    } as any,
    { getHandlers: () => ({}) } as any,
  );
  const hocus = (gateway as any).hocuspocus;
  hocus.configuration.debounce = 1;
  hocus.configuration.maxDebounce = 1;
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => server.once('listening', r));
  server.on('connection', (socket, request) =>
    gateway.handleConnection(socket, request),
  );
  return {
    gateway,
    server,
    url: `ws://127.0.0.1:${(server.address() as any).port}/?documentProtocol=1`,
    disconnected: () => disconnected,
    async close() {
      hocus.closeConnections();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise((r) => setTimeout(r, 50));
      await Promise.allSettled([...hocus.loadingDocuments.values()]);
      for (const doc of docs) doc.destroy();
      hocus.documents.clear();
      await gateway.destroy(null as any);
    },
  };
}
