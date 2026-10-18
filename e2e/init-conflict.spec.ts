import { expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()

test('losing the race to initialize says who holds the shares', async ({ page, request }) => {
  await page.goto('/init')
  await expect(page.getByRole('status')).toHaveText('Not initialized')

  // Another operator initializes between this page's status polls.
  const res = await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })
  expect(res.status()).toBe(200)
  await page.getByRole('button', { name: 'Initialize' }).click()

  await expect(page.getByText('Already initialized by someone else')).toBeVisible()
  await expect(page.getByText('Ask them for your share, then unseal.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Initialize' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Go to Unseal' }).click()
  await expect(page).toHaveURL('/unseal')
})
