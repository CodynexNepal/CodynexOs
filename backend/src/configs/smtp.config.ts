import nodemailer from 'nodemailer';
import { dotEnvConfig } from './envConfig';

export function createSmtpTransporter() {
  if (!dotEnvConfig.SMTP_HOST || !dotEnvConfig.SMTP_USER || !dotEnvConfig.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: dotEnvConfig.SMTP_HOST,
    port: dotEnvConfig.SMTP_PORT,
    secure: dotEnvConfig.SMTP_SECURE,
    auth: {
      user: dotEnvConfig.SMTP_USER,
      pass: dotEnvConfig.SMTP_PASS,
    },
  });
}
