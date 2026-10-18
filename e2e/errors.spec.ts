import { type Page, type Route, expect, test } from '@playwright/test'
import { freshSealGate } from './seal-gate.ts'

// The Errors.dc states no other spec reaches: a 500, which no request to a
// working seal-gate produces, and a token lifetime above the server's
// maximum, which only its own answer reveals.
const gate = freshSealGate()
let root: Record<string, string> = {}
let rootToken = ''
let entityId = ''

async function signIn(page: Page, token: string, at: string) {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), token)
  await page.goto(at)
}

// Answers one URL with a 500 in seal-gate's own error shape, until it is
// unrouted with this very handler (the bare pattern would take the
// forwarding with it).
function breaks(page: Page, pattern: string): (route: Route) => Promise<void> {
  const handler = async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ errors: ['internal error'] }),
    })
  }
  void page.route(pattern, handler)
  return handler
}

const fault = (page: Page) => page.getByText('The server hit an error. Try again.')

test.beforeAll(async ({ request }) => {
  const init = (await (await request.post(`${gate.api}/sys/init`, { data: { shares: 2, threshold: 2 } })).json()) as {
    shares: string[]
    root_token: string
  }
  for (const share of init.shares) await request.post(`${gate.api}/sys/unseal`, { data: { share } })
  rootToken = init.root_token
  root = { Authorization: `Bearer ${rootToken}` }

  const res = await request.post(`${gate.api}/entities`, { headers: root, data: { alias: 'ci-deployer' } })
  entityId = ((await res.json()) as { id: string }).id
  await request.put(`${gate.api}/policies/dev-read`, {
    headers: root,
    data: { rules: [{ path: 'secrets/dev/*', capabilities: ['read'] }] },
  })
})

test('a 500 listing policies offers Retry, and Retry recovers', async ({ page }) => {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), rootToken)
  const handler = breaks(page, '**/v1/policies')
  await page.goto('/policies')

  // The server's own word is "internal error", which says nothing useful, so
  // the console says what it knows and offers the one thing worth doing.
  await expect(fault(page)).toBeVisible()
  await expect(page.getByText('Internal error.')).toHaveCount(0)

  await page.unroute('**/v1/policies', handler)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('list', { name: 'Policy names' }).getByRole('listitem')).toHaveText(['dev-read'])
  await expect(fault(page)).toHaveCount(0)
})

test('a 500 reading an entity offers Retry in the panel', async ({ page }) => {
  await page.goto('/unseal')
  await page.evaluate((t) => sessionStorage.setItem('seal-gate.token', t), rootToken)
  const handler = breaks(page, `**/v1/entities/${entityId}`)
  await page.goto(`/identity/entities/${entityId}`)

  // The list beside it still loaded, so only the panel shows the fault.
  await expect(page.getByRole('list', { name: 'Entity names' }).getByRole('listitem')).toHaveText(['ci-deployer'])
  await expect(fault(page)).toBeVisible()

  await page.unroute(`**/v1/entities/${entityId}`, handler)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'ci-deployer' })).toBeVisible()
  await expect(fault(page)).toHaveCount(0)
})

test('a lifetime above the server maximum is shown on the lifetime itself', async ({ page, request }) => {
  await signIn(page, rootToken, `/identity/entities/${entityId}`)

  // The console offers it: no API says what the maximum is. e2e seal-gate
  // runs with max_ttl 24h, so 48 hours is refused.
  await page.getByRole('button', { name: 'Custom' }).click()
  const amount = page.getByRole('spinbutton', { name: 'Custom lifetime' })
  await amount.fill('48')
  await page.getByRole('button', { name: 'hours', exact: true }).click()
  await page.getByRole('button', { name: 'Issue token' }).click()

  await expect(page.getByText('Longer than this server allows. Try 1 day or less.')).toBeVisible()
  await expect(amount).toHaveAttribute('aria-invalid', 'true')
  // Nothing was issued, so no token is on screen.
  await expect(page.getByText(/^Shown once · expires /)).toHaveCount(0)

  // Changing the lifetime clears the refusal, and a day is accepted.
  await amount.fill('12')
  await expect(page.getByText('Longer than this server allows. Try 1 day or less.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Issue token' }).click()
  await expect(page.getByText(/^Shown once · expires /)).toBeVisible()

  // The entity really has a token now.
  const res = await request.post(`${gate.api}/entities/${entityId}/tokens`, { headers: root, data: { ttl: 3600 } })
  expect(res.status()).toBe(201)
})
