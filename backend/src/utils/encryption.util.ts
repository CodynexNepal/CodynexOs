import crypto from 'crypto';
import { dotEnvConfig } from '../configs/envConfig';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(dotEnvConfig.ENCRYPTION_KEY, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const key = deriveKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith('enc:v1:')) {
    return payload;
  }
  const parts = payload.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted secret payload');
  }
  const [, , ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64');
  const authTag = Buffer.from(tagB64!, 'base64');
  const encrypted = Buffer.from(dataB64!, 'base64');
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
