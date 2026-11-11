import { config } from 'dotenv';
import { cleanEnvConfig, CleanEnvConfig } from '../functions/env-cleaner.function';

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === 'production') {
  config({ path: '.env', override: false });
} else {
  config({ path: '.env.local', override: false });
  config({ path: '.env', override: false });
}

export const dotEnvConfig: CleanEnvConfig = cleanEnvConfig();
