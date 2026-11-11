import { CorsOptions } from 'cors';
import { Request, Response } from 'express';
import { dotEnvConfig } from './envConfig';

const allowedOrigins = dotEnvConfig.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const corsConfig: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Worker-Secret'],
};

export function applyCorsHeaders(req: Request, res: Response): void {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}
