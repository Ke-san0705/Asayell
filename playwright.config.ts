import { defineConfig } from '@playwright/test'

const origin = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: origin,
    viewport: { width: 320, height: 780 },
    channel: 'chromium',
    launchOptions: { executablePath: process.env.ASAYELL_CHROMIUM_PATH },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: origin + '/Asayell/',
  },
})
