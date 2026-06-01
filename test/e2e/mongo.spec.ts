import { test, expect, seedConnection } from './fixtures'
import { testConfig } from '../support/dbconfig'

test('browse a seeded Mongo collection', async ({ page }) => {
  await seedConnection(page, testConfig('mongodb'))

  await page.getByText('Test MongoDB').click()
  await page.getByRole('button', { name: 'users' }).click()

  await expect(page.getByText('alice@example.com')).toBeVisible()
})
