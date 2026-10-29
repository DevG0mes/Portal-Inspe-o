import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplication } from '../src/app.js';
import type { INestApplication } from '@nestjs/common';

describe('health HTTP contract', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  async function start(checks: Record<string, () => Promise<void>>) {
    app = await createApplication(checks);
    await app.listen(0, '127.0.0.1');
    return app.getUrl();
  }

  it('keeps liveness independent of infrastructure availability', async () => {
    const url = await start({
      postgres: async () => {
        throw new Error('private credentials');
      },
    });
    const response = await fetch(`${url}/api/health/live`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('reports all required dependencies when ready', async () => {
    const url = await start({
      postgres: async () => {},
      redis: async () => {},
      minio: async () => {},
    });
    const response = await fetch(`${url}/api/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      dependencies: { postgres: 'up', redis: 'up', minio: 'up' },
    });
  });

  it('returns 503 and sanitized dependency states on failure', async () => {
    const url = await start({
      postgres: async () => {
        throw new Error('private credentials');
      },
      redis: async () => {},
      minio: async () => {},
    });
    const response = await fetch(`${url}/api/health/ready`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'unavailable',
      dependencies: { postgres: 'down', redis: 'up', minio: 'up' },
      statusCode: 503,
      requestId: response.headers.get('x-request-id'),
    });
  });
});
