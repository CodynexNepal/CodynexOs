import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'codynex_http_requests_total',
  help: 'Total HTTP requests processed',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: String(res.statusCode),
    });
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
}
