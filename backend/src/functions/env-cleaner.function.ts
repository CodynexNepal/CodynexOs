export interface CleanEnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  REDIS_URL: string;
  ENABLE_REDIS: boolean;
  ENABLE_WORKERS: boolean;
  WORKER_POLL_INTERVAL_MS: number;
  WORKER_TICK_SECRET: string;
  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  ACCESS_TOKEN_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
  SALT_ROUNDS: number;
  ENCRYPTION_KEY: string;
  CORS_ORIGIN: string;
  SOCKET_CORS_ORIGIN: string;
  ALLOW_PAID_PROVIDERS: boolean;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_ENABLED: boolean;
  OLLAMA_TIMEOUT_MS: number;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  GITHUB_TOKEN: string;
  GITHUB_DEFAULT_OWNER: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_RECIPIENT_PHONE: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  CEO_EMAIL: string;
  CEO_PASSWORD: string;
  CEO_NAME: string;
}

function getRequiredEnv(key: string, customValue?: string): string {
  const value = customValue !== undefined ? customValue : process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`[Config Error] Missing required environment variable: ${key}`);
  }
  return value.trim();
}

export function cleanTokenExpiry(val?: string, fallback: string = '15m'): string {
  if (!val || typeof val !== 'string') return fallback;
  const cleaned = val.replace(/^["']|["']$/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'undefined' || cleaned.toLowerCase() === 'null') {
    return fallback;
  }
  if (/^\d+$/.test(cleaned) || /^(\d+)\s*(s|m|h|d|w|y)$/i.test(cleaned)) {
    return cleaned;
  }
  return fallback;
}

export function cleanEnvConfig(): CleanEnvConfig {
  const nodeEnv = (process.env.NODE_ENV as CleanEnvConfig['NODE_ENV']) || 'development';
  const isProd = nodeEnv === 'production';

  const port = parseInt(process.env.PORT || '8000', 10);
  const saltRounds = parseInt(process.env.SALT_ROUNDS || '10', 10);
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const pollMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10);
  const ollamaTimeoutRaw = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10);

  const defaultDb = isProd
    ? undefined
    : 'postgresql://postgres:postgres@127.0.0.1:5432/codynex_os_dev';
  const defaultAccess = isProd
    ? undefined
    : 'dev-or-test-access-token-secret-must-be-at-least-32-chars';
  const defaultRefresh = isProd
    ? undefined
    : 'dev-or-test-refresh-token-secret-must-be-at-least-32-chars';
  const defaultEnc = isProd ? undefined : 'dev-32-byte-encryption-key-change-in-prod';
  const defaultWorkerSecret = isProd ? undefined : 'dev-worker-tick-secret-change-in-prod';

  const config: CleanEnvConfig = {
    PORT: Number.isNaN(port) ? 8000 : port,
    NODE_ENV: nodeEnv,
    DATABASE_URL: getRequiredEnv('DATABASE_URL', process.env.DATABASE_URL || defaultDb),
    REDIS_URL: (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim(),
    ENABLE_REDIS: process.env.ENABLE_REDIS === 'true',
    ENABLE_WORKERS: process.env.ENABLE_WORKERS !== 'false',
    WORKER_POLL_INTERVAL_MS: Number.isNaN(pollMs) ? 5000 : Math.max(1000, pollMs),
    WORKER_TICK_SECRET: getRequiredEnv(
      'WORKER_TICK_SECRET',
      process.env.WORKER_TICK_SECRET || defaultWorkerSecret,
    ),
    ACCESS_TOKEN_SECRET: getRequiredEnv(
      'ACCESS_TOKEN_SECRET',
      process.env.ACCESS_TOKEN_SECRET || defaultAccess,
    ),
    REFRESH_TOKEN_SECRET: getRequiredEnv(
      'REFRESH_TOKEN_SECRET',
      process.env.REFRESH_TOKEN_SECRET || defaultRefresh,
    ),
    ACCESS_TOKEN_EXPIRY: cleanTokenExpiry(process.env.ACCESS_TOKEN_EXPIRY, '15m'),
    REFRESH_TOKEN_EXPIRY: cleanTokenExpiry(process.env.REFRESH_TOKEN_EXPIRY, '7d'),
    SALT_ROUNDS: Number.isNaN(saltRounds) ? 10 : saltRounds,
    ENCRYPTION_KEY: getRequiredEnv('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY || defaultEnc),
    CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:3000').trim(),
    SOCKET_CORS_ORIGIN: (
      process.env.SOCKET_CORS_ORIGIN ||
      process.env.CORS_ORIGIN ||
      'http://localhost:3000'
    ).trim(),
    ALLOW_PAID_PROVIDERS: process.env.ALLOW_PAID_PROVIDERS === 'true',
    GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
    GEMINI_MODEL: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(),
    GROQ_API_KEY: (process.env.GROQ_API_KEY || '').trim(),
    GROQ_MODEL: (process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim(),
    OLLAMA_BASE_URL: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim(),
    OLLAMA_MODEL: (process.env.OLLAMA_MODEL || 'qwen3:4b').trim(),
    OLLAMA_ENABLED: process.env.OLLAMA_ENABLED !== 'false',
    OLLAMA_TIMEOUT_MS: Number.isFinite(ollamaTimeoutRaw) && ollamaTimeoutRaw >= 1000 ? ollamaTimeoutRaw : 120000,
    OPENAI_API_KEY: (process.env.OPENAI_API_KEY || '').trim(),
    OPENAI_MODEL: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    GITHUB_TOKEN: (process.env.GITHUB_TOKEN || '').trim(),
    GITHUB_DEFAULT_OWNER: (process.env.GITHUB_DEFAULT_OWNER || '').trim(),
    WHATSAPP_ACCESS_TOKEN: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    WHATSAPP_PHONE_NUMBER_ID: (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    WHATSAPP_RECIPIENT_PHONE: (process.env.WHATSAPP_RECIPIENT_PHONE || '').trim(),
    SMTP_HOST: (process.env.SMTP_HOST || '').trim(),
    SMTP_PORT: Number.isNaN(smtpPort) ? 587 : smtpPort,
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: (process.env.SMTP_USER || '').trim(),
    SMTP_PASS: (process.env.SMTP_PASS || '').trim(),
    SMTP_FROM: (process.env.SMTP_FROM || 'CodyNex OS <noreply@codynex.local>').trim(),
    CEO_EMAIL: (process.env.CEO_EMAIL || 'ceo@codynex.local').trim().toLowerCase(),
    CEO_PASSWORD: process.env.CEO_PASSWORD || 'ChangeMeCEO!2026',
    CEO_NAME: (process.env.CEO_NAME || 'Founder & CEO').trim(),
  };

  return Object.freeze(config);
}
