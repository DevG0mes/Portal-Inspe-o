import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from 'minio';
import { loadEnvironment } from '@portal/config';
import { createInfrastructure } from '../src/health/infrastructure.js';
import { createApplication } from '../src/app.js';

process.loadEnvFile('.env');
const environment = loadEnvironment(process.env);
const infrastructure = createInfrastructure(environment);
const app = await createApplication(infrastructure.checks, () => infrastructure.close());

beforeAll(async () => {
  await app.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await app.close();
});

it('reports real PostgreSQL, Redis and MinIO connections as ready', async () => {
  const origin = await app.getUrl();
  await expect
    .poll(
      async () => {
        const response = await fetch(`${origin}/api/health/ready`);
        return { code: response.status, body: await response.json() };
      },
      { timeout: 10000 },
    )
    .toEqual({
      code: 200,
      body: { status: 'ok', dependencies: { postgres: 'up', redis: 'up', minio: 'up' } },
    });
});

it('authenticates to storage and round-trips an object in an isolated temporary bucket', async () => {
  const storage = new Client({
    endPoint: environment.MINIO_ENDPOINT,
    port: environment.MINIO_PORT,
    useSSL: environment.MINIO_USE_SSL,
    accessKey: environment.MINIO_ACCESS_KEY,
    secretKey: environment.MINIO_SECRET_KEY,
  });
  const bucket = `portal-test-${randomUUID()}`;
  const content = Buffer.from('Portal: evidência de integração');
  await storage.makeBucket(bucket);
  try {
    await storage.putObject(bucket, 'evidence.txt', content);
    const stream = await storage.getObject(bucket, 'evidence.txt');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('Portal: evidência de integração');
  } finally {
    await storage.removeObject(bucket, 'evidence.txt');
    await storage.removeBucket(bucket);
  }
});
