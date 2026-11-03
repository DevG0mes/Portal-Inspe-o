import { describe, expect, it } from 'vitest';
import { loadApiEnvironment, loadEnvironment } from './index.js';

const valid = {
  DATABASE_URL: 'postgresql://portal:secret@localhost:5432/portal',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'localhost',
  MINIO_ACCESS_KEY: 'portal',
  MINIO_SECRET_KEY: 'development-secret',
};

describe('environment configuration', () => {
  it('requires only PostgreSQL in the explicit pilot and still requires HTTPS in production', () => {
    const pilot = {
      PORTAL_PILOT: 'true',
      NODE_ENV: 'production',
      DATABASE_URL: valid.DATABASE_URL,
      APP_ORIGIN: 'https://pilot.example.test',
    };
    expect(loadApiEnvironment(pilot)).toMatchObject({
      pilot: true,
      DATABASE_URL: valid.DATABASE_URL,
    });
    expect(() => loadApiEnvironment({ ...pilot, APP_ORIGIN: 'http://pilot.example.test' })).toThrow(
      'APP_ORIGIN',
    );
    expect(() => loadApiEnvironment({ ...pilot, PORTAL_PILOT: 'false' })).toThrow('REDIS_URL');
  });
  it('requires an external HTTPS storage origin in production and rejects credentials or path prefixes', () => {
    const production = { ...valid, NODE_ENV: 'production', APP_ORIGIN: 'https://portal.psi.test' };
    expect(() => loadEnvironment(production)).toThrow();
    for (const MINIO_PUBLIC_URL of [
      'http://files.psi.test',
      'https://secret:password@files.psi.test',
      'https://files.psi.test/prefix',
    ])
      expect(() => loadEnvironment({ ...production, MINIO_PUBLIC_URL })).toThrow();
    expect(
      loadEnvironment({ ...production, MINIO_PUBLIC_URL: 'https://files.psi.test' })
        .MINIO_PUBLIC_URL,
    ).toBe('https://files.psi.test');
  });
  it('requires HTTPS origin in production for secure session cookies', () => {
    expect(() => loadEnvironment({ ...valid, APP_ORIGIN: 'ftp://portal.psi.test' })).toThrow();
    expect(() => loadEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow();
    expect(
      loadEnvironment({
        ...valid,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://portal.psi.test',
        MINIO_PUBLIC_URL: 'https://files.psi.test',
      }).APP_ORIGIN,
    ).toBe('https://portal.psi.test');
  });
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
