import { test, expect, seedConnection } from './fixtures'
import { testConfig } from '../support/dbconfig'

test('browse a seeded Postgres table and its structure', async ({ page }) => {
  await seedConnection(page, testConfig('postgres'))

  await page.getByText('Test Postgres').click()
  await page.getByRole('button', { name: 'users' }).click()

  // Data view shows seeded rows.
  await expect(page.getByText('alice@example.com')).toBeVisible()

  // Structure view shows the synthesized CREATE statement and indexes.
  await page.getByRole('button', { name: 'structure' }).click()
  await expect(page.getByText('CREATE TABLE')).toBeVisible()
  await expect(page.getByText('users_email_key')).toBeVisible()
})
