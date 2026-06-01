import { defineConfig } from '@playwright/test'

// Drives the built app to capture documentation screenshots into docs/screenshots.
// Separate from the E2E config (playwright.config.ts) so `npm run test:e2e`
// never runs it. Invoke via `npm run docs:screenshots`.
export default defineConfig({
  testDir: './test/screenshots',
  workers: 1,
  timeout: 120000,
  reporter: [['list']]
})
