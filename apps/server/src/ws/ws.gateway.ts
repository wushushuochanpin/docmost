import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../core/auth/services/token.service';
import { JwtPayload, JwtType } from '../core/auth/dto/jwt-payload';
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
  implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  constructor(
    private tokenService: TokenService,
    private spaceMemberRepo: SpaceMemberRepo,
    private wsService: WsService,
    private editorSessionService: EditorSessionService,
  ) {}

  afterInit(server: Server): void {
    this.wsService.setServer(server);
  }

  async handleConnection(client: Socket, ...args: any[]): Promise<void> {
    try {
      const rawCookie = client.handshake.headers.cookie;
      if (!rawCookie) {
        throw new Error('Missing auth cookie');
      }

      const cookies = cookie.parse(rawCookie);
      const token: JwtPayload = await this.tokenService.verifyJwt(
        cookies['authToken'],
        JwtType.ACCESS,
      );

      const userId = token.sub;
      const workspaceId = token.workspaceId;

      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
        userId,
        workspaceId,
      );

      client.data.workspaceId = workspaceId;
      client.data.userId = userId;
      client.data.sessionId = token.sessionId ?? null;
      client.data.allowedSpaceIds = userSpaceIds;

      const userRoom = getUserRoomName(userId);
      const workspaceRoom = `workspace-${workspaceId}`;
      const spaceRooms = userSpaceIds.map((id) => getSpaceRoomName(id));

      client.join([userRoom, workspaceRoom, ...spaceRooms]);
    } catch (err) {
      client.emit('Unauthorized');
      client.disconnect();
    }
  }

  @SubscribeMessage('message')
  async handleMessage(client: Socket, data: any): Promise<void> {
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
