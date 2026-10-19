import { type APIRequestContext, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'
import { choose } from './select.ts'

const gate = freshSealGate()
let root: Record<string, string> = {}
let rootToken = ''

// The rules of design/Policies.dc.html's example.
const devRead = [
  { path: 'secrets/dev/*', capabilities: ['read', 'list'] },
  { path: 'secrets/shared/config/*', capabilities: ['read', 'list'] },
  { path: 'secrets/dev/feature-flags', capabilities: ['read', 'update'] },
  { path: 'secrets/db/postgres/*', capabilities: ['list'] },
  { path: 'secrets/dev/admin-key', capabilities: ['deny'] },
]

const names = (page: Page) => page.getByRole('list', { name: 'Policy names' }).getByRole('listitem')
const grid = (page: Page) => page.getByRole('table')
const square = (page: Page, row: number, capability: string) => page.getByRole('button', { name: `Rule ${row}: ${capability}`, exact: true })
const area = (page: Page, row: number) => page.getByRole('combobox', { name: `Rule ${row} area` })
const scope = (page: Page, row: number) => page.getByRole('combobox', { name: `Rule ${row} scope` })
const target = (page: Page, row: number, field: string) => page.getByRole('textbox', { name: `Rule ${row} ${field}` })

async function putPolicy(request: APIRequestContext, name: string, rules: unknown[]) {
  expect((await request.put(`${gate.api}/policies/${name}`, { headers: root, data: { rules } })).status()).toBe(204)
}

async function rulesOf(request: APIRequestContext, name: string) {
  const res = await request.get(`${gate.api}/policies/${name}`, { headers: root })
  return ((await res.json()) as { rules: { path: string; capabilities: string[] }[] }).rules
}

async function signIn(page: Page, token: string, at: string) {
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
  await putPolicy(request, 'dev-read', devRead)
  await putPolicy(request, 'legacy', [{ path: 'secrets/legacy/*', capabilities: ['read'] }])
})

