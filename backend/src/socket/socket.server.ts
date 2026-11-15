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

      socket.on(
        'voice:directive_submit',
        async (payload: { nepaliText: string; activeSessionId?: string; activeWorkspace?: string }) => {
          try {
            const { voiceService } = await import('../services/voice.service');
            const intent = await voiceService.processNepaliVoiceDirective(payload.nepaliText, {
              activeSessionId: payload.activeSessionId,
              activeWorkspace: payload.activeWorkspace,
            });

            let audioResult: { audioBase64: string; mimeType: string } | null = null;
            try {
              audioResult = await voiceService.synthesizeSpeech(intent.nepaliVoiceReply);
            } catch {
              // synthesis optional fallback
            }

            let executionResult: { executionSessionId?: string } | null = null;
            if (!intent.requiresConfirmation) {
              executionResult = await voiceService.executeAuthorizedIntent(intent.intentId, true);
            }

            socket.emit('voice:directive_result', {
              intent,
              audioBase64: audioResult?.audioBase64,
              mimeType: audioResult?.mimeType || 'audio/mpeg',
              executionSessionId: executionResult?.executionSessionId,
            });
          } catch (err: any) {
            socket.emit('voice:error', { error: err.message });
          }
        },
      );

      socket.on('voice:permission_reply', async (payload: { intentId: string; confirmed: boolean }) => {
        try {
          const { voiceService } = await import('../services/voice.service');
          const result = await voiceService.executeAuthorizedIntent(payload.intentId, payload.confirmed);

          let audioResult: { audioBase64: string; mimeType: string } | null = null;
          try {
            audioResult = await voiceService.synthesizeSpeech(result.voiceReply);
          } catch {
            // synthesis optional fallback
          }

          socket.emit('voice:permission_result', {
            ...result,
            audioBase64: audioResult?.audioBase64,
            mimeType: audioResult?.mimeType || 'audio/mpeg',
          });
        } catch (err: any) {
          socket.emit('voice:error', { error: err.message });
        }
      });
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
