import nodemailer from 'nodemailer';
import { dotEnvConfig } from './envConfig';

export interface CustomSmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export function createCustomSmtpTransporter(options: CustomSmtpOptions) {
  if (!options.host || !options.user || !options.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: {
      user: options.user,
      pass: options.pass,
    },
  });
}

export function createSmtpTransporter() {
  if (!dotEnvConfig.SMTP_HOST || !dotEnvConfig.SMTP_USER || !dotEnvConfig.SMTP_PASS) {
    return null;
  }

  return createCustomSmtpTransporter({
    host: dotEnvConfig.SMTP_HOST,
    port: dotEnvConfig.SMTP_PORT,
    secure: dotEnvConfig.SMTP_SECURE,
    user: dotEnvConfig.SMTP_USER,
    pass: dotEnvConfig.SMTP_PASS,
  });
}
