import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { cleanEnvConfig, CleanEnvConfig } from '../functions/env-cleaner.function';

// Resolve .env candidate paths across project root and backend directory
const candidatePaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env.local'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

export const dotEnvConfig: CleanEnvConfig = cleanEnvConfig();
