import { type APIRequestContext, type Page, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

const gate = freshSealGate()
let root: Record<string, string> = {}
let rootToken = ''

// design/Identity.dc.html's example, as far as the API can hold it.
const ids: Record<string, string> = {}
// The token test 7 issues, which test 8 expects deleting the entity to revoke.
let issued = ''

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

async function create(request: APIRequestContext, path: string, data: unknown): Promise<string> {
  const res = await request.post(`${gate.api}${path}`, { headers: root, data })
  expect(res.status(), path).toBe(201)
  return ((await res.json()) as { id: string }).id
}

async function entity(request: APIRequestContext, id: string) {
  const res = await request.get(`${gate.api}/entities/${id}`, { headers: root })
  return (await res.json()) as { alias?: string; policies: string[]; groups: string[] }
}

async function group(request: APIRequestContext, id: string) {
  const res = await request.get(`${gate.api}/groups/${id}`, { headers: root })
  return (await res.json()) as { alias?: string; policies: string[] }
}

async function signIn(page: Page, token: string, at: string) {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), token)
  await page.goto(at)
}

async function tokenFor(request: APIRequestContext, id: string): Promise<string> {
  const res = await request.post(`${gate.api}/entities/${id}/tokens`, { headers: root, data: {} })
  return ((await res.json()) as { token: string }).token
}

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Identity sections' }).getByRole('link')
const entityNames = (page: Page) => page.getByRole('list', { name: 'Entity names' }).getByRole('listitem')
const groupNames = (page: Page) => page.getByRole('list', { name: 'Group names' }).getByRole('listitem')
const userRows = (page: Page) => page.getByRole('list', { name: 'Stored usernames' }).getByRole('listitem')

test.beforeAll(async ({ request }) => {
  const init = (await (await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })).json()) as {
    shares: string[]
    root_token: string
  }
  for (const share of init.shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  rootToken = init.root_token
  root = { Authorization: `Bearer ${rootToken}` }

  for (const name of ['dev-read', 'dev-write', 'audit-read']) {
    await put(request, `/policies/${name}`, { rules: [{ path: `secrets/${name}/*`, capabilities: ['read'] }] })
  }
  await put(request, '/policies/know-self', { rules: knowSelf })
  await put(request, '/policies/groups-only', {
    rules: [
      { path: 'system/groups', capabilities: ['list'] },
      { path: 'system/groups/*', capabilities: ['read'] },
    ],
  })

  ids.developers = await create(request, '/groups', { alias: 'developers', policies: ['dev-read', 'dev-write'] })
  ids.auditors = await create(request, '/groups', { alias: 'auditors', policies: ['audit-read'] })
  ids.alice = await create(request, '/entities', {
    alias: 'alice',
    policies: ['dev-read'],
    groups: [ids.auditors],
  })
  ids.bob = await create(request, '/entities', { alias: 'bob', groups: [ids.developers] })
  ids.nameless = await create(request, '/entities', {})
  await put(request, '/auth/users/alice', { entity_id: ids.alice, password: 'alice-password' })
  await put(request, '/auth/users/ana.oncall', { entity_id: ids.bob, password: 'ana-password' })
})

test('the sections carry counts, and entities list by name', async ({ page }) => {
  await signIn(page, rootToken, '/identity')
  await expect(page).toHaveURL('/identity/entities')
  await expect(tabs(page)).toHaveText(['Entities3', 'Groups2', 'Usernames2'])

  // The API sorts by ID, which is random; the list sorts by name, and one
  // without an alias shows by the start of its ID.
  await expect(entityNames(page)).toHaveText(['alice', 'bob', `entity ${ids.nameless!.slice(0, 8)}`])
  await expect(page.getByPlaceholder('Find among 3')).toBeVisible()

  await page.getByPlaceholder('Find among 3').fill('ali')
  await expect(entityNames(page)).toHaveText(['alice'])
  await page.getByPlaceholder('Find among 3').fill('zzz')
  await expect(page.getByText('No entity matches “zzz”.')).toBeVisible()
})

