import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.spec.ts', 'apps/**/*.test.tsx', 'packages/**/*.spec.ts'],
    exclude: ['apps/web/e2e/**', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
