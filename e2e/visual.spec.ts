import { type APIRequestContext, type Locator, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

// One baseline per screen. The spec walks its own instance from
// uninitialized to unsealed, so the screens that only exist before init get
// their turn first; the rest run against the same fixtures.
//
// Baselines are per platform and per browser (Playwright puts the platform in
// the file name), so they are only meaningful where they were taken. Delete
// the -snapshots folder and run with --update-snapshots to take them again.
const gate = freshSealGate()

// The design draws at 1440; the screens lay out in columns below that.
test.use({ viewport: { width: 1440, height: 900 } })

let root: Record<string, string> = {}
let rootToken = ''
const ids: Record<string, string> = {}
let ready = false

async function put(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.put(`${gate.api}${path}`, { headers: root, data })
  expect(res.status(), path).toBe(204)
}

async function create(request: APIRequestContext, path: string, data: unknown): Promise<string> {
  const res = await request.post(`${gate.api}${path}`, { headers: root, data })
  expect(res.status(), path).toBe(201)
  return ((await res.json()) as { id: string }).id
}

// Initializes and keeps the root token, leaving the instance sealed.
async function initialize(request: APIRequestContext) {
  if (rootToken !== '') return
  const res = await request.post(`${gate.api}/sys/init`, { data: { shares: 5, threshold: 3 } })
  const init = (await res.json()) as { shares: string[]; root_token: string }
  rootToken = init.root_token
  root = { Authorization: `Bearer ${rootToken}` }
  ids.shares = init.shares.join('|')
}

// Unseals and fills the instance with the design's example content.
async function fixtures(request: APIRequestContext) {
  await initialize(request)
  if (ready) return
  for (const share of ids.shares!.split('|')) {
    await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  }

  await put(request, '/policies/dev-read', {
    rules: [
      { path: 'secrets/dev/*', capabilities: ['read', 'list'] },
      { path: 'secrets/shared/config/*', capabilities: ['read', 'list'] },
      { path: 'secrets/dev/feature-flags', capabilities: ['read', 'update'] },
      { path: 'secrets/db/postgres/*', capabilities: ['list'] },
      { path: 'secrets/dev/admin-key', capabilities: ['deny'] },
    ],
  })
  await put(request, '/policies/dev-write', { rules: [{ path: 'secrets/dev/*', capabilities: ['update'] }] })
  await put(request, '/policies/audit-read', { rules: [{ path: 'secrets/*', capabilities: ['list'] }] })

  ids.developers = await create(request, '/groups', { alias: 'developers', policies: ['dev-read', 'dev-write'] })
  ids.auditors = await create(request, '/groups', { alias: 'auditors', policies: ['audit-read'] })
  ids.alice = await create(request, '/entities', { alias: 'alice', policies: ['dev-read'], groups: [ids.auditors] })
  ids.bob = await create(request, '/entities', { alias: 'bob', groups: [ids.developers] })
  await put(request, '/auth/users/alice', { entity_id: ids.alice, password: 'alice-password' })
  await put(request, '/auth/users/ana.oncall', { entity_id: ids.bob, password: 'ana-password' })

  await put(request, '/secrets/shared/config/base-url', { value: btoa('https://api.example.test') })
  await put(request, '/secrets/db/postgres/password', { value: btoa('hunter2') })
  const gen = await request.post(`${gate.api}/secrets/generate/dev/api-token`, {
    headers: root,
    data: { length: 32, ttl: 86400 },
  })
  expect(gen.status()).toBe(201)
  ready = true
}

async function signIn(page: Page, at: string) {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), rootToken)
  await page.goto(at)
}

// Takes the baseline once the web fonts have arrived: they load from Google
// with display=swap, so a shot taken too early catches the fallback face.
async function shot(page: Page, name: string, mask: Locator[] = []) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask })
}

// Random IDs and anything clock-dependent, which differ every run.
const entityId = (page: Page) => page.locator('.identity-detail__id code')
const timing = (page: Page) => page.locator('.secrets-timing dd')
const polled = (page: Page) => page.locator('.unseal__progress-head .field__hint')

test('initialize', async ({ page }) => {
  await page.goto('/init')
  await expect(page.getByRole('heading', { level: 1, name: 'Initialize' })).toBeVisible()
  await shot(page, 'init')
})

test('unseal, sealed', async ({ page, request }) => {
  await initialize(request)
  await page.goto('/unseal')
  await expect(page.getByRole('heading', { name: 'Sealed' })).toBeVisible()
  await shot(page, 'unseal-sealed', [polled(page)])
})

test('sign in', async ({ page, request }) => {
  await fixtures(request)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await shot(page, 'login')
})

test('unseal, unsealed', async ({ page, request }) => {
  await fixtures(request)
  await signIn(page, '/unseal')
  await expect(page.getByRole('heading', { name: 'Unsealed' })).toBeVisible()
  await shot(page, 'unseal-unsealed', [polled(page)])
})

test('secrets', async ({ page, request }) => {
  await fixtures(request)
  await signIn(page, '/secrets/')
  await expect(page.getByRole('link', { name: /dev/ }).first()).toBeVisible()
  await shot(page, 'secrets-list')

  await page.goto('/secrets/dev/api-token')
  await expect(page.getByRole('heading', { level: 2, name: 'api-token' })).toBeVisible()
  await shot(page, 'secret-detail', [timing(page)])
})

test('identity', async ({ page, request }) => {
  await fixtures(request)
  await signIn(page, '/identity/entities')
  await expect(page.getByRole('list', { name: 'Entity names' })).toBeVisible()
  await shot(page, 'identity-entities')

  await page.goto(`/identity/entities/${ids.alice}`)
  await expect(page.getByRole('heading', { level: 2, name: 'alice' })).toBeVisible()
  await expect(page.getByText('from auditors')).toBeVisible()
  await shot(page, 'entity-detail', [entityId(page)])

  await page.goto(`/identity/groups/${ids.developers}`)
  await expect(page.getByRole('heading', { level: 2, name: 'developers' })).toBeVisible()
  await shot(page, 'group-detail', [entityId(page)])

  await page.goto('/identity/usernames')
  await expect(page.getByRole('list', { name: 'Stored usernames' })).toBeVisible()
  await shot(page, 'identity-usernames')
})

test('policies', async ({ page, request }) => {
  await fixtures(request)
  await signIn(page, '/policies')
  await expect(page.getByRole('list', { name: 'Policy names' })).toBeVisible()
  await shot(page, 'policies-list')

  await page.goto('/policies/dev-read')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('All changes saved')).toBeVisible()
  await shot(page, 'policy-grid')
})
