import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface NotificationPayload {
  type: 'collection_created' | 'collection_received' | 'collection_cancelled' | 'machine_approved' | 'machine_rejected';
  data: any;
  timestamp: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('NotificationsGateway');
  private connectedClients: Map<string, { socketId: string; userId: string; role: string }> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.secret'),
      });

      this.connectedClients.set(client.id, {
        socketId: client.id,
        userId: payload.sub,
        role: payload.role,
      });

      // Join role-based rooms
      client.join(`role:${payload.role}`);
      client.join(`user:${payload.sub}`);

      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub}, role: ${payload.role})`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      this.logger.log(`Client disconnected: ${client.id} (user: ${clientInfo.userId})`);
      this.connectedClients.delete(client.id);
    }
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): string {
    return 'pong';
  }

  // Notify all connected managers and admins about new collection
  notifyNewCollection(collection: any) {
    const payload: NotificationPayload = {
      type: 'collection_created',
      data: collection,
      timestamp: new Date(),
    };

    this.server.to('role:manager').to('role:admin').emit('notification', payload);
    this.logger.debug(`Notified managers/admins about new collection: ${collection.id}`);
  }

  // Notify operator when their collection is received
  notifyCollectionReceived(collection: any, operatorId: string) {
    const payload: NotificationPayload = {
      type: 'collection_received',
      data: collection,
      timestamp: new Date(),
    };

    this.server.to(`user:${operatorId}`).emit('notification', payload);
    this.server.to('role:admin').emit('notification', payload);
    this.logger.debug(`Notified operator ${operatorId} about received collection: ${collection.id}`);
  }

  // Notify about cancelled collection
  notifyCollectionCancelled(collection: any, operatorId: string) {
    const payload: NotificationPayload = {
      type: 'collection_cancelled',
      data: collection,
      timestamp: new Date(),
    };

    this.server.to(`user:${operatorId}`).emit('notification', payload);
    this.server.to('role:manager').to('role:admin').emit('notification', payload);
  }

  // Notify about machine approval
  notifyMachineApproved(machine: any, creatorId: string) {
    const payload: NotificationPayload = {
      type: 'machine_approved',
      data: machine,
      timestamp: new Date(),
    };

    this.server.to(`user:${creatorId}`).emit('notification', payload);
    this.server.to('role:admin').emit('notification', payload);
  }

  // Notify about machine rejection
  notifyMachineRejected(machine: any, creatorId: string) {
    const payload: NotificationPayload = {
      type: 'machine_rejected',
      data: machine,
      timestamp: new Date(),
    };

    this.server.to(`user:${creatorId}`).emit('notification', payload);
  }

  // Broadcast to all connected clients
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