test('the list shows names, and a policy opens as a grid', async ({ page }) => {
  await signIn(page, rootToken, '/policies')
  await expect(names(page)).toHaveText(['dev-read', 'legacy'])
  await expect(page.getByPlaceholder('Find among 2')).toBeVisible()

  await names(page).filter({ hasText: 'dev-read' }).getByRole('link').click()
  await expect(page).toHaveURL('/policies/dev-read')
  await expect(page.getByText('5 rules')).toBeVisible()
  await expect(grid(page).getByRole('columnheader')).toHaveText(['Applies to', 'create', 'read', 'update', 'delete', 'list', 'rotate', 'deny', 'Remove'])
  await expect(area(page, 5)).toHaveText('Secrets', { useInnerText: true })
  await expect(scope(page, 5)).toHaveText('One secret', { useInnerText: true })
  await expect(target(page, 5, 'secret')).toHaveValue('dev/admin-key')
  await expect(square(page, 5, 'deny')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Refuses everything on the secret dev/admin-key, whatever other rules grant.')).toBeVisible()
  await expect(page.getByText('Read and list every secret in dev/.')).toBeVisible()
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('changes are counted, can be discarded, and are saved', async ({ page, request }) => {
  await signIn(page, rootToken, '/policies/dev-read')
  await square(page, 1, 'update').click()
  await expect(page.getByText('1 unsaved change, ringed in the table')).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByText('All changes saved')).toBeVisible()

  await square(page, 1, 'update').click()
  await square(page, 4, 'read').click()
  await expect(page.getByText('2 unsaved changes, ringed in the table')).toBeVisible()
  await page.getByRole('button', { name: 'Save policy' }).click()
  await expect(page.getByText('All changes saved')).toBeVisible()
  const rules = await rulesOf(request, 'dev-read')
  expect(rules[0]?.capabilities.sort()).toEqual(['list', 'read', 'update'])
  expect(rules[3]?.capabilities.sort()).toEqual(['list', 'read'])
})

test('an invalid rule is caught before saving', async ({ page }) => {
  await signIn(page, rootToken, '/policies/dev-read')
  await target(page, 2, 'folder').fill('shared/*/config')
  await expect(page.getByText('Rule 2: No * in a secret path: pick a scope instead.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save policy' })).toBeDisabled()

  await target(page, 2, 'folder').fill('shared/config')
  await page.getByRole('button', { name: 'Add rule' }).click()
  await expect(page.getByText('Rule 6: Tick at least one capability.')).toBeVisible()
  await choose(scope(page, 6), 'A folder')
  await expect(page.getByText('Rule 6: Enter a folder.')).toBeVisible()
  await page.getByRole('button', { name: 'Remove rule 6' }).click()
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('leaving with unsaved changes asks first', async ({ page }) => {
  await signIn(page, rootToken, '/policies/dev-read')
  await square(page, 2, 'rotate').click()
  page.once('dialog', (dialog) => void dialog.dismiss())
  await names(page).filter({ hasText: 'legacy' }).getByRole('link').click()
  await expect(page).toHaveURL('/policies/dev-read')
  await expect(page.getByText('1 unsaved change, ringed in the table')).toBeVisible()
})

test('a new policy is named, given rules, and created', async ({ page, request }) => {
  await signIn(page, rootToken, '/policies')
  await page.getByRole('link', { name: 'New' }).click()
  const name = page.getByRole('textbox', { name: 'Name' })
  await name.fill('legacy')
  await expect(page.getByText('A policy with this name exists.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create policy' })).toBeDisabled()

  await name.fill('ops')
  await choose(scope(page, 1), 'A folder')
  await target(page, 1, 'folder').fill('ops')
  await square(page, 1, 'read').click()
  await page.getByRole('button', { name: 'Create policy' }).click()
  await expect(page).toHaveURL('/policies/ops')
  await expect(names(page)).toHaveText(['dev-read', 'legacy', 'ops'])
  await expect(page.getByText('All changes saved')).toBeVisible()
  expect(await rulesOf(request, 'ops')).toEqual([{ path: 'secrets/ops/*', capabilities: ['read'] }])
})

test('an area offers only the capabilities seal-gate checks there', async ({ page, request }) => {
  await signIn(page, rootToken, '/policies/ops')
  await page.getByRole('button', { name: 'Add rule' }).click()
  await choose(area(page, 2), 'Seal')
  await expect(scope(page, 2)).toHaveCount(0)
  await expect(square(page, 2, 'read')).toHaveCount(0)
  await square(page, 2, 'update').click()
  await expect(page.getByText('Seal the instance.')).toBeVisible()

  await page.getByRole('button', { name: 'Save policy' }).click()
  await expect(page.getByText('All changes saved')).toBeVisible()
  expect((await rulesOf(request, 'ops'))[1]).toEqual({ path: 'system/seal', capabilities: ['update'] })
})

test('a dropdown works from the keyboard alone', async ({ page }) => {
  await signIn(page, rootToken, '/policies/ops')
  const list = page.getByRole('listbox')
  await scope(page, 1).focus()

  // Arrows open it on the current option and move; Enter picks.
  await page.keyboard.press('ArrowDown')
  await expect(list).toBeVisible()
  await expect(list.getByRole('option', { selected: true })).toHaveText('A folder')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(list).toHaveCount(0)
  await expect(scope(page, 1)).toHaveText('One secret', { useInnerText: true })
  await expect(scope(page, 1)).toBeFocused()

  // Escape closes without picking; a letter jumps to the option it starts.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(scope(page, 1)).toHaveText('One secret', { useInnerText: true })
  await page.keyboard.press('Enter')
  await page.keyboard.press('e')
  await page.keyboard.press('Enter')
  await expect(scope(page, 1)).toHaveText('Every secret', { useInnerText: true })

  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('a rule switched to a custom path keeps the path it wrote', async ({ page }) => {
  await signIn(page, rootToken, '/policies/ops')
  await choose(area(page, 1), 'Custom path')
  await expect(target(page, 1, 'path')).toHaveValue('secrets/ops/*')
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('a path no area fits opens as a custom path, unchanged', async ({ page, request }) => {
  await putPolicy(request, 'prefixed', [{ path: 'secrets/dev*', capabilities: ['read'] }])
  await signIn(page, rootToken, '/policies/prefixed')
  await expect(area(page, 1)).toHaveText('Custom path', { useInnerText: true })
  await expect(target(page, 1, 'path')).toHaveValue('secrets/dev*')
  await expect(page.getByText('All changes saved')).toBeVisible()
  expect((await request.delete(`${gate.api}/policies/prefixed`, { headers: root })).status()).toBe(204)
})

test('deleting asks first, then removes it from the list', async ({ page }) => {
  await signIn(page, rootToken, '/policies/ops')
  await page.getByRole('button', { name: 'Delete policy' }).click()
  await expect(page.getByText(/Delete ops for good\?/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL('/policies')
  await expect(names(page)).toHaveText(['dev-read', 'legacy'])
})

test('a policy deleted after the list loaded says so', async ({ page, request }) => {
  await putPolicy(request, 'doomed', [])
  await signIn(page, rootToken, '/policies')
  await expect(names(page)).toHaveText(['dev-read', 'doomed', 'legacy'])
  await request.delete(`${gate.api}/policies/doomed`, { headers: root })
  await names(page).filter({ hasText: 'doomed' }).getByRole('link').click()
  await expect(page.getByText('No longer exists. Someone deleted it.')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh list' }).click()
  await expect(names(page)).toHaveText(['dev-read', 'legacy'])
})

test('a token that may only read policies sees them, and cannot change them', async ({ page, request }) => {
  await putPolicy(request, 'policy-reader', [
    { path: 'system/policies', capabilities: ['list'] },
    { path: 'system/policies/*', capabilities: ['read'] },
  ])
  const entity = await request.post(`${gate.api}/entities`, { headers: root, data: { policies: ['policy-reader'] } })
  const { id } = (await entity.json()) as { id: string }
  const issued = await request.post(`${gate.api}/entities/${id}/tokens`, { headers: root, data: {} })
  const { token } = (await issued.json()) as { token: string }

  await signIn(page, token, '/policies/dev-read')
  await expect(page.getByText('This token may read this policy, not change it.')).toBeVisible()
  await expect(square(page, 1, 'read')).toBeDisabled()
  await expect(area(page, 1)).toBeDisabled()
  await expect(target(page, 1, 'folder')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Add rule' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete policy' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New' })).toHaveCount(0)
})
