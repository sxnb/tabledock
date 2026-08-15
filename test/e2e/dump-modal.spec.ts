import { test, expect, seedConnection } from './fixtures'
import { testConfig } from '../support/dbconfig'
import type { Page, ElectronApplication } from 'playwright'

/** Open the dump modal the way the native "Create database dump…" menu item does. */
async function openDumpModal(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:dump')
  })
  await expect(page.getByRole('heading', { name: 'Create database dump' })).toBeVisible()
}

test('offers the CREATE TABLE toggle, on by default, for a relational connection', async ({
  app,
  page
}) => {
  await seedConnection(page, testConfig('postgres'))
  await page.getByText('Test Postgres').click()
  await openDumpModal(app, page)

  const schema = page.getByRole('switch', { name: 'Include schema (CREATE TABLE and more)' })
  await expect(schema).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/Types, tables, constraints, indexes/)).toBeVisible()

  await schema.click()
  await expect(schema).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Data only — the dump contains INSERT statements')).toBeVisible()
})

test('hides the CREATE TABLE toggle for a non-relational connection', async ({ app, page }) => {
  await seedConnection(page, testConfig('redis'))
  await page.getByText('Test Redis').click()
  await openDumpModal(app, page)

  await expect(
    page.getByRole('switch', { name: 'Include schema (CREATE TABLE and more)' })
  ).toHaveCount(0)
  // The CREATE DATABASE toggle stays, marked as not applicable.
  await expect(page.getByText('Not applicable for this connection type.')).toBeVisible()
})
