import { defineConfig } from 'vitest/config'

// Driver integration tests run under plain Node against the Docker databases
// (test/docker-compose.yml). They import the networked driver classes directly
// — never src/main/db/manager.ts, which pulls in the Electron-ABI better-sqlite3.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    pool: 'forks',
    fileParallelism: false
  }
})
