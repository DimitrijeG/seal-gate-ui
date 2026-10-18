import { type APIRequestContext, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()
let root: Record<string, string> = {}
let rootToken = ''

const browser = (page: Page) => page.getByRole('region', { name: 'Browse secrets' })
const rows = (page: Page) => browser(page).getByRole('list', { name: 'Contents' }).getByRole('listitem')
const detail = (page: Page) => page.getByRole('region', { name: /./ }).filter({ has: page.locator('#detail-h') })

async function putSecret(request: APIRequestContext, path: string, value: string, ttl?: number) {
  const data = { value: Buffer.from(value).toString('base64'), ...(ttl ? { ttl } : {}) }
  expect((await request.put(`${gate.api}/secrets/${path}`, { headers: root, data })).status()).toBe(204)
}

async function readSecret(request: APIRequestContext, path: string) {
  const res = await request.get(`${gate.api}/secrets/${path}`, { headers: root })
  return (await res.json()) as { value: string; generated: boolean }
}

async function signIn(page: Page, token: string, at = '/secrets') {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), token)
  await page.goto(at)
}

test.beforeAll(async ({ request }) => {
  const init = (await (await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })).json()) as {
    shares: string[]
    root_token: string
  }
  for (const share of init.shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  rootToken = init.root_token
  root = { Authorization: `Bearer ${rootToken}` }
  await putSecret(request, 'db/postgres/app-user', 'hunter2')
  await putSecret(request, 'db/redis', 'r')
  await putSecret(request, 'top', 't')
  const gen = await request.post(`${gate.api}/secrets/generate/db/postgres/billing-user`, {
    headers: root,
    data: { length: 32, ttl: 604800 },
  })
  expect(gen.status()).toBe(201)
})

test('the top level shows folders with counts, and secrets', async ({ page }) => {
  await signIn(page, rootToken)
  await expect(page.getByText('4 secrets. Values are encrypted')).toBeVisible()
  await expect(rows(page)).toHaveText([/db\/\s*3 secrets/, /top/])
  await expect(browser(page).getByText('1 folder, 1–1 of 1 secret in the top level')).toBeVisible()

  await rows(page).filter({ hasText: 'db/' }).getByRole('link').click()
  await expect(page).toHaveURL('/secrets/db/')
  await expect(rows(page)).toHaveText([/postgres\/\s*2 secrets/, /redis/])
  await rows(page).filter({ hasText: 'postgres/' }).getByRole('link').click()
  await expect(rows(page)).toHaveText(['app-user', 'billing-user'])

  // The breadcrumb leads back up.
  await page.getByRole('navigation', { name: 'Path' }).getByRole('link', { name: 'db' }).click()
  await expect(page).toHaveURL('/secrets/db/')
})

test('a generated secret shows its kind, size, timing and rotates', async ({ page, request }) => {
  await signIn(page, rootToken, '/secrets/db/postgres/billing-user')
  const panel = detail(page)
  await expect(panel.getByText('Generated · 32 bytes')).toBeVisible()
  await expect(panel.getByText('7 days')).toBeVisible()
  await expect(panel.getByText(/^\d{4}-\d\d-\d\d \d\d:\d\d UTC$/)).toBeVisible()

  const before = (await readSecret(request, 'db/postgres/billing-user')).value
  await panel.getByRole('button', { name: 'Reveal' }).click()
  await expect(panel.getByText(before)).toBeVisible()

  await page.getByRole('button', { name: 'API trace' }).click()
  await panel.getByRole('button', { name: 'Rotate now' }).click()
  await expect(page.getByRole('complementary', { name: 'API trace' })).toContainText('/v1/secrets/rotate/db/postgres/billing-user')
  await expect.poll(async () => (await readSecret(request, 'db/postgres/billing-user')).value).not.toBe(before)
  await panel.getByRole('button', { name: 'Reveal' }).click()
  await expect(panel.getByText((await readSecret(request, 'db/postgres/billing-user')).value)).toBeVisible()
})

test('a stored secret offers no rotation', async ({ page }) => {
  await signIn(page, rootToken, '/secrets/db/postgres/app-user')
  const panel = detail(page)
  await expect(panel.getByText('Stored · 7 bytes')).toBeVisible()
  await expect(panel.getByText('never')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Rotate now' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Reveal' }).click()
  await expect(panel.getByText('aHVudGVyMg==')).toBeVisible()
})

test('filtering narrows the folder, or searches every path', async ({ page }) => {
  await signIn(page, rootToken, '/secrets/db/postgres/')
  await page.getByLabel('Filter').fill('billing')
  await expect(rows(page)).toHaveText(['billing-user'])

  await page.getByLabel('Search in').selectOption('all')
  await page.getByLabel('Filter').fill('r')
  await expect(rows(page)).toHaveText(['db/postgres/app-user', 'db/postgres/billing-user', 'db/redis'])
})