test('an entity shows its groups, its own policies, and what a group brings', async ({ page }) => {
  await signIn(page, rootToken, '/identity/entities')
  await entityNames(page).filter({ hasText: 'alice' }).getByRole('link').click()
  await expect(page).toHaveURL(`/identity/entities/${ids.alice}`)

  await expect(page.getByRole('heading', { level: 2, name: 'alice' })).toBeVisible()
  await expect(page.getByText(ids.alice!)).toBeVisible()
  await expect(page.getByText('Start here: a group brings its policies with it.')).toBeVisible()
  await expect(page.getByText('Dashed ones come from a group and change with it.')).toBeVisible()

  // Its own group and policy can be taken away; what auditors brings cannot.
  await expect(page.getByRole('button', { name: 'Leave group auditors' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove policy dev-read' })).toBeVisible()
  await expect(page.getByText('from auditors')).toBeVisible()
  await expect(page.getByRole('link', { name: 'audit-read' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove policy audit-read' })).toHaveCount(0)
})

test('a group is joined and left, and its policies follow', async ({ page, request }) => {
  await signIn(page, rootToken, `/identity/entities/${ids.alice}`)
  await expect(page.getByRole('button', { name: 'Remove policy dev-read' })).toBeVisible()

  await page.getByRole('button', { name: 'Add group' }).click()
  await page.getByRole('button', { name: 'developers', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Leave group developers' })).toBeVisible()
  expect((await entity(request, ids.alice!)).groups).toContain(ids.developers)

  // dev-write arrives from the group; dev-read is already held directly, so
  // it stays its own and is not listed twice.
  await expect(page.getByText('from developers')).toBeVisible()
  await expect(page.getByRole('link', { name: 'dev-write' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'dev-read' })).toHaveCount(1)

  await page.getByRole('button', { name: 'Leave group developers' }).click()
  await expect(page.getByRole('button', { name: 'Leave group developers' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'dev-write' })).toHaveCount(0)
  expect((await entity(request, ids.alice!)).groups).toEqual([ids.auditors])
})

test('a policy is given and taken away', async ({ page, request }) => {
  await signIn(page, rootToken, `/identity/entities/${ids.bob}`)
  await page.getByRole('button', { name: 'Add policy' }).click()
  await page.getByRole('button', { name: 'audit-read', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove policy audit-read' })).toBeVisible()
  expect((await entity(request, ids.bob!)).policies).toEqual(['audit-read'])

  await page.getByRole('button', { name: 'Remove policy audit-read' }).click()
  await expect(page.getByRole('button', { name: 'Remove policy audit-read' })).toHaveCount(0)
  expect((await entity(request, ids.bob!)).policies).toEqual([])
})

test('renaming shows the server refusing a name another entity holds', async ({ page, request }) => {
  await signIn(page, rootToken, `/identity/entities/${ids.bob}`)
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('alice')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toHaveText('Alias already in use.')
  // Still open, and still bob on the server.
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('alice')
  expect((await entity(request, ids.bob!)).alias).toBe('bob')

  await page.getByRole('textbox', { name: 'Name' }).fill('Bob')
  await expect(page.getByText('Lowercase a–z 0–9 . _ - only.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  await page.getByRole('textbox', { name: 'Name' }).fill('bobby')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'bobby' })).toBeVisible()
  await expect(entityNames(page)).toHaveText(['alice', 'bobby', `entity ${ids.nameless!.slice(0, 8)}`])
  expect((await entity(request, ids.bob!)).alias).toBe('bobby')
})

test('a new entity is created and opens', async ({ page, request }) => {
  await signIn(page, rootToken, '/identity/entities')
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'New entity' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Name' }).fill('ci-deployer')
  await page.getByRole('button', { name: 'Create entity' }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'ci-deployer' })).toBeVisible()
  const url = new URL(page.url())
  ids.ci = url.pathname.split('/').pop() ?? ''
  expect((await entity(request, ids.ci)).alias).toBe('ci-deployer')
  await expect(tabs(page)).toHaveText(['Entities4', 'Groups2', 'Usernames2'])
})

test('an issued token is shown once, and it works', async ({ page, request }) => {
  await signIn(page, rootToken, `/identity/entities/${ids.ci}`)
  await expect(
    page.getByText('Tokens always expire. The server refuses a lifetime above its maximum, a day unless configured'),
  ).toBeVisible()

  await page.getByRole('button', { name: '1 hour' }).click()
  await page.getByRole('button', { name: 'Issue token' }).click()
  await expect(page.getByText(/^Shown once · expires /)).toBeVisible()

  // Hidden until revealed, and the same length whatever the token is.
  const value = page.locator('.secret-row__value')
  await expect(value).toHaveText('••••••••••••••••••••••')
  await page.getByRole('button', { name: 'Reveal token' }).click()
  issued = (await value.textContent()) ?? ''
  expect(issued.length).toBeGreaterThan(20)

  const self = await request.get(`${gate.api}/auth/token/self`, { headers: { Authorization: `Bearer ${issued}` } })
  expect(self.status()).toBe(200)
  expect(((await self.json()) as { entity_id: string }).entity_id).toBe(ids.ci)
})

test('deleting an entity asks first, and revokes its tokens', async ({ page, request }) => {
  await signIn(page, rootToken, `/identity/entities/${ids.ci}`)
  await expect(page.getByText('Deleting this entity revokes every token issued to it.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete entity' }).click()
  await expect(page.getByText('Delete ci-deployer for good?')).toBeVisible()

  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByText('Deleting this entity revokes every token issued to it.')).toBeVisible()

  await page.getByRole('button', { name: 'Delete entity' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL('/identity/entities')
  await expect(entityNames(page)).toHaveText(['alice', 'bobby', `entity ${ids.nameless!.slice(0, 8)}`])

  const self = await request.get(`${gate.api}/auth/token/self`, { headers: { Authorization: `Bearer ${issued}` } })
  expect(self.status()).toBe(401)
})

test('a group deleted under an entity shows as deleted and brings nothing', async ({ page, request }) => {
  const doomed = await create(request, '/groups', { alias: 'temps', policies: ['audit-read'] })
  const member = await create(request, '/entities', { alias: 'temp-user', groups: [doomed] })
  await signIn(page, rootToken, `/identity/entities/${member}`)
  await expect(page.getByRole('button', { name: 'Leave group temps' })).toBeVisible()

  expect((await request.delete(`${gate.api}/groups/${doomed}`, { headers: root })).status()).toBe(204)
  await page.reload()
  await expect(page.getByRole('button', { name: `Leave group Deleted group ${doomed.slice(0, 8)}` })).toBeVisible()
  await expect(page.getByRole('link', { name: 'audit-read' })).toHaveCount(0)

  // The ID is still on the entity; leaving it takes it off.
  expect((await entity(request, member)).groups).toEqual([doomed])
  await page.getByRole('button', { name: `Leave group Deleted group ${doomed.slice(0, 8)}` }).click()
  await expect(page.getByRole('button', { name: /^Leave group/ })).toHaveCount(0)
  expect((await entity(request, member)).groups).toEqual([])

  expect((await request.delete(`${gate.api}/entities/${member}`, { headers: root })).status()).toBe(204)
})

test('a group shows the policies it brings, and they can be changed', async ({ page, request }) => {
  await signIn(page, rootToken, '/identity')
  await tabs(page).filter({ hasText: 'Groups' }).click()
  await expect(page).toHaveURL('/identity/groups')
  await expect(groupNames(page)).toHaveText(['auditors', 'developers'])

  await groupNames(page).filter({ hasText: 'developers' }).getByRole('link').click()
  await expect(page.getByRole('heading', { level: 2, name: 'developers' })).toBeVisible()
  await expect(page.getByText('Every entity in the group gets these.')).toBeVisible()
  await expect(
    page.getByText('Entities join a group from their own page, under Groups. Membership is stored on the entity'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Remove policy dev-write' }).click()
  await expect(page.getByRole('button', { name: 'Remove policy dev-write' })).toHaveCount(0)
  expect((await group(request, ids.developers!)).policies).toEqual(['dev-read'])

  await page.getByRole('button', { name: 'Add policy' }).click()
  await page.getByRole('button', { name: 'dev-write', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove policy dev-write' })).toBeVisible()
  expect((await group(request, ids.developers!)).policies.sort()).toEqual(['dev-read', 'dev-write'])
})

test('a new group is created, renamed and deleted', async ({ page, request }) => {
  await signIn(page, rootToken, '/identity/groups')
  await page.getByRole('button', { name: 'New' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('release')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'release' })).toBeVisible()
  const id = new URL(page.url()).pathname.split('/').pop() ?? ''

  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('releases')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'releases' })).toBeVisible()
  expect((await group(request, id)).alias).toBe('releases')

  await expect(page.getByText('Entities in this group lose the policies it brings.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete group' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL('/identity/groups')
  await expect(groupNames(page)).toHaveText(['auditors', 'developers'])
})

test('a username row names its entity, and its password can be changed', async ({ page, request }) => {
  await signIn(page, rootToken, '/identity/usernames')
  await expect(userRows(page)).toHaveCount(2)
  await expect(userRows(page).nth(0)).toContainText('alice')
  await expect(userRows(page).nth(1)).toContainText('ana.oncall')
  // The row links to the entity it signs in as, by that entity's name.
  await expect(userRows(page).nth(1).getByRole('link', { name: 'bobby' })).toBeVisible()

  await userRows(page).nth(0).getByRole('button', { name: 'Change password' }).click()
  await page.getByLabel('New password for alice').fill('a-new-password')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Password changed')).toBeVisible()

  const login = await request.post(`${gate.api}/auth/login`, {
    data: { username: 'alice', password: 'a-new-password' },
  })
  expect(login.status()).toBe(201)
})

test('a username is created, signs in, and can be removed', async ({ page, request }) => {
  await signIn(page, rootToken, '/identity/usernames')
  await page.getByRole('textbox', { name: 'Username' }).fill('ivana')
  await page.getByLabel('Signs in as').selectOption({ label: 'alice' })
  await page.getByLabel('Password', { exact: true }).fill('ivana-password')
  await page.getByRole('button', { name: 'Create username' }).click()
  await expect(page.getByText('ivana can sign in now.')).toBeVisible()

  const login = await request.post(`${gate.api}/auth/login`, { data: { username: 'ivana', password: 'ivana-password' } })
  expect(login.status()).toBe(201)
  await expect(userRows(page)).toHaveCount(3)

  // Typing a name that exists says what saving would do.
  await page.getByRole('textbox', { name: 'Username' }).fill('ivana')
  await expect(page.getByText("Replaces ivana's password and entity.")).toBeVisible()

  await userRows(page).filter({ hasText: 'ivana' }).getByRole('button', { name: 'Remove username ivana' }).click()
  await expect(page.getByText('Remove ivana?')).toBeVisible()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(userRows(page)).toHaveCount(2)
  expect((await request.get(`${gate.api}/auth/users/ivana`, { headers: root })).status()).toBe(404)
})

test('a token with narrow rules is offered only the sections it may use', async ({ page, request }) => {
  const scoped = await create(request, '/entities', { alias: 'group-reader', policies: ['know-self', 'groups-only'] })
  await signIn(page, await tokenFor(request, scoped), '/identity')

  // Nothing it holds touches system/users, so Usernames is not offered.
  // Entities is: reading its own entity is how it learns its own rules,
  // which is `read` on system/entities/*. It carries no count, because it
  // may read an entity without listing them.
  await expect(page).toHaveURL('/identity/entities')
  await expect(tabs(page)).toHaveText(['Entities', 'Groups2'])
  await expect(page.getByText('This token may not list entities.')).toBeVisible()

  await tabs(page).filter({ hasText: 'Groups' }).click()
  await expect(groupNames(page)).toHaveText(['auditors', 'developers'])

  // It may read a group but not change one, so nothing on offer changes it.
  await groupNames(page).filter({ hasText: 'auditors' }).getByRole('link').click()
  await expect(page.getByRole('heading', { level: 2, name: 'auditors' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add policy' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete group' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remove policy/ })).toHaveCount(0)

  expect((await request.delete(`${gate.api}/entities/${scoped}`, { headers: root })).status()).toBe(204)
})

test('a token that may read entities but not list them is sent to its own', async ({ page, request }) => {
  const scoped = await create(request, '/entities', { alias: 'self-reader', policies: ['know-self'] })
  await signIn(page, await tokenFor(request, scoped), '/identity/entities')

  await expect(page.getByText('This token may not list entities.')).toBeVisible()
  await page.getByRole('link', { name: 'Open your own entity' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'self-reader' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'know-self' })).toBeVisible()

  expect((await request.delete(`${gate.api}/entities/${scoped}`, { headers: root })).status()).toBe(204)
})
