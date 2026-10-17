import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Route, test } from '@playwright/test'

export interface SealGate {
  // The instance's API root, for requests a test makes directly.
  api: string
  // The route handler that forwards the page's /v1 requests to the instance;
  // pass it to page.unroute when a test stacks a route of its own.
  forward: (route: Route) => Promise<void>
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))))
    })
  })
}

async function waitUntilUp(api: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${api}/sys/status`)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`seal-gate did not start at ${api}`)
}

// Gives the calling spec file a fresh, uninitialized seal-gate of its own,
// in memory, and routes every page's /v1 requests to it. Tests within the
// file share it and run in order, so they can walk it through init, unseal
// and seal.
export function freshSealGate(): SealGate {
  test.describe.configure({ mode: 'serial' })

  let child: ChildProcess | undefined
  let dir = ''
  const gate: SealGate = {
    api: '',
    forward: async (route) => {
      const url = new URL(route.request().url())
      const response = await route.fetch({ url: gate.api.replace(/\/v1$/, '') + url.pathname + url.search })
      await route.fulfill({ response })
    },
  }

  test.beforeAll(async () => {
    const binary = process.env.SEAL_GATE_BIN
    if (!binary) throw new Error('SEAL_GATE_BIN is unset; global-setup.ts builds it')
    const port = await freePort()
    dir = mkdtempSync(join(tmpdir(), 'seal-gate-e2e-'))
    const config = readFileSync(join(import.meta.dirname, 'seal-gate.yaml'), 'utf8').replace(
      'address: 127.0.0.1:0',
      `address: 127.0.0.1:${port}`,
    )
    writeFileSync(join(dir, 'config.yaml'), config)
    child = spawn(binary, ['-config', 'config.yaml'], { cwd: dir, stdio: 'inherit' })
    gate.api = `http://127.0.0.1:${port}/v1`
    await waitUntilUp(gate.api)
  })

  test.afterAll(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child?.once('exit', r))
      child.kill()
      await exited
    }
    rmSync(dir, { recursive: true, force: true })
  })

  test.beforeEach(async ({ page }) => {
    await page.route('**/v1/**', gate.forward)
  })

  return gate
}
