import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.spec.ts', 'apps/**/*.test.tsx', 'packages/**/*.spec.ts'],
    environment: 'node',
  },
});
