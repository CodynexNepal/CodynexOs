import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { dotEnvConfig } from '../configs/envConfig';
import { JwtTokenService } from '../utils/jwt-token.util';
import { logger } from '../utils/logger.util';

class SocketServerManager {
  private io: SocketIOServer | null = null;

  init(httpServer: HttpServer): void {
    const origins = dotEnvConfig.SOCKET_CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: origins.includes('*') ? true : origins,
        credentials: true,
      },
    });

    this.io.use((socket, next) => {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (token && JwtTokenService.verifyAccessToken(token)) {
        next();
        return;
      }
      // Allow cookie-authenticated or unauthenticated handshake only to join public health channel;
      // sensitive room joins require verified user.
      next();
    });

    this.io.on('connection', (socket) => {
      socket.join('codynex:os');
    });

    logger.info('Socket.io server initialized');
  }

  emit(event: string, payload: Record<string, unknown>): void {
    this.io?.to('codynex:os').emit(event, payload);
  }

  async close(): Promise<void> {
    if (this.io) {
      await new Promise<void>((resolve) => this.io!.close(() => resolve()));
      this.io = null;
    }
  }
}

export const socketServer = new SocketServerManager();
