import { type APIRequestContext, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()
let root: Record<string, string> = {}
let shares: string[] = []

async function put(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.put(`${gate.api}${path}`, { headers: root, data })
  expect(res.status(), path).toBe(204)
}

async function entityWith(request: APIRequestContext, body: { policies?: string[]; groups?: string[] }) {
  const res = await request.post(`${gate.api}/entities`, { headers: root, data: body })
  return ((await res.json()) as { id: string }).id
}

async function signInAs(page: Page, request: APIRequestContext, id: string) {
  const res = await request.post(`${gate.api}/entities/${id}/tokens`, { headers: root, data: {} })
  const { token } = (await res.json()) as { token: string }
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), token)
  await page.reload()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('link')
const sealNow = (page: Page) => page.getByRole('button', { name: 'Seal now' })
// Sealing lives in the header: the Unsealed pill opens it.
const openSeal = (page: Page) => page.getByRole('button', { name: 'Unsealed' }).click()

test.beforeAll(async ({ request }) => {
  const init = (await (await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })).json()) as {
    shares: string[]
    root_token: string
  }
  shares = init.shares
  for (const share of shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  root = { Authorization: `Bearer ${init.root_token}` }
  await put(request, '/policies/dev-read', { rules: [{ path: 'secrets/dev/*', capabilities: ['read', 'list'] }] })
  await put(request, '/policies/sealer', { rules: [{ path: 'system/seal', capabilities: ['update'] }] })
})

test('known rules hide what the token cannot do', async ({ page, request }) => {
  const bob = await entityWith(request, { policies: ['dev-read'] })
  await signInAs(page, request, bob)
  await page.getByRole('button', { name: 'API trace' }).click()

  // One call says what bob may do; nothing of his is read to work it out.
  const trace = page.getByRole('complementary', { name: 'API trace' })
  await expect(trace).toContainText('/v1/auth/token/self/rules')
  await expect(trace).not.toContainText(`/v1/entities/${bob}`)
  await expect(trace).not.toContainText('/v1/policies/')

  await expect(nav(page)).toHaveText(['Secrets'])
  await expect(page.getByRole('heading', { name: 'Unsealed', level: 2 })).toBeVisible()
  await openSeal(page)
  await expect(page.getByText('This token may not seal the instance.')).toBeVisible()
  await expect(sealNow(page)).toHaveCount(0)
})

test('a screen with nothing the token may do there is not offered, but Secrets always is', async ({ page, request }) => {
  const carol = await entityWith(request, {})
  await signInAs(page, request, carol)
  await expect(nav(page)).toHaveText(['Secrets'])

  // The logo goes home, which tells her what she may see and whom to ask.
  await page.getByRole('link', { name: 'seal-gate' }).click()
  await expect(page).toHaveURL('/secrets')
  await expect(page.getByText('This token may not see any secrets. An administrator can grant access with a policy.')).toBeVisible()
})

test('policies that come through a group count', async ({ page, request }) => {
  const group = await request.post(`${gate.api}/groups`, { headers: root, data: { policies: ['sealer'] } })
  const { id: sealers } = (await group.json()) as { id: string }
  const erin = await entityWith(request, { groups: [sealers] })
  await signInAs(page, request, erin)
  await openSeal(page)
  await expect(sealNow(page)).toBeVisible()
})

test('rules the server could not report leave it to decide', async ({ page, request }) => {
  const dave = await entityWith(request, { policies: ['sealer'] })
  await page.route('**/v1/auth/token/self/rules', (route) =>
    route.fulfill({ status: 500, json: { errors: ['internal error'] } }),
  )
  await signInAs(page, request, dave)

  // Not knowing, the console offers everything and lets the server answer.
  await expect(nav(page)).toHaveText(['Secrets', 'Identity', 'Policies'])
  await openSeal(page)
  await sealNow(page).click()
  await expect(page.getByRole('heading', { name: 'Sealed', level: 2 })).toBeVisible()
})

test('a refusal after the rules changed reads them again', async ({ page, request }) => {
  // The previous test sealed the instance.
  for (const share of shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  const frank = await entityWith(request, { policies: ['sealer'] })
  await signInAs(page, request, frank)
  await openSeal(page)
  await expect(sealNow(page)).toBeVisible()

  // An admin takes sealing away while the page is open.
  await put(request, `/entities/${frank}`, { policies: [] })
  await sealNow(page).click()

  // The server refuses; the console reads the rules again and stops offering it.
  await expect(sealNow(page)).toHaveCount(0)
  await expect(page.getByText('This token may not seal the instance.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unsealed', level: 2 })).toBeVisible()
})
