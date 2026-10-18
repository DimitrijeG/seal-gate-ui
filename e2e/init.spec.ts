import { readFileSync } from 'node:fs'
import { type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

freshSealGate()

const shareRows = (page: Page) => page.getByRole('list').getByRole('listitem')

test('the form opens with the design defaults and checks what is typed', async ({ page }) => {
  await page.goto('/init')
  const shares = page.getByLabel('Shares')
  const threshold = page.getByLabel('Threshold')
  const initialize = page.getByRole('button', { name: 'Initialize' })
  await expect(shares).toHaveValue('5')
  await expect(threshold).toHaveValue('3')
  await expect(page.getByText('any 3 rebuild it')).toBeVisible()

  await threshold.fill('6')
  await expect(page.getByText('At most the share count, 5.')).toBeVisible()
  await expect(threshold).toHaveAttribute('aria-invalid', 'true')
  await expect(initialize).toBeDisabled()

  await shares.fill('1')
  await expect(page.getByText('A whole number from 2 to 255.')).toBeVisible()
  await expect(initialize).toBeDisabled()

  await shares.fill('255')
  await expect(initialize).toBeEnabled()
  await expect(page.getByText('any 6 rebuild it')).toBeVisible()
})

test('initializing shows each share and the root token once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/init')
  await page.getByRole('button', { name: 'API trace' }).click()
  await page.getByLabel('Shares').fill('3')
  await page.getByLabel('Threshold').fill('2')
  await page.getByRole('button', { name: 'Initialize' }).click()

  await expect(page.getByRole('heading', { name: 'Shares and root token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Initialize' })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Sealed')
  await expect(shareRows(page)).toHaveCount(3)

  // The trace shows the request and that three shares came back, masked.
  const trace = page.getByRole('complementary', { name: 'API trace' })
  await expect(trace).toContainText('→ {"shares":3,"threshold":2}')
  await expect(trace).toContainText('"shares":["••••","••••","••••"],"root_token":"••••"')

  // Revealing one hides the others.
  const first = shareRows(page).nth(0).locator('code')
  const second = shareRows(page).nth(1).locator('code')
  await expect(first).toHaveText(/^•+$/)
  await page.getByRole('button', { name: 'Reveal Share 1' }).click()
  await expect(first).not.toHaveText(/•/)
  const shareOne = await first.textContent()
  await page.getByRole('button', { name: 'Reveal Share 2' }).click()
  await expect(first).toHaveText(/^•+$/)
  await expect(second).not.toHaveText(/•/)

  await page.getByRole('button', { name: 'Copy Share 1' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shareOne)

  // The download holds what the server returned.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download as JSON' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('seal-gate-init.json')
  const saved = JSON.parse(readFileSync(await download.path(), 'utf8')) as { shares: string[]; root_token: string }
  expect(saved.shares).toHaveLength(3)
  expect(saved.shares[0]).toBe(shareOne)
  expect(saved.root_token).toMatch(/^[A-Za-z0-9+/]+=*$/)

  // Leaving before they are stored asks first.
  const unseal = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Unseal' })
  page.once('dialog', (dialog) => void dialog.dismiss())
  await unseal.click()
  await expect(page).toHaveURL('/init')
  await expect(shareRows(page)).toHaveCount(3)

  const proceed = page.getByRole('button', { name: 'Continue to unseal' })
  await expect(proceed).toBeDisabled()
  await page.getByLabel('I have stored the shares and the root token').check()
  await proceed.click()
  await expect(page).toHaveURL('/unseal')
})

test('an initialized instance sends Initialize on to Unseal', async ({ page }) => {
  await page.goto('/init')
  await expect(page).toHaveURL('/unseal')
})
