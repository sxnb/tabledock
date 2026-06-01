import { defineConfig } from '@playwright/test'

// E2E tests launch the built Electron app (out/main/index.js) and drive the UI.
// One worker: the app instance and the shared Docker databases are global state.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]]
})
