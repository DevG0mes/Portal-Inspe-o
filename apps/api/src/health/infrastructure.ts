import { Pool } from 'pg';
import { Redis } from 'ioredis';
import type { Environment } from '@portal/config';
import type { HealthChecks } from './health.service.js';
import { probeStorage } from './storage-probe.js';

/** Own all probe connections together so shutdown releases sockets deterministically. */
export function createInfrastructure(environment: Environment) {
  const postgres = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 1500,
    query_timeout: 1500,
  });
  // Idle pool failures must not become unhandled EventEmitter errors.
  postgres.on('error', () => {});
  const redis = new Redis(environment.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 1500,
    commandTimeout: 1500,
    maxRetriesPerRequest: 0,
    retryStrategy: () => 1000,
  });
  redis.on('error', () => {});
  void redis.connect().catch(() => {});
  const storageOrigin = `${environment.MINIO_USE_SSL ? 'https' : 'http'}://${environment.MINIO_ENDPOINT}:${environment.MINIO_PORT}`;

  const checks: HealthChecks = {
    postgres: async () => {
      await postgres.query('SELECT 1');
    },
    redis: async () => {
      await redis.ping();
    },
    minio: async () => {
      await probeStorage(storageOrigin);
    },
  };

  return {
    checks,
    async close() {
      redis.disconnect();
      await postgres.end();
    },
  };
}
