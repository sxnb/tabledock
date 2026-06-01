import Redis from 'ioredis'
import { test, expect, seedConnection } from './fixtures'
import { testConfig } from '../support/dbconfig'

// Redis has no seed file, so plant a key directly before driving the UI.
test.beforeAll(async () => {
  const cfg = testConfig('redis')
  const client = new Redis({ host: cfg.host, port: cfg.port, lazyConnect: true })
  await client.connect()
  await client.set('greeting', 'hello-from-e2e')
  await client.quit()
})

test('browse a Redis key and its value', async ({ page }) => {
  await seedConnection(page, testConfig('redis'))

  await page.getByText('Test Redis').click()
  await page.getByText('greeting').click()

  await expect(page.getByText('hello-from-e2e')).toBeVisible()
})
