import { test as base, expect } from '@playwright/test'
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ConnectionConfig } from '../../src/shared/types'

const MAIN = join(__dirname, '../../out/main/index.js')

interface Fixtures {
  app: ElectronApplication
  page: Page
}

/**
 * Per-test Electron app launched against the built main, pointed at a throwaway
 * userData dir (via TABLEDOCK_USER_DATA) so each test starts with no saved state.
 */
export const test = base.extend<Fixtures>({
  app: async ({}, use) => {
    const userData = mkdtempSync(join(tmpdir(), 'tabledock-e2e-'))
    const app = await _electron.launch({
      args: [MAIN],
      env: { ...process.env, TABLEDOCK_USER_DATA: userData }
    })
    await use(app)
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect }

/** Persist a connection via the preload API, then reload so the sidebar shows it. */
export async function seedConnection(page: Page, config: ConnectionConfig): Promise<void> {
  await page.evaluate(
    (c) =>
      (
        window as unknown as { api: { store: { save(x: unknown): Promise<unknown> } } }
      ).api.store.save(c),
    config
  )
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
}
