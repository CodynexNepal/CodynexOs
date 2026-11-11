import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../database/database-source';
import { IdempotencyRecordEntity } from '../entities/idempotency-record.entity';

export function idempotencyKeyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string' || !AppDataSource.isInitialized) {
      next();
      return;
    }

    const trimmed = key.trim().slice(0, 128);
    const repo = AppDataSource.getRepository(IdempotencyRecordEntity);

    try {
      const existing = await repo.findOne({ where: { idempotencyKey: trimmed } });
      if (existing && existing.expiresAt.getTime() > Date.now()) {
        res.status(existing.statusCode).json(existing.responseBody);
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          repo
            .save(
              repo.create({
                idempotencyKey: trimmed,
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                responseBody:
                  body && typeof body === 'object' ? (body as Record<string, unknown>) : { data: body },
                expiresAt,
              }),
            )
            .catch(() => {});
        }
        return originalJson(body);
      }) as Response['json'];
    } catch {
      // Never block request if idempotency store fails temporarily
    }

    next();
  };
}
