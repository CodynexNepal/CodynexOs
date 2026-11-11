type LogLevel = 'info' | 'warn' | 'error' | 'fatal' | 'debug';

const REDACT_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'access_token',
  'refresh_token',
  'apiKey',
  'secret',
  'authorization',
]);

function redact(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (REDACT_KEYS.has(key.toLowerCase()) || REDACT_KEYS.has(key)) {
      out[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = redact(val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test' && level === 'debug') return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'fatal') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
  fatal: (msg: string, meta?: Record<string, unknown>) => write('fatal', msg, meta),
};
