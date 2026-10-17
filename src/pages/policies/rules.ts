import type { Capability, Rule } from '../../api/capabilities/evaluate'

// The grid's columns. `manage` is left out: seal-gate never checks it, so a
// square for it would grant nothing. A rule that holds it keeps it (the JSON
// view shows it, and saving sends it back unchanged).
export const COLUMNS: Capability[] = ['create', 'read', 'update', 'delete', 'list', 'rotate', 'deny']

const MAX_NAME = 128
const MAX_PATTERN = 257
const SEGMENT = /^[A-Za-z0-9._-]+$/

function validSegment(segment: string): boolean {
  return segment !== '.' && segment !== '..' && SEGMENT.test(segment)
}

function validPath(path: string): boolean {
  return path.split('/').every(validSegment)
}

// Why seal-gate would refuse a policy name, or null. Mirrors its
// ValidPolicyName: one segment of [A-Za-z0-9._-], not . or .., ≤ 128 bytes.
export function nameProblem(name: string): string | null {
  if (name === '') return 'Enter a name.'
  if (new TextEncoder().encode(name).length > MAX_NAME) return `At most ${MAX_NAME} bytes.`
  if (!validSegment(name)) return 'One segment of A–Z a–z 0–9 . _ -, not . or ..'
  return null
}

// Why seal-gate would refuse a rule's path, or null. Mirrors its
// validPattern: a path, or a prefix ending in `*` (a path, a path and `/`,
// or nothing before it); `*` anywhere else is invalid.
export function rulePathProblem(pattern: string): string | null {
  if (pattern === '') return 'Enter a path.'
  if (pattern.length > MAX_PATTERN) return `At most ${MAX_PATTERN} bytes.`
  const starred = pattern.endsWith('*')
  const body = starred ? pattern.slice(0, -1) : pattern
  if (body.includes('*')) return '* only at the end.'
  if (starred && body === '') return null
  if (!validPath(starred ? body.replace(/\/$/, '') : body)) return 'Segments of A–Z a–z 0–9 . _ - separated by /.'
  return null
}

// Why a whole rule would be refused, or null.
export function ruleProblem(rule: Rule): string | null {
  return rulePathProblem(rule.path) ?? (rule.capabilities.length === 0 ? 'Tick at least one capability.' : null)
}

// Whether one square differs from what is saved, by row position.
export function cellChanged(saved: Rule[], draft: Rule[], row: number, capability: Capability): boolean {
  const before = saved[row]?.capabilities.includes(capability) ?? false
  const after = draft[row]?.capabilities.includes(capability) ?? false
  return before !== after
}

// How many edits separate the draft from what is saved: each changed square
// and path, and each rule added or removed.
export function countChanges(saved: Rule[], draft: Rule[]): number {
  let changes = Math.abs(saved.length - draft.length)
  const shared = Math.min(saved.length, draft.length)
  for (let i = 0; i < shared; i++) {
    const before = saved[i]!
    const after = draft[i]!
    if (before.path !== after.path) changes++
    const all = new Set([...before.capabilities, ...after.capabilities])
    for (const capability of all) {
      if (before.capabilities.includes(capability) !== after.capabilities.includes(capability)) changes++
    }
  }
  return changes
}

// A rule with one capability turned on or off.
export function toggle(rule: Rule, capability: Capability): Rule {
  const has = rule.capabilities.includes(capability)
  return {
    path: rule.path,
    capabilities: has ? rule.capabilities.filter((c) => c !== capability) : [...rule.capabilities, capability],
  }
}
