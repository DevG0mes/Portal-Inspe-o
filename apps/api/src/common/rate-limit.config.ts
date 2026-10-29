import type { RequestHandler } from 'express';

/** Local defense in depth; production ingress also limits real clients before the BFF.
 * Transport peers only: forwarded headers are never trusted. Bounded memory, fail closed.
 */
export function authenticationLimit(limit = 120, now = Date.now): RequestHandler {
  const windows = new Map<string, { until: number; count: number }>();
  return (request, response, next) => {
    if (
      request.method !== 'POST' ||
      !/^\/api\/auth\/(login|change-password)\/?$/i.test(request.path)
    )
      return next();
    const time = now();
    for (const [key, value] of windows) if (value.until <= time) windows.delete(key);
    const key = request.socket.remoteAddress ?? 'unknown';
    let window = windows.get(key);
    if (!window && windows.size < 10000) {
      window = { until: time + 60000, count: 0 };
      windows.set(key, window);
    }
    if (!window || ++window.count > limit) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(((window?.until ?? time + 60000) - time) / 1000))),
      );
      response.status(429).json({
        statusCode: 429,
        message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
        requestId: response.getHeader('X-Request-Id'),
      });
      return;
    }
    next();
  };
}
