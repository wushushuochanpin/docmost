import { Hocuspocus } from '@hocuspocus/server';
import { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { AuthenticationExtension } from './extensions/authentication.extension';
import { PersistenceExtension } from './extensions/persistence.extension';
import { Injectable } from '@nestjs/common';
import { EnvironmentService } from '../integrations/environment/environment.service';
import {
  createRetryStrategy,
  nanoIdGen,
  parseRedisUrl,
  RedisConfig,
} from '../common/helpers';
import { LoggerExtension } from './extensions/logger.extension';
import {
  RedisSyncExtension,
  SerializedHTTPRequest,
} from './extensions/redis-sync';
import { WsSocketWrapper } from './extensions/redis-sync/ws-socket-wrapper';
import RedisClient from 'ioredis';
import { pack, unpack } from 'msgpackr';
import * as os from 'node:os';
import { CollabWsAdapter } from './adapter/collab-ws.adapter';
import {
  CollaborationHandler,
  CollabEventHandlers,
} from './collaboration.handler';

@Injectable()
export class CollaborationGateway {
  private readonly hocuspocus: Hocuspocus;
  private redisConfig: RedisConfig;
  private readonly redisSync: RedisSyncExtension<any> | null =
    null;
  private readonly withRedis: boolean;

  constructor(
    private authenticationExtension: AuthenticationExtension,
    private persistenceExtension: PersistenceExtension,
    private loggerExtension: LoggerExtension,
    private environmentService: EnvironmentService,
    private collabEventsService: CollaborationHandler,
  ) {
    this.redisConfig = parseRedisUrl(this.environmentService.getRedisUrl());
    this.withRedis = !this.environmentService.isCollabDisableRedis();

    this.hocuspocus = new Hocuspocus({
      debounce: 10000,
      maxDebounce: 45000,
      unloadImmediately: false,
      extensions: [
        this.authenticationExtension,
        this.persistenceExtension,
        this.loggerExtension,
      ],
    });

    if (this.withRedis) {
      this.redisSync = new RedisSyncExtension({
        redis: new RedisClient({
          host: this.redisConfig.host,
          port: this.redisConfig.port,
          password: this.redisConfig.password,
          db: this.redisConfig.db,
          family: this.redisConfig.family,
          retryStrategy: createRetryStrategy(),
        }),
        serverId: `collab-${os?.hostname()}-${nanoIdGen(10)}`,
        prefix: 'collab',
        pack,
        unpack,
        customEvents: this.collabEventsService.getHandlers(this.hocuspocus) as any,
      });
      this.hocuspocus.configuration.extensions.push(this.redisSync);
      (this.redisSync as any).onConfigure({ instance: this.hocuspocus });
    }
  }

  private serializeRequest(request: IncomingMessage): SerializedHTTPRequest {
    return {
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      headers: {
        'sec-websocket-key': request.headers['sec-websocket-key'] ?? '',
        'sec-websocket-protocol':
          request.headers['sec-websocket-protocol'] ?? '',
      },
      socket: { remoteAddress: request.socket?.remoteAddress ?? '' },
    };
  }

  private createRequest(request: IncomingMessage) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        if (value.length > 0 && value[0] !== undefined) {
          headers.set(key, value[0]);
        }
        continue;
      }

      if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const host = headers.get('host') || '127.0.0.1';
    const requestUrl = new URL(request.url ?? '/', `http://${host}`);

    return new Request(requestUrl, {
      method: request.method ?? 'GET',
      headers,
    });
  }

  handleConnection(client: WebSocket, request: IncomingMessage): any {
    if (this.redisSync) {
      const serializedHTTPRequest = this.serializeRequest(request);
      const socketId = serializedHTTPRequest.headers['sec-websocket-key'];

      // Create wrapper socket that only receives events via emit()
      // This prevents double-handling since Hocuspocus won't listen to raw WebSocket events
      const wrappedSocket = new WsSocketWrapper(client);

      // Route through RedisSync extension (this calls handleConnection internally)
      this.redisSync.onSocketOpen(wrappedSocket as any, serializedHTTPRequest);

      // Forward raw WebSocket messages to the extension
      client.on('message', (data: ArrayBuffer) => {
        this.redisSync!.onSocketMessage(
          wrappedSocket as any,
          serializedHTTPRequest,
          data,
        );
      });

      // Forward close events
      client.on('close', (code: number, reason: Buffer) => {
        this.redisSync!.onSocketClose(socketId, code, reason.buffer as ArrayBuffer);
      });

      // Forward pong events for keepalive
      client.on('pong', (data: Buffer) => {
        wrappedSocket.emit('pong', data);
      });
    } else {
      // Fallback to direct Hocuspocus connection
      const clientConnection = this.hocuspocus.handleConnection(
        client as any,
        this.createRequest(request),
        {},
      );

      client.on('message', (data: Buffer | ArrayBuffer) => {
        clientConnection.handleMessage(new Uint8Array(data as ArrayBufferLike));
      });

      client.on('close', (code: number, reason: Buffer) => {
        clientConnection.handleClose({
          code,
          reason: reason ? reason.toString('utf8') : '',
        });
      });
    }
  }

  getConnectionCount() {
    return this.hocuspocus.getConnectionsCount();
  }

  getDocumentCount() {
    return this.hocuspocus.getDocumentsCount();
  }

  handleYjsEvent<TName extends keyof CollabEventHandlers>(
    eventName: TName,
    documentName: string,
    payload: Parameters<CollabEventHandlers[TName]>[1],
  ) {
    return this.redisSync?.handleEvent(eventName, documentName, payload);
  }

  openDirectConnection(documentName: string, context?: any) {
    return this.hocuspocus.openDirectConnection(documentName, context);
  }

  /*
   *Can be used before calling openDirectConnection directly
   */
  async lockDocument(documentName: string) {
    return this.redisSync.lockDocument(documentName);
  }

  /*
   *Releases a document lock and stops the interval that maintains it.
   */
  async releaseLock(documentName: string) {
    return this.redisSync.releaseLock(documentName);
  }

  async destroy(collabWsAdapter: CollabWsAdapter): Promise<void> {
    // Track the cleanup handler to remove it after use, preventing leaks
    // if destroy() is called multiple times.
    const cleanupHandler = {
      async afterUnloadDocument({ instance }: { instance: Hocuspocus }) {
        if (instance.getDocumentsCount() === 0) {
          // Remove this handler to prevent accumulation
          const extensions = instance.configuration.extensions;
          const idx = extensions.indexOf(cleanupHandler);
          if (idx !== -1) {
            extensions.splice(idx, 1);
          }
        }
      },
    };

    // eslint-disable-next-line no-async-promise-executor
    await new Promise<void>(async (resolve) => {
      try {
        // Wait for all documents to unload
        this.hocuspocus.configuration.extensions.push(cleanupHandler);

        collabWsAdapter?.close();

        if (this.hocuspocus.getDocumentsCount() === 0) {
          this.hocuspocus.configuration.extensions =
            this.hocuspocus.configuration.extensions.filter(
              (e) => e !== cleanupHandler,
            );
          resolve();
        }

        // The cleanupHandler will call resolve indirectly via the
        // document count check above if documents unload later.
        // Add a safety timeout to prevent hanging indefinitely.
        const safetyTimeout = setTimeout(() => {
          const extensions = this.hocuspocus.configuration.extensions;
          const idx = extensions.indexOf(cleanupHandler);
          if (idx !== -1) {
            extensions.splice(idx, 1);
          }
          resolve();
        }, 30_000);

        // Hook into the resolve path from the cleanup handler
        const origAfterUnload = cleanupHandler.afterUnloadDocument;
        cleanupHandler.afterUnloadDocument = async (args) => {
          await origAfterUnload(args);
          clearTimeout(safetyTimeout);
          resolve();
        };

        this.hocuspocus.closeConnections();
      } catch (error) {
        console.error(error);
        resolve();
      }
    });

    await this.hocuspocus.hooks('onDestroy', { instance: this.hocuspocus });
  }
}
