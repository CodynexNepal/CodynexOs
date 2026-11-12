import { GovernanceRepository } from '../repository/governance.repository';
import { dotEnvConfig } from '../configs/envConfig';
import { createSmtpTransporter } from '../configs/smtp.config';
import { socketServer } from '../socket/socket.server';
import { logger } from '../utils/logger.util';
import { resolveRuntimeSecret } from './runtime-secrets.service';
import type { BusinessEmailService } from './business-email.service';

export class NotificationService {
  constructor(
    private readonly governanceRepo: GovernanceRepository,
    private readonly businessEmailService?: BusinessEmailService,
  ) {}

  async notifyUser(params: {
    userId: string;
    category: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    linkUrl?: string;
    sendExternal?: boolean;
    businessId?: string;
    emailAccountId?: string;
  }) {
    const channels: string[] = ['DASHBOARD'];

    if (params.sendExternal) {
      const whatsappToken = await resolveRuntimeSecret('whatsapp_access_token');
      const whatsappPhoneId = await resolveRuntimeSecret('whatsapp_phone_number_id');
      const whatsappRecipient = await resolveRuntimeSecret('whatsapp_recipient_phone');
      if (whatsappToken && whatsappPhoneId && whatsappRecipient) {
        try {
          const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(whatsappPhoneId)}/messages`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${whatsappToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: whatsappRecipient,
              type: 'text',
              text: {
                body: `[CodyNex OS · ${params.severity}] ${params.title}\n\n${params.message}`,
              },
            }),
          });
          if (res.ok) channels.push('WHATSAPP');
        } catch (err) {
          logger.warn('WhatsApp notification failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (dotEnvConfig.CEO_EMAIL) {
        try {
          if (this.businessEmailService) {
            await this.businessEmailService.sendEmail({
              businessId: params.businessId,
              emailAccountId: params.emailAccountId,
              to: dotEnvConfig.CEO_EMAIL,
              subject: `[CodyNex OS] ${params.title}`,
              text: `${params.title}\n\n${params.message}`,
            });
            channels.push('EMAIL');
          } else {
            const transporter = createSmtpTransporter();
            if (transporter) {
              await transporter.sendMail({
                from: dotEnvConfig.SMTP_FROM,
                to: dotEnvConfig.CEO_EMAIL,
                subject: `[CodyNex OS] ${params.title}`,
                text: `${params.title}\n\n${params.message}`,
              });
              channels.push('EMAIL');
            }
          }
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
