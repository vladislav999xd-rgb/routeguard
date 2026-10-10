import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:8010', channel: 'msedge', trace: 'retain-on-failure' },
  reporter: [['list']],
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'laptop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
