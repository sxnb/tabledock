import { test, expect } from './fixtures'
import { testConfig } from '../support/dbconfig'

test('create a Postgres connection through the form', async ({ page }) => {
  const cfg = testConfig('postgres')
  await page.getByRole('button', { name: 'New connection' }).click()
  await expect(page.getByRole('heading', { name: 'New connection' })).toBeVisible()

  await page.getByLabel('Display name').fill('E2E Postgres')
  await page.getByLabel('Type').selectOption('postgres')
  await page.getByLabel('Host').fill(cfg.host as string)
  await page.getByLabel('Port').fill(String(cfg.port))
  await page.getByLabel('User').fill(cfg.user as string)
  await page.getByLabel('Password').fill(cfg.password as string)
  await page.getByLabel('Default database (optional)').fill(cfg.database as string)

  await page.getByRole('button', { name: 'Test' }).click()
  await expect(page.getByText('Connection successful')).toBeVisible()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('E2E Postgres')).toBeVisible()
})
