import { type Page, type Route, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

// The shell against a fresh seal-gate, walked from uninitialized to unsealed
// and sealed again. Init and unseal go straight to the API here; their
// screens have tests of their own.
const gate = freshSealGate()
let rootToken = ''
let shares: string[] = []

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('link')

test('a fresh instance opens on Initialize and offers nothing else', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/init')
  await expect(page.getByRole('status')).toHaveText('Not initialized')
  await expect(nav(page)).toHaveText(['Initialize'])
})

test('a working screen redirects to the step the instance needs', async ({ page }) => {
  await page.goto('/secrets')
  await expect(page).toHaveURL('/init')
})

test('the API trace shows requests, and stays open across a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'API trace' }).click()
  const trace = page.getByRole('complementary', { name: 'API trace' })
  await expect(trace).toContainText('GET/v1/sys/status')
  await expect(trace).toContainText('{"initialized":false,"sealed":true,"progress":0}')

  await page.reload()
  await expect(page.getByRole('button', { name: 'API trace' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('complementary', { name: 'API trace' })).toBeVisible()
})

test('an unreachable server shows a banner until it answers again', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Not initialized')

  const refuse = (route: Route) => route.abort('connectionrefused')
  await page.route('**/v1/**', refuse)
  await page.getByRole('button', { name: 'API trace' }).click()
  // Leaving and returning to the tab polls at once instead of waiting.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const banner = page.getByRole('alert')
  await expect(banner).toHaveText(/Can't reach seal-gate\. Trying again in 5 s\./)

  await page.unroute('**/v1/**', refuse)
  await banner.getByRole('button', { name: 'Try now' }).click()
  await expect(banner).toBeHidden()
})

test('a proxy that cannot reach seal-gate counts as unreachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Not initialized')

  // What Vite and Caddy answer while seal-gate is down.
  const badGateway = (route: Route) => route.fulfill({ status: 502, contentType: 'text/plain', body: '' })
  await page.route('**/v1/**', badGateway)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const banner = page.getByRole('alert')
  await expect(banner).toHaveText(/Can't reach seal-gate\./)

  await page.unroute('**/v1/**', badGateway)
  await banner.getByRole('button', { name: 'Try now' }).click()
  await expect(banner).toBeHidden()
})

test('once initialized, the console opens on Unseal', async ({ page, request }) => {
  const res = await request.post(`${gate.api}/sys/init`, { data: { shares: 3, threshold: 2 } })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { shares: string[]; root_token: string }
  shares = body.shares
  rootToken = body.root_token

  await page.goto('/')
  await expect(page).toHaveURL('/unseal')
  await expect(page.getByRole('status')).toHaveText('Sealed')
  await expect(nav(page)).toHaveText(['Unseal'])
})

test('once unsealed, it asks to sign in, and then offers the working screens', async ({ page, request }) => {
  for (const share of shares.slice(0, 2)) {
    expect((await request.post(`${gate.api}/sys/unseal`, { data: { share } })).status()).toBe(200)
  }

  await page.goto('/')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('status')).toHaveText('Unsealed')

  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), rootToken)
  await page.goto('/')
  await expect(page).toHaveURL('/secrets')
  await expect(nav(page)).toHaveText(['Unseal', 'Secrets', 'Identity', 'Policies'])
})

test('sealing while working pauses the page behind a banner', async ({ page, request }) => {
  await page.goto('/')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), rootToken)
  await page.goto('/secrets')
  await expect(page.getByRole('heading', { name: 'Secrets' })).toBeVisible()

  const res = await request.post(`${gate.api}/sys/seal`, { headers: { Authorization: `Bearer ${rootToken}` } })
  expect(res.status()).toBe(204)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  const banner = page.getByRole('alert')
  await expect(banner).toContainText('The instance was sealed. Work is paused.')
  await expect(page).toHaveURL('/secrets')
  await expect(page.getByRole('heading', { name: 'Secrets' })).toBeVisible()
  await expect(page.locator('[inert]')).toContainText('Secrets')

  await banner.getByRole('link', { name: 'Go to Unseal' }).click()
  await expect(page).toHaveURL('/unseal')
})
