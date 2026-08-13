import { test, expect } from './fixtures'
import { testConfig } from '../support/dbconfig'

test('fill the connection form from a pasted PostgreSQL URL', async ({ page }) => {
  const cfg = testConfig('postgres')
  const url = `postgresql://${cfg.user}:${cfg.password}@${cfg.host}:${cfg.port}/${cfg.database}`

  await page.getByRole('button', { name: 'New connection' }).click()
  await expect(page.getByRole('heading', { name: 'New connection' })).toBeVisible()

  await page.getByPlaceholder('postgresql://user:password@host:5432/database').fill(url)
  await page.getByRole('button', { name: 'Fill' }).click()

  // Every field the URL describes is filled in, including the driver type.
  await expect(page.getByLabel('Type')).toHaveValue('postgres')
  await expect(page.getByLabel('Host')).toHaveValue(cfg.host as string)
  await expect(page.getByLabel('Port')).toHaveValue(String(cfg.port))
  await expect(page.getByLabel('User')).toHaveValue(cfg.user as string)
  await expect(page.getByLabel('Password')).toHaveValue(cfg.password as string)
  await expect(page.getByLabel('Default database (optional)')).toHaveValue(cfg.database as string)
  // The name defaults to the database, and the pasted secret is not left on screen.
  await expect(page.getByLabel('Display name')).toHaveValue(cfg.database as string)
  await expect(page.getByPlaceholder('postgresql://user:password@host:5432/database')).toHaveValue(
    ''
  )

  // The filled-in connection is real: it tests and saves like any other.
  await page.getByRole('button', { name: 'Test' }).click()
  await expect(page.getByText('Connection successful')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(cfg.database as string)).toBeVisible()
})

test('switches the form to MySQL and turns on TLS when the URL asks for it', async ({ page }) => {
  await page.getByRole('button', { name: 'New connection' }).click()
  await page.getByLabel('Type').selectOption('postgres')

  const sslToggle = page.getByRole('switch', { name: 'Enable SSL' })
  await expect(sslToggle).toHaveAttribute('aria-checked', 'false')

  await page
    .getByPlaceholder('postgresql://user:password@host:5432/database')
    .fill('mysql://root:pw@db.internal:3307/shop?ssl-mode=REQUIRED')
  await page.getByRole('button', { name: 'Fill' }).click()

  await expect(page.getByLabel('Type')).toHaveValue('mysql')
  await expect(page.getByLabel('Host')).toHaveValue('db.internal')
  await expect(page.getByLabel('Port')).toHaveValue('3307')
  await expect(sslToggle).toHaveAttribute('aria-checked', 'true')
})

test('reports an unusable connection string instead of filling the form', async ({ page }) => {
  await page.getByRole('button', { name: 'New connection' }).click()
  await page.getByLabel('Host').fill('untouched.example.com')

  await page
    .getByPlaceholder('postgresql://user:password@host:5432/database')
    .fill('mongodb://h/nope')
  await page.getByRole('button', { name: 'Fill' }).click()

  await expect(page.getByText(/Unsupported scheme "mongodb:\/\/"/)).toBeVisible()
  await expect(page.getByLabel('Host')).toHaveValue('untouched.example.com')
})
