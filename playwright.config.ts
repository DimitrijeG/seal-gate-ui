import { defineConfig, devices } from '@playwright/test'

// A port of its own, so the tests never meet a development server.
const consolePort = 5174

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // Each spec file runs its own seal-gate (e2e/seal-gate.ts); files could run
  // in parallel, but one at a time keeps the output readable.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${consolePort}`,
    trace: 'retain-on-failure',
  },
  expect: {
    // Text antialiasing differs by a few dozen pixels between runs on the
    // same machine. A handful is noise; any real change to a baseline moves
    // far more than this, since it shifts whole words or boxes.
    toHaveScreenshot: { maxDiffPixels: 120 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${consolePort} --strictPort`,
    url: `http://localhost:${consolePort}`,
    // Tests route /v1 to their own seal-gate. Anything that slips past lands
    // on a port where nothing listens and fails loudly.
    env: { SEAL_GATE_URL: 'http://127.0.0.1:9' },
    reuseExistingServer: false,
  },
})
