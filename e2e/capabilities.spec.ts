import { type APIRequestContext, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()
let root: Record<string, string> = {}
let shares: string[] = []

// Lets an entity read itself, its groups and its policies, so the console can
// work out what it may do.
const knowSelf = [
  { path: 'system/entities/*', capabilities: ['read'] },
  { path: 'system/groups/*', capabilities: ['read'] },
  { path: 'system/policies/*', capabilities: ['read'] },
]

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

test.beforeAll(async ({ request }) => {
  const init = (await (await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })).json()) as {
    shares: string[]
    root_token: string
  }
  shares = init.shares
  for (const share of shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  root = { Authorization: `Bearer ${init.root_token}` }
  await put(request, '/policies/know-self', { rules: knowSelf })
  await put(request, '/policies/dev-read', { rules: [{ path: 'secrets/dev/*', capabilities: ['read', 'list'] }] })
  await put(request, '/policies/sealer', { rules: [{ path: 'system/seal', capabilities: ['update'] }] })
})

test('known rules hide what the token cannot do', async ({ page, request }) => {
  const bob = await entityWith(request, { policies: ['know-self', 'dev-read'] })
  await signInAs(page, request, bob)
  await page.getByRole('button', { name: 'API trace' }).click()

  // The console read bob's own entity and policies to find out.
  const trace = page.getByRole('complementary', { name: 'API trace' })
  await expect(trace).toContainText(`/v1/entities/${bob}`)
  await expect(trace).toContainText('/v1/policies/dev-read')

  await expect(nav(page)).toHaveText(['Unseal', 'Secrets', 'Identity', 'Policies'])
  await expect(page.getByRole('heading', { name: 'Unsealed', level: 2 })).toBeVisible()
  await expect(sealNow(page)).toHaveCount(0)
})

test('a screen with nothing the token may do there is not offered', async ({ page, request }) => {
  const carol = await entityWith(request, { policies: ['know-self'] })
  await signInAs(page, request, carol)
  await expect(nav(page)).toHaveText(['Unseal', 'Identity', 'Policies'])
})

test('policies that come through a group count', async ({ page, request }) => {
  const group = await request.post(`${gate.api}/groups`, { headers: root, data: { policies: ['sealer'] } })
  const { id: sealers } = (await group.json()) as { id: string }
  const erin = await entityWith(request, { policies: ['know-self'], groups: [sealers] })
  await signInAs(page, request, erin)
  await expect(sealNow(page)).toBeVisible()
})

test('rules it cannot read leave the server to decide', async ({ page, request }) => {
  // Dave may seal but not read himself, so the console cannot know: it
  // offers everything and lets the server answer.
  const dave = await entityWith(request, { policies: ['sealer'] })
  await signInAs(page, request, dave)
  await expect(nav(page)).toHaveText(['Unseal', 'Secrets', 'Identity', 'Policies'])
  await sealNow(page).click()
  await expect(page.getByRole('heading', { name: 'Sealed', level: 2 })).toBeVisible()
})

test('a refusal after the rules changed reads them again', async ({ page, request }) => {
  // The previous test sealed the instance.
  for (const share of shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  const frank = await entityWith(request, { policies: ['know-self', 'sealer'] })
  await signInAs(page, request, frank)
  await expect(sealNow(page)).toBeVisible()

  // An admin takes sealing away while the page is open.
  await put(request, `/entities/${frank}`, { policies: ['know-self'] })
  await sealNow(page).click()

  // The server refuses; the console reads the rules again and stops offering it.
  await expect(sealNow(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Unsealed', level: 2 })).toBeVisible()
})
