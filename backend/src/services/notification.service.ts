import { GovernanceRepository } from '../repository/governance.repository';
import { dotEnvConfig } from '../configs/envConfig';
import { createSmtpTransporter } from '../configs/smtp.config';
import { socketServer } from '../socket/socket.server';
import { logger } from '../utils/logger.util';
import { resolveRuntimeSecret } from './runtime-secrets.service';

export class NotificationService {
  constructor(private readonly governanceRepo: GovernanceRepository) {}

  async notifyUser(params: {
    userId: string;
    category: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    linkUrl?: string;
    sendExternal?: boolean;
  }) {
    const channels: string[] = ['DASHBOARD'];

    if (params.sendExternal) {
      const telegramToken = await resolveRuntimeSecret('telegram_bot_token');
      const telegramChatId = await resolveRuntimeSecret('telegram_chat_id');
      if (telegramToken && telegramChatId) {
        try {
          const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: `[CodyNex OS · ${params.severity}] ${params.title}\n\n${params.message}`,
            }),
          });
          if (res.ok) channels.push('TELEGRAM');
        } catch (err) {
          logger.warn('Telegram notification failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const transporter = createSmtpTransporter();
      if (transporter && dotEnvConfig.CEO_EMAIL) {
        try {
          await transporter.sendMail({
            from: dotEnvConfig.SMTP_FROM,
            to: dotEnvConfig.CEO_EMAIL,
            subject: `[CodyNex OS] ${params.title}`,
            text: `${params.title}\n\n${params.message}`,
          });
          channels.push('EMAIL');
        } catch (err) {
          logger.warn('Email notification failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const saved = await this.governanceRepo.saveNotification({
      userId: params.userId,
      category: params.category,
      severity: params.severity,
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl ?? null,
      channelSent: channels,
      isRead: false,
    });

    socketServer.emit('notification:created', {
      id: saved.id,
      category: saved.category,
      severity: saved.severity,
      title: saved.title,
    });

    return saved;
  }

  listForUser(userId: string) {
    return this.governanceRepo.findNotifications(userId);
  }

  markRead(id: string, userId: string) {
    return this.governanceRepo.markNotificationRead(id, userId);
  }

  markAllRead(userId: string) {
    return this.governanceRepo.markAllNotificationsRead(userId);
  }
}
