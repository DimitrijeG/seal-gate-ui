import { type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()
let shares: string[] = []
let rootToken = ''

const shareField = (page: Page) => page.getByLabel('Your unseal share')
const submit = (page: Page) => page.getByRole('button', { name: 'Submit share' })
const discard = (page: Page) => page.getByRole('button', { name: 'Discard buffered shares' })

async function submitShare(page: Page, share: string) {
  await shareField(page).fill(share)
  await submit(page).click()
}

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${gate.api}/sys/init`, { data: { shares: 3, threshold: 2 } })
  const body = (await res.json()) as { shares: string[]; root_token: string }
  shares = body.shares
  rootToken = body.root_token
})

test('a sealed instance asks for shares and offers nothing it cannot use', async ({ page }) => {
  await page.goto('/unseal')
  await expect(page.getByText('The master key was split into 3 shares. Any 2 key holders')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sealed', level: 2 })).toBeVisible()
  await expect(page.getByText('0 of 2 shares submitted', { exact: true })).toBeVisible()
  await expect(page.getByText(/updated \d+ s ago/)).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  // Nothing is buffered, so there is nothing to discard.
  await expect(discard(page)).toBeDisabled()

  await shareField(page).fill('not a share')
  await expect(page.getByText('Not a share: shares are standard base64.')).toBeVisible()
  await expect(submit(page)).toBeDisabled()
})

test('a share is sent once, masked in the trace, and can be discarded', async ({ page }) => {
  await page.goto('/unseal')
  await page.getByRole('button', { name: 'API trace' }).click()
  await submitShare(page, shares[0]!)

  await expect(page.getByText('1 of 2 shares submitted', { exact: true })).toBeVisible()
  await expect(shareField(page)).toHaveValue('')
  await expect(page.getByRole('complementary', { name: 'API trace' })).toContainText('→ {"share":"••••"}')

  await discard(page).click()
  await expect(page.getByText('0 of 2 shares submitted', { exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'API trace' })).toContainText('→ {"reset":true}')
})

test('a share submitted twice is refused and the buffer kept', async ({ page }) => {
  await page.goto('/unseal')
  await submitShare(page, shares[0]!)
  await expect(page.getByText('Buffered shares are discarded ten minutes after the last one.')).toBeVisible()
  await submitShare(page, shares[0]!)

  await expect(page.getByRole('alert')).toHaveText(
    'That share was already submitted, so it was not counted again. The next one must come from another key holder.',
  )
  await expect(page.getByText('1 of 2 shares submitted', { exact: true })).toBeVisible()
  await discard(page).click()
  await expect(page.getByText('0 of 2 shares submitted', { exact: true })).toBeVisible()
})

test('shares that do not combine are discarded with a warning', async ({ page }) => {
  await page.goto('/unseal')
  // A real share with its last byte changed reaches the threshold but
  // rebuilds the wrong key.
  const bytes = Buffer.from(shares[1]!, 'base64')
  bytes[bytes.length - 1]! ^= 0xff
  await submitShare(page, shares[0]!)
  await expect(page.getByText('1 of 2 shares submitted', { exact: true })).toBeVisible()
  await submitShare(page, bytes.toString('base64'))

  await expect(page.getByRole('alert')).toHaveText(
    'The shares did not combine into the key, so the server discarded them. Start again with correct shares.',
  )
  await expect(page.getByText('0 of 2 shares submitted', { exact: true })).toBeVisible()
})

test('meeting the threshold unseals, and signed out it points to Sign in', async ({ page }) => {
  await page.goto('/unseal')
  await submitShare(page, shares[0]!)
  await expect(page.getByText('1 of 2 shares submitted', { exact: true })).toBeVisible()
  await submitShare(page, shares[1]!)

  await expect(page.getByRole('heading', { name: 'Unsealed', level: 2 })).toBeVisible()
  await expect(page.getByText('Threshold met: key rebuilt')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Unsealed' })).toBeVisible()
  await expect(shareField(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Seal now' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/login')
})

test('signed in, it points to Secrets, and the pill in the header seals', async ({ page }) => {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), rootToken)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Go to Secrets' })).toBeVisible()
  await page.getByRole('button', { name: 'Unsealed' }).click()
  await page.getByRole('button', { name: 'Seal now' }).click()
  await expect(page.getByRole('heading', { name: 'Sealed', level: 2 })).toBeVisible()
  await expect(page.getByText('0 of 2 shares submitted', { exact: true })).toBeVisible()
})

test('a share that arrives after the threshold was met is not needed', async ({ page, request }) => {
  await page.goto('/unseal')
  await expect(page.getByText('0 of 2 shares submitted', { exact: true })).toBeVisible()

  // Other key holders unseal between this page's status polls.
  for (const share of shares.slice(1, 3)) {
    expect((await request.post(`${gate.api}/sys/unseal`, { data: { share } })).status()).toBe(200)
  }
  await submitShare(page, shares[0]!)

  await expect(page.getByText('Already unsealed. Your share was not needed.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unsealed', level: 2 })).toBeVisible()
})
