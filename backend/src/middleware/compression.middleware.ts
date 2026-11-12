import { NextFunction, Request, Response } from 'express';
import zlib from 'zlib';

const COMPRESSIBLE_TYPES =
  /^(text\/|application\/(json|javascript|xml|x-ndjson)|.*\+json|.*\+xml)/i;

export interface CompressionOptions {
  thresholdBytes?: number;
}

export function shouldCompressPayload(
  contentType: string | number | string[] | undefined,
  byteLength: number,
  thresholdBytes = 1024,
): boolean {
  if (byteLength < thresholdBytes) return false;
  const typeStr = Array.isArray(contentType)
    ? contentType[0]
    : typeof contentType === 'string'
      ? contentType
      : '';
  if (!typeStr) return false;
  return COMPRESSIBLE_TYPES.test(typeStr.split(';')[0]!.trim());
}

function selectEncoding(acceptEncodingHeader: string | string[] | undefined): 'br' | 'gzip' | 'deflate' | null {
  const header = Array.isArray(acceptEncodingHeader)
    ? acceptEncodingHeader.join(',')
    : acceptEncodingHeader || '';
  if (!header) return null;

  const normalized = header.toLowerCase();
  if (/\bbr\b/.test(normalized)) return 'br';
  if (/\bgzip\b/.test(normalized)) return 'gzip';
  if (/\bdeflate\b/.test(normalized)) return 'deflate';
  return null;
}

function compressBuffer(encoding: 'br' | 'gzip' | 'deflate', payload: Buffer): Buffer {
  if (encoding === 'br') {
    return zlib.brotliCompressSync(payload, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
      },
    });
  }
  if (encoding === 'gzip') {
    return zlib.gzipSync(payload, { level: 6 });
  }
  return zlib.deflateSync(payload, { level: 6 });
}

export function compressionMiddleware(options: CompressionOptions = {}) {
  const thresholdBytes = options.thresholdBytes ?? 1024;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'HEAD' || req.headers['x-no-compression']) {
      next();
      return;
    }

    const encoding = selectEncoding(req.headers['accept-encoding']);
    if (!encoding) {
      next();
      return;
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = ((body: unknown) => {
      if (res.headersSent || res.getHeader('Content-Encoding')) {
        return originalJson(body);
      }

      const jsonText = JSON.stringify(body);
      const rawBuf = Buffer.from(jsonText, 'utf8');
      if (rawBuf.byteLength < thresholdBytes) {
        return originalJson(body);
      }

      const compressed = compressBuffer(encoding, rawBuf);
      if (compressed.byteLength >= rawBuf.byteLength) {
        return originalJson(body);
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.byteLength));
      return originalSend(compressed);
    }) as Response['json'];

    res.send = ((body?: unknown) => {
      if (
        res.headersSent ||
        res.getHeader('Content-Encoding') ||
        res.statusCode < 200 ||
        res.statusCode === 204 ||
        res.statusCode === 304
      ) {
        return originalSend(body);
      }

      if (typeof body !== 'string' && !Buffer.isBuffer(body)) {
        return originalSend(body);
      }

      const rawBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
      const contentType = res.getHeader('Content-Type') ?? (typeof body === 'string' ? 'text/html' : undefined);

      if (!shouldCompressPayload(contentType, rawBuf.byteLength, thresholdBytes)) {
        return originalSend(body);
      }

      const compressed = compressBuffer(encoding, rawBuf);
      if (compressed.byteLength >= rawBuf.byteLength) {
        return originalSend(body);
      }

      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.byteLength));
      return originalSend(compressed);
    }) as Response['send'];

    next();
  };
}
