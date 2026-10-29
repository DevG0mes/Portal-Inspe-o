import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { OperationalLog } from './logging.js';

export function requestContext(log: OperationalLog): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    Object.assign(request, { requestId });
    const started = performance.now();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.once('finish', () =>
      log({
        event: response.statusCode >= 500 ? 'http.failed' : 'http.completed',
        requestId,
        method: request.method,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    next();
  };
}
