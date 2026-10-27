import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './index.js';

const valid = {
  DATABASE_URL: 'postgresql://portal:secret@localhost:5432/portal',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'localhost',
  MINIO_ACCESS_KEY: 'portal',
  MINIO_SECRET_KEY: 'development-secret',
};

describe('environment configuration', () => {
  it('rejects missing credentials before starting services', () => {
    expect(() => loadEnvironment({})).toThrow();
  });

  it('rejects invalid ports instead of starting with an invalid listener', () => {
    expect(() => loadEnvironment({ ...valid, API_PORT: '70000' })).toThrow();
  });

  it('parses environment strings into typed settings', () => {
    expect(loadEnvironment({ ...valid, API_PORT: '3100', MINIO_USE_SSL: 'false' })).toMatchObject({
      API_PORT: 3100,
      MINIO_USE_SSL: false,
    });
  });

  it('rejects an unrecognized SSL value', () => {
    expect(() => loadEnvironment({ ...valid, MINIO_USE_SSL: 'maybe' })).toThrow();
  });
});
