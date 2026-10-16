import { expect, test } from '@playwright/test'

test('the console loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('seal-gate')
  await expect(page.getByRole('link', { name: 'seal-gate' })).toBeVisible()
})
