import { test, expect } from './fixtures'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test('welcome screen renders and the command palette opens', async ({ page }) => {
  await expect(page.getByText('Welcome to DataDock')).toBeVisible()

  await page.keyboard.press(`${MOD}+k`)
  const search = page.getByPlaceholder('Search connections, tables, actions…')
  await expect(search).toBeVisible()

  // Filtering: a no-match query shows the empty state.
  await search.fill('zzzz-no-such-command')
  await expect(page.getByText('No matches')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(search).toBeHidden()
})
