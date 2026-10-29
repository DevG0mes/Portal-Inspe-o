import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.e2e-spec.ts'],
    environment: 'node',
    testTimeout: 10000,
    // Each suite creates/drops a PostgreSQL database; bound simultaneous DDL and checkpoints.
    maxWorkers: 4,
  },
});
