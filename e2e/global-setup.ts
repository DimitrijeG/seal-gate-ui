import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Builds seal-gate once per run from its checkout, ../seal-gate unless
// SEAL_GATE_DIR names another. Each spec file then runs its own instance
// of this binary (see seal-gate.ts).
export default function globalSetup(): void {
  const source = resolve(process.env.SEAL_GATE_DIR ?? join(import.meta.dirname, '..', '..', 'seal-gate'))
  const dir = join(tmpdir(), 'seal-gate-ui-e2e')
  mkdirSync(dir, { recursive: true })
  const binary = join(dir, process.platform === 'win32' ? 'seal-gate.exe' : 'seal-gate')
  execFileSync('go', ['build', '-o', binary, './cmd/seal-gate'], { cwd: source, stdio: 'inherit' })
  process.env.SEAL_GATE_BIN = binary
}
