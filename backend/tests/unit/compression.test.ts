import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { compressionMiddleware, shouldCompressPayload } from '../../src/middleware/compression.middleware';

describe('HTTP Data Compression Middleware', () => {
  it('skips payloads below threshold or non-compressible content types', () => {
    expect(shouldCompressPayload('application/json', 500, 1024)).toBe(false);
    expect(shouldCompressPayload('application/json', 2048, 1024)).toBe(true);
    expect(shouldCompressPayload('image/png', 8192, 1024)).toBe(false);
  });

  it('compresses large JSON responses with Brotli (br) and Gzip when accepted', async () => {
    const app = express();
    app.use(compressionMiddleware({ thresholdBytes: 256 }));
    app.get('/large', (_req, res) => {
      res.json({
        items: Array.from({ length: 40 }, (_, i) => ({
          id: i,
          name: `CodyNex OS Autonomous Item ${i}`,
          status: 'COMPLETED',
        })),
      });
    });

    const brRes = await request(app)
      .get('/large')
      .set('Accept-Encoding', 'br, gzip');
    expect(brRes.status).toBe(200);
    expect(brRes.headers['content-encoding']).toBe('br');
    expect(brRes.headers['vary']).toContain('Accept-Encoding');
    expect(brRes.body.items).toHaveLength(40);

    const gzipRes = await request(app)
      .get('/large')
      .set('Accept-Encoding', 'gzip');
    expect(gzipRes.status).toBe(200);
    expect(gzipRes.headers['content-encoding']).toBe('gzip');
    expect(gzipRes.body.items).toHaveLength(40);
  });
});
