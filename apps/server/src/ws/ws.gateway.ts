import {
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../core/auth/services/token.service';
import { JwtPayload, JwtType } from '../core/auth/dto/jwt-payload';
import { OnModuleDestroy } from '@nestjs/common';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import * as cookie from 'cookie';

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class WsGateway implements OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer()
  server: Server;
  constructor(
    private tokenService: TokenService,
    private spaceMemberRepo: SpaceMemberRepo,
  ) {}

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
      client.data.allowedSpaceIds = userSpaceIds;

      const workspaceRoom = `workspace-${workspaceId}`;
      const spaceRooms = userSpaceIds.map((id) => this.getSpaceRoomName(id));

      client.join([workspaceRoom, ...spaceRooms]);
    } catch (err) {
      client.emit('Unauthorized');
      client.disconnect();
    }
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, data: any): void {
    const workspaceId = client.data?.workspaceId as string | undefined;
    const allowedSpaceIds = Array.isArray(client.data?.allowedSpaceIds)
      ? (client.data.allowedSpaceIds as string[])
      : [];

    if (!workspaceId) {
      client.emit('Unauthorized');
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

      const room = this.getSpaceRoomName(data.spaceId);
      client.broadcast.to(room).emit('message', {
        ...data,
        workspaceId,
      });
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

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, @MessageBody() roomName: string): void {
    // if room is a space, check if user has permissions
    //client.join(roomName);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, @MessageBody() roomName: string): void {
    client.leave(roomName);
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
    }
  }

  getSpaceRoomName(spaceId: string): string {
    return `space-${spaceId}`;
  }
}
