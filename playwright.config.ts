import { defineConfig } from '@playwright/test'

import { fixtureKey, fixtureUrl } from './e2e/supabaseFixture'

const localOrigin = 'http://127.0.0.1:4173'
const supabaseOrigin = 'http://127.0.0.1:4174'
const pages = process.env.ASAYELL_TEST_PAGES === '1'

const projects = pages
  ? [{ name: 'pages', use: { baseURL: 'https://ke-san0705.github.io' } }]
  : [
      { name: 'local', use: { baseURL: localOrigin } },
      { name: 'supabase', use: { baseURL: supabaseOrigin } },
    ]

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    viewport: { width: 320, height: 780 },
    channel: 'chromium',
    launchOptions: { executablePath: process.env.ASAYELL_CHROMIUM_PATH },
  },
  projects,
  webServer: pages ? undefined : [
    {
      env: { VITE_ASAYELL_REPOSITORY: 'local' },
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      url: localOrigin + '/Asayell/',
    },
    {
      env: {
        VITE_ASAYELL_REPOSITORY: 'supabase',
        VITE_SUPABASE_URL: fixtureUrl,
        VITE_SUPABASE_ANON_KEY: fixtureKey,
      },
      command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
      url: supabaseOrigin + '/Asayell/',
    },
  ],
})
