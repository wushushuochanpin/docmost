import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SessionService } from '../core/session/session.service';
import { SessionConnectionsService } from '../core/session/session-connections.service';
import { OnModuleDestroy } from '@nestjs/common';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WsService } from './ws.service';
import { getSpaceRoomName, getUserRoomName } from './ws.utils';
import * as cookie from 'cookie';
import { EditorSessionService } from '../core/editor-session/editor-session.service';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EDITOR_SESSION_GRANTED_EVENT,
  EDITOR_SESSION_REVOKED_EVENT,
  EDITOR_SESSION_TAKEOVER_REQUESTED_EVENT,
} from '../core/editor-session/editor-session.constants';
import type { EditorSessionEventPayload } from '../core/editor-session/editor-session.types';

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class WsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly authentication = new WeakMap<Socket, Promise<boolean>>();

  constructor(
    private sessionService: SessionService,
    private sessionConnections: SessionConnectionsService,
    private spaceMemberRepo: SpaceMemberRepo,
    private wsService: WsService,
    private editorSessionService: EditorSessionService,
  ) {}

  afterInit(server: Server): void {
    this.wsService.setServer(server);
  }

  async handleConnection(client: Socket, ...args: any[]): Promise<void> {
    // Nest does not await this lifecycle hook before dispatching socket messages.
    const ready = this.authenticateConnection(client);
    this.authentication.set(client, ready);
    await ready;
  }

  private async authenticateConnection(client: Socket): Promise<boolean> {
    try {
      const rawCookie = client.handshake.headers.cookie;
      if (!rawCookie) {
        throw new Error('Missing auth cookie');
      }

      // Same-origin polling GETs may omit Origin. Fetch Metadata is set by the
      // browser and cannot be supplied by cross-site page JavaScript.
      const headers = client.handshake.headers;
      const origin = headers.origin;
      const host = headers.host;
      const fetchSite = headers['sec-fetch-site'];
      // Follow the application's existing trusted-proxy protocol boundary.
      const forwarded = headers['x-forwarded-proto'];
      const protocol =
        typeof forwarded === 'string'
          ? forwarded.split(',')[0].trim()
          : client.handshake.secure
            ? 'https'
            : 'http';
      const expectedOrigin = `${protocol}://${host}`;
      if (origin) {
        const parsed = new URL(origin);
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.origin !== expectedOrigin ||
          parsed.username ||
          parsed.password ||
          parsed.origin !== origin ||
          fetchSite === 'cross-site'
        )
          throw new Error('Invalid socket origin');
      } else if (fetchSite !== 'same-origin') {
        throw new Error('Missing same-origin socket evidence');
      }

      const cookies = cookie.parse(rawCookie);
      const actor = await this.sessionService.authenticateBrowserCredential(
        cookies['authToken'],
      );
      const userId = actor.user.id;
      const workspaceId = actor.workspace.id;

      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
        userId,
        workspaceId,
      );

      if (!client.connected) return false;

      client.data.workspaceId = workspaceId;
      client.data.userId = userId;
      client.data.sessionId = actor.sessionId;
      client.data.allowedSpaceIds = userSpaceIds;

      const userRoom = getUserRoomName(userId);
      const workspaceRoom = `workspace-${workspaceId}`;
      const spaceRooms = userSpaceIds.map((id) => getSpaceRoomName(id));

      client.join([userRoom, workspaceRoom, ...spaceRooms]);
      this.sessionConnections.register(client, actor.sessionId, () => {
        client.emit('Unauthorized');
        client.disconnect(true);
      });
      return true;
    } catch (err) {
      client.emit('Unauthorized');
      client.disconnect();
      return false;
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.authentication.delete(client);
    this.sessionConnections.unregister(client);
    const workspaceId = client.data?.workspaceId as string | undefined;
    const userId = client.data?.userId as string | undefined;
    const clientIds = Array.isArray(client.data?.editorSessionClientIds)
      ? (client.data.editorSessionClientIds as string[])
      : [];

    if (!workspaceId || !userId || clientIds.length === 0) {
      return;
    }

    await Promise.all(
      clientIds.map((clientId) =>
        this.editorSessionService
          .unregisterClientSocket({
            workspaceId,
            userId,
            clientId,
            socketId: client.id,
          })
          .catch(() => undefined),
      ),
    );
  }

  @SubscribeMessage('message')
  async handleMessage(client: Socket, data: any): Promise<void> {
    const ready = this.authentication.get(client);
    if (!ready || !(await ready) || !client.connected) return;
    try {
      await this.sessionService.assertActiveSession(
        client.data?.sessionId,
        client.data?.userId,
        client.data?.workspaceId,
      );
    } catch {
      client.emit('Unauthorized');
      client.disconnect(true);
      return;
    }
    const workspaceId = client.data?.workspaceId as string | undefined;
    const allowedSpaceIds = Array.isArray(client.data?.allowedSpaceIds)
      ? (client.data.allowedSpaceIds as string[])
      : [];

    if (!workspaceId) {
      client.emit('Unauthorized');
      return;
    }

    if (data?.operation === 'editorSession.registerClient') {
      const userId = client.data?.userId as string | undefined;
      const clientId = data?.clientId as string | undefined;
      if (!userId || !clientId) {
        client.emit('Forbidden');
        return;
      }

      await this.editorSessionService.registerClient({
        workspaceId,
        userId,
        sessionId: client.data?.sessionId ?? null,
        clientId,
        socketId: client.id,
      });
      const existingClientIds = Array.isArray(
        client.data?.editorSessionClientIds,
      )
        ? (client.data.editorSessionClientIds as string[])
        : [];
      client.data.editorSessionClientIds = Array.from(
        new Set([...existingClientIds, clientId]),
      );
      return;
    }

    const spaceEvents = [
      'updateOne',
      'addTreeNode',
      'moveTreeNode',
      'deleteTreeNode',
    ];

    if (spaceEvents.includes(data?.operation) && data?.spaceId) {
      if (!allowedSpaceIds.includes(data.spaceId)) {
        client.emit('Forbidden');
        return;
      }

      const event = {
        ...data,
        workspaceId,
      };

      if (this.wsService.isTreeEvent(event)) {
        await this.wsService.handleTreeEvent(client, event);
      } else {
        const room = getSpaceRoomName(data.spaceId);
        client.broadcast.to(room).emit('message', event);
      }
      return;
    }

    if (data?.workspaceId && data.workspaceId !== workspaceId) {
      client.emit('Forbidden');
      return;
    }

    client.broadcast.to(`workspace-${workspaceId}`).emit('message', {
      ...data,
      workspaceId,
    });
  }

  /*
  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, @MessageBody() roomName: string): void {
    // if room is a space, check if user has permissions
    //client.join(roomName);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, @MessageBody() roomName: string): void {
    client.leave(roomName);
  }
 */

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
    }
  }

  @OnEvent(EDITOR_SESSION_TAKEOVER_REQUESTED_EVENT)
  handleEditorSessionTakeoverRequested(payload: EditorSessionEventPayload) {
    this.emitEditorSessionEvent('editorSession.takeoverRequested', payload);
  }

  @OnEvent(EDITOR_SESSION_GRANTED_EVENT)
  handleEditorSessionGranted(payload: EditorSessionEventPayload) {
    this.emitEditorSessionEvent('editorSession.granted', payload);
  }

  @OnEvent(EDITOR_SESSION_REVOKED_EVENT)
  handleEditorSessionRevoked(payload: EditorSessionEventPayload) {
    this.emitEditorSessionEvent('editorSession.revoked', payload);
  }

  private emitEditorSessionEvent(
    operation: string,
    payload: EditorSessionEventPayload,
  ) {
    if (!payload.socketId || !this.server) return;

    this.server.to(payload.socketId).emit('message', {
      operation,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      clientId: payload.clientId,
      status: payload.status,
      writable: payload.writable,
      takeoverId: payload.takeoverId,
      editSession: payload.lease,
      graceUntil: payload.graceUntil,
      workspaceId: payload.workspaceId,
    });
  }
}
