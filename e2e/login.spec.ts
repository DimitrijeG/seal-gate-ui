import { type APIRequestContext, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()
let shares: string[] = []
let rootToken = ''

const session = (page: Page) => page.getByRole('button', { name: /^Signed in as/ })
const storedToken = (page: Page) => page.evaluate(() => sessionStorage.getItem('seal-gate.token'))

async function signInAsAlice(page: Page) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('alice')
  await page.getByLabel('Password').fill('demo-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/secrets')
}

async function selfStatus(request: APIRequestContext, token: string | null): Promise<number> {
  const res = await request.get(`${gate.api}/auth/token/self`, { headers: { Authorization: `Bearer ${token}` } })
  return res.status()
}

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })
  const body = (await res.json()) as { shares: string[]; root_token: string }
  shares = body.shares
  rootToken = body.root_token
})

test('while sealed, sign-in waits for Unseal', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('The instance is sealed. Sign-in works once it is unsealed.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Username' }).fill('alice')
  await page.getByLabel('Password').fill('demo-password')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Go to Unseal' })).toBeVisible()
})

test('a wrong password is refused without saying which part was wrong', async ({ page, request }) => {
  for (const share of shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  const auth = { Authorization: `Bearer ${rootToken}` }
  const entity = await request.post(`${gate.api}/entities`, { headers: auth, data: { alias: 'alice' } })
  const { id } = (await entity.json()) as { id: string }
  const user = await request.put(`${gate.api}/auth/users/alice`, { headers: auth, data: { entity_id: id, password: 'demo-password' } })
  expect(user.status()).toBe(204)

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('alice')
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('signing in with a username lands on the working screens as that entity', async ({ page }) => {
  await signInAsAlice(page)
  await expect(session(page)).toContainText('alice')

  await session(page).click()
  await expect(page.getByText(/^Token expires \d+ \w{3} \d\d:\d\d UTC$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rotate token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revoke token' })).toBeVisible()

  // The trace, kept in memory across the redirect, shows the login with the
  // password and the token masked.
  await page.getByRole('button', { name: 'API trace' }).click()
  const trace = page.getByRole('complementary', { name: 'API trace' })
  await expect(trace).toContainText('→ {"username":"alice","password":"••••"}')
  await expect(trace).toContainText('"token":"••••"')
})

test('a pasted token is checked before it is kept', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Token' }).click()
  const field = page.getByPlaceholder('Paste a token')
  await field.fill('not a token')
  await expect(page.getByText('Not a token: tokens are standard base64.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()

  await field.fill('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Missing or invalid token.')
  expect(await storedToken(page)).toBeNull()
})

test('the root token signs in, and offers neither rotate nor revoke', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Token' }).click()
  await page.getByPlaceholder('Paste a token').fill(rootToken)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/secrets')
  await expect(session(page)).toContainText('root')

  await session(page).click()
  await expect(page.getByText('Root token · does not expire')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rotate token' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Revoke token' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/login')
  expect(await storedToken(page)).toBeNull()
})

test('rotating replaces the token, and the old one stops working', async ({ page, request }) => {
  await signInAsAlice(page)
  const before = await storedToken(page)
  await session(page).click()
  await page.getByRole('button', { name: 'Rotate token' }).click()

  await expect.poll(() => storedToken(page)).not.toBe(before)
  expect(await selfStatus(request, before)).toBe(401)
  expect(await selfStatus(request, await storedToken(page))).toBe(200)
})

test('revoking signs out, and the token stops working', async ({ page, request }) => {
  await signInAsAlice(page)
  const before = await storedToken(page)
  await session(page).click()
  await page.getByRole('button', { name: 'Revoke token' }).click()

  await expect(page).toHaveURL('/login')
  expect(await storedToken(page)).toBeNull()
  expect(await selfStatus(request, before)).toBe(401)
})

test('a token revoked elsewhere ends the session where the user is', async ({ page, request }) => {
  await signInAsAlice(page)
  await page.goto('/policies')
  // The reload reads the identity again; revoking before that read lands
  // would end the session at once, not on the next action.
  await expect(session(page)).toBeVisible()
  const current = await storedToken(page)

  // Revoked from somewhere else; the next request finds out.
  await request.post(`${gate.api}/auth/token/revoke`, { headers: { Authorization: `Bearer ${current}` } })
  await session(page).click()
  await page.getByRole('button', { name: 'Rotate token' }).click()

  const dialog = page.getByRole('dialog', { name: 'Session ended' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Sign in again to carry on where you were.')
  await expect(page).toHaveURL('/policies')

  await dialog.getByRole('link', { name: 'Sign in' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill('alice')
  await page.getByLabel('Password').fill('demo-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/policies')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
