import { test, expect } from '@playwright/test'
import { _electron, type Page } from 'playwright'
import Redis from 'ioredis'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ConnectionConfig } from '../../src/shared/types'
import { testConfig } from '../support/dbconfig'

const MAIN = join(__dirname, '../../out/main/index.js')
const OUT = join(__dirname, '../../docs/screenshots')
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function seed(page: Page, config: ConnectionConfig): Promise<void> {
  await page.evaluate(
    (c) =>
      (
        window as unknown as { api: { store: { save(x: unknown): Promise<unknown> } } }
      ).api.store.save(c),
    config
  )
}

// Single long flow: one app launch, many screenshots. Not part of the E2E suite.
test('capture documentation screenshots', async () => {
  // A Redis key so the value viewer has something to show.
  const redisCfg = testConfig('redis')
  const r = new Redis({ host: redisCfg.host, port: redisCfg.port, lazyConnect: true })
  await r.connect()
  await r.set('session:42', JSON.stringify({ user: 'alice', roles: ['admin'] }))
  await r.quit()

  const userData = mkdtempSync(join(tmpdir(), 'datadock-shots-'))
  const app = await _electron.launch({
    args: [MAIN],
    env: { ...process.env, DATADOCK_USER_DATA: userData }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 820)
  })

  const shot = (name: string): Promise<Buffer> =>
    page.screenshot({ path: join(OUT, `${name}.png`) })

  // Seed connections so the sidebar is populated, then reload to pick them up.
  await seed(page, testConfig('postgres'))
  await seed(page, testConfig('mongodb'))
  await seed(page, redisCfg)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // 1. Welcome screen (sidebar populated, no connection open).
  await expect(page.getByText('Welcome to DataDock')).toBeVisible()
  await shot('welcome')

  // 2. Command palette.
  await page.keyboard.press(`${MOD}+k`)
  await expect(page.getByPlaceholder('Search connections, tables, actions…')).toBeVisible()
  await shot('command-palette')
  await page.keyboard.press('Escape')

  // 3. Connection form (filled).
  await page.getByRole('button', { name: 'New connection' }).click()
  await page.getByLabel('Display name').fill('Production Postgres')
  await page.getByLabel('Type').selectOption('postgres')
  await page.getByLabel('Host').fill('db.internal')
  await page.getByLabel('Port').fill('5432')
  await page.getByLabel('User').fill('app')
  await page.getByLabel('Default database (optional)').fill('shop')
  await shot('connection-form')
  await page.keyboard.press('Escape')

  // 4. Relational: browse a table.
  await page.getByText('Test Postgres').click()
  await page.getByRole('button', { name: 'users' }).click()
  await expect(page.getByText('alice@example.com')).toBeVisible()
  await shot('table-data')

  // 5. Structure view.
  await page.getByRole('button', { name: 'structure' }).click()
  await expect(page.getByText('CREATE TABLE')).toBeVisible()
  await shot('table-structure')

  // 6. Query editor with results.
  await page.getByRole('button', { name: 'New query tab' }).click()
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.type('SELECT id, email, name FROM users ORDER BY id;')
  await page.keyboard.press(`${MOD}+Enter`)
  await expect(page.getByText('carol@example.com')).toBeVisible()
  await shot('query')

  // 7. ER diagram.
  await page.getByRole('button', { name: 'Relation diagram' }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await page.waitForTimeout(500) // let dagre lay out + edges render
  await shot('er-diagram')

  // 8. MongoDB documents.
  await page.getByText('Test MongoDB').click()
  await page.getByRole('button', { name: 'users' }).click()
  await expect(page.getByText('alice@example.com')).toBeVisible()
  await shot('mongodb')

  // 9. Redis value viewer.
  await page.getByText('Test Redis').click()
  await page.getByText('session:42').click()
  await expect(page.getByText('admin')).toBeVisible()
  await shot('redis')

  await app.close()
  rmSync(userData, { recursive: true, force: true })
})
