import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4323',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx astro preview --port 4323',
    port: 4323,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'Mobile-360',
      use: { viewport: { width: 360, height: 800 } },
    },
    {
      name: 'Mobile-390',
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'Tablet-768',
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'Desktop-1280',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
