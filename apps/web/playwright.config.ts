import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: 'list',
  outputDir: '../../test-results/browser',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    launchOptions: existsSync(edge) ? { executablePath: edge } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // API sign-in fixtures bypass the chooser; UI login still requires an explicit choice.
    storageState: {
      cookies: [
        {
          name: 'portal_presentation',
          value: 'desktop',
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
