import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { authService } from '../services/web3/AuthService';
import { WebSocketMessage, FundingRateData, PositionPnL } from '../types/index';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  walletAddress?: string;
}

export class WebSocketBroadcaster {
  private io: SocketIOServer;
  private authenticatedClients = new Map<string, AuthenticatedSocket>();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const tokenPayload = authService.verifyToken(token);
        if (!tokenPayload) {
          return next(new Error('Invalid authentication token'));
        }

        const user = await authService.getUserFromToken(token);
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.walletAddress = user.walletAddress;
        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`✅ WebSocket client connected: ${socket.id} (User: ${socket.walletAddress})`);
      
      if (socket.userId) {
        this.authenticatedClients.set(socket.id, socket);
        
        // Join user-specific room
        socket.join(`user:${socket.userId}`);
        
        // Join global funding rates room
        socket.join('funding-rates');
      }

      socket.on('subscribe-positions', () => {
        if (socket.userId) {
          socket.join(`positions:${socket.userId}`);
          socket.emit('subscription-confirmed', { channel: 'positions' });
        }
      });

      socket.on('subscribe-opportunities', () => {
        socket.join('opportunities');
        socket.emit('subscription-confirmed', { channel: 'opportunities' });
      });

      socket.on('unsubscribe-positions', () => {
        if (socket.userId) {
          socket.leave(`positions:${socket.userId}`);
          socket.emit('unsubscription-confirmed', { channel: 'positions' });
        }
      });

      socket.on('unsubscribe-opportunities', () => {
        socket.leave('opportunities');
        socket.emit('unsubscription-confirmed', { channel: 'opportunities' });
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date() });
      });

      socket.on('disconnect', (reason) => {
        console.log(`❌ WebSocket client disconnected: ${socket.id} (Reason: ${reason})`);
        this.authenticatedClients.delete(socket.id);
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to Funding Arbitrage WebSocket',
        userId: socket.userId,
        timestamp: new Date(),
      });
    });
  }

  public broadcastFundingRatesUpdate(rates: FundingRateData[]): void {
    const message: WebSocketMessage = {
      type: 'funding-rates-update',
      data: rates,
      timestamp: new Date(),
    };

    this.io.to('funding-rates').emit('funding-rates-update', message.data);
    console.log(`📡 Broadcasted funding rates update to ${this.getClientCount('funding-rates')} clients`);
  }

  public broadcastPositionPnLUpdate(userId: string, positionPnL: PositionPnL): void {
    const message: WebSocketMessage = {
      type: 'position-pnl-update',
      data: positionPnL,
      timestamp: new Date(),
      userId,
    };

    this.io.to(`positions:${userId}`).emit('position-pnl-update', message.data);
    this.io.to(`user:${userId}`).emit('position-pnl-update', message.data);
  }

  public broadcastOpportunityAlert(opportunity: any): void {
    const message: WebSocketMessage = {
      type: 'opportunity-alert',
      data: opportunity,
      timestamp: new Date(),
    };

    this.io.to('opportunities').emit('opportunity-alert', message.data);
    console.log(`🚨 Broadcasted opportunity alert: ${opportunity.token} (${opportunity.spreadAPR}% APR)`);
  }

  public broadcastPositionClosed(userId: string, positionId: string, reason: string, pnl: number): void {
    const message: WebSocketMessage = {
      type: 'position-closed',
      data: {
        positionId,
        reason,
        pnl,
        timestamp: new Date(),
      },
      timestamp: new Date(),
      userId,
    };

    this.io.to(`positions:${userId}`).emit('position-closed', message.data);
    this.io.to(`user:${userId}`).emit('position-closed', message.data);
  }

  public broadcastSystemAlert(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const alert: WebSocketMessage = {
      type: 'system-alert',
      data: {
        message,
        level,
        timestamp: new Date(),
      },
      timestamp: new Date(),
    };

    this.io.emit('system-alert', alert.data);
    console.log(`📢 System alert broadcasted: ${message} (${level})`);
  }

  public sendToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public getConnectedClients(): number {
    return this.authenticatedClients.size;
  }

  public getClientCount(room?: string): number {
    if (!room) return this.io.engine.clientsCount;
    
    const roomSockets = this.io.sockets.adapter.rooms.get(room);
    return roomSockets ? roomSockets.size : 0;
  }

  public getRoomStats(): { [key: string]: number } {
    const stats: { [key: string]: number } = {};
    
    // Get stats for known rooms
    const knownRooms = ['funding-rates', 'opportunities'];
    knownRooms.forEach(room => {
      stats[room] = this.getClientCount(room);
    });

    stats.totalConnections = this.getConnectedClients();
    return stats;
  }

  public disconnectUser(userId: string, reason: string = 'Server disconnect'): void {
    this.authenticatedClients.forEach((socket, socketId) => {
      if (socket.userId === userId) {
        socket.disconnect();
        console.log(`🔌 Disconnected user ${userId} from socket ${socketId}: ${reason}`);
      }
    });
  }

  public close(): void {
    this.io.close();
    this.authenticatedClients.clear();
    console.log('🔌 WebSocket server closed');
  }
}

let broadcasterInstance: WebSocketBroadcaster | null = null;

export const createWebSocketBroadcaster = (httpServer: HTTPServer): WebSocketBroadcaster => {
  if (broadcasterInstance) {
    return broadcasterInstance;
  }
  
  broadcasterInstance = new WebSocketBroadcaster(httpServer);
  return broadcasterInstance;
};

export const getWebSocketBroadcaster = (): WebSocketBroadcaster | null => {
  return broadcasterInstance;
};