import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1, // run sequentially to prevent resource contention on SQLite / uvicorn
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    defaultBrowserType: 'chromium',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    bypassCSP: true,
  },
  projects: [
    {
      name: 'Small-Mobile-320',
      use: {
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'iPhone-SE-375',
      use: {
        ...devices['iPhone SE'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Standard-Mobile-390',
      use: {
        ...devices['iPhone 12'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Large-Mobile-430',
      use: {
        ...devices['iPhone 14 Pro Max'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Android-Mobile-360',
      use: {
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Small-Tablet-600',
      use: {
        viewport: { width: 600, height: 960 },
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'iPad-Portrait-768',
      use: {
        ...devices['iPad (gen 7)'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Tablet-Landscape-1024',
      use: {
        ...devices['iPad (gen 7) landscape'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Small-Laptop-1280',
      use: {
        viewport: { width: 1280, height: 720 },
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Desktop-1440',
      use: {
        viewport: { width: 1440, height: 900 },
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Large-Desktop-1920',
      use: {
        viewport: { width: 1920, height: 1080 },
        defaultBrowserType: 'chromium',
      },
    },
  ],
});