test('a new secret can be stored or generated, never over an existing one', async ({ page }) => {
  await signIn(page, rootToken, '/secrets/db/')
  await page.getByRole('button', { name: 'New secret' }).click()
  const path = page.getByRole('textbox', { name: 'Path' })
  await expect(path).toHaveValue('db/')

  await path.fill('db/redis')
  await expect(page.getByText('A secret already exists here.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Store secret' })).toBeDisabled()

  await path.fill('dev/token')
  await page.getByLabel('Value').fill('abc')
  await page.getByLabel(/Expires after/).fill('1')
  await page.getByLabel('Unit').selectOption('hours')
  await page.getByRole('button', { name: 'Store secret' }).click()
  await expect(page).toHaveURL('/secrets/dev/token')
  await expect(detail(page).getByText('Stored · 3 bytes')).toBeVisible()
  await expect(detail(page).getByText('1 hour')).toBeVisible()

  await page.getByRole('button', { name: 'New secret' }).click()
  await page.getByRole('textbox', { name: 'Path' }).fill('dev/generated')
  await page.getByRole('button', { name: 'Generate' }).click()
  await page.getByLabel('Length in bytes').fill('16')
  await page.getByRole('button', { name: 'Generate secret' }).click()
  await expect(page).toHaveURL('/secrets/dev/generated')
  await expect(detail(page).getByText('Generated · 16 bytes')).toBeVisible()
})

test('deleting asks first, then removes it from the list', async ({ page }) => {
  await signIn(page, rootToken, '/secrets/dev/token')
  await detail(page).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Delete token for good?')).toBeVisible()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await detail(page).getByRole('button', { name: 'Delete' }).click()
  await detail(page).getByRole('button', { name: 'Delete' }).click()

  await expect(page).toHaveURL('/secrets/dev/')
  await expect(rows(page)).toHaveText(['generated'])
})

test('a secret deleted after the list loaded says so', async ({ page, request }) => {
  await putSecret(request, 'dev/doomed', 'x')
  await signIn(page, rootToken, '/secrets/dev/')
  await expect(rows(page)).toHaveText(['doomed', 'generated'])
  await request.delete(`${gate.api}/secrets/dev/doomed`, { headers: root })

  await rows(page).filter({ hasText: 'doomed' }).getByRole('link').click()
  await expect(page.getByText('No longer exists. It was deleted or it expired.')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh list' }).click()
  await expect(rows(page)).toHaveText(['generated'])
})

test('a generated secret overwritten meanwhile is not rotated', async ({ page, request }) => {
  await signIn(page, rootToken, '/secrets/dev/generated')
  await expect(detail(page).getByRole('button', { name: 'Rotate now' })).toBeVisible()
  await putSecret(request, 'dev/generated', 'plain now')

  await detail(page).getByRole('button', { name: 'Rotate now' }).click()
  await expect(page.getByText('Not rotated: this secret was replaced with a stored value.')).toBeVisible()
  await expect(detail(page).getByRole('button', { name: 'Rotate now' })).toHaveCount(0)
  await expect(detail(page).getByText('Stored · 9 bytes')).toBeVisible()
})

test('a token limited to one folder starts there and sees only what it may do', async ({ page, request }) => {
  const policy = {
    rules: [
      { path: 'system/entities/*', capabilities: ['read'] },
      { path: 'system/policies/*', capabilities: ['read'] },
      { path: 'secrets/dev/*', capabilities: ['read', 'list'] },
      { path: 'secrets/db/*', capabilities: ['list'] },
    ],
  }
  await request.put(`${gate.api}/policies/dev-reader`, { headers: root, data: policy })
  const entity = await request.post(`${gate.api}/entities`, { headers: root, data: { alias: 'dana', policies: ['dev-reader'] } })
  const { id } = (await entity.json()) as { id: string }
  const issued = await request.post(`${gate.api}/entities/${id}/tokens`, { headers: root, data: {} })
  const { token } = (await issued.json()) as { token: string }

  await signIn(page, token)
  await expect(page.getByText('This token may not list every secret. It may list these folders:')).toBeVisible()
  await expect(rows(page)).toHaveText(['db/', 'dev/'])
  await expect(page.getByRole('button', { name: 'New secret' })).toHaveCount(0)

  await rows(page).filter({ hasText: 'dev/' }).getByRole('link').click()
  await rows(page).filter({ hasText: 'generated' }).getByRole('link').click()
  await expect(detail(page).getByText('Stored · 9 bytes')).toBeVisible()
  await expect(detail(page).getByRole('button', { name: 'Delete' })).toHaveCount(0)

  // Listing db/ is allowed, reading in it is not.
  await page.goto('/secrets/db/redis')
  await expect(page.getByText("dana can't read this value.")).toBeVisible()
})
