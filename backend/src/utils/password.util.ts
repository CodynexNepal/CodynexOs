import bcrypt from 'bcrypt';
import { dotEnvConfig } from '../configs/envConfig';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, dotEnvConfig.SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
