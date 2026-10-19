import type { Capability, Rule } from '../../api/capabilities/evaluate'
import { rulePathProblem } from './rules'

// What a rule is about, so a policy is written by picking instead of typing
// seal-gate's resource names. Every area maps to the resources seal-gate
// checks; `custom` keeps any other path as typed.
export type Area = 'secrets' | 'entities' | 'groups' | 'users' | 'policies' | 'seal' | 'everything' | 'custom'

// How much of an area: all of it, a folder of secrets, one item, the
// collection itself (listing and creating), or one entity's tokens.
export type Scope = 'all' | 'folder' | 'one' | 'collection' | 'tokens'

// A rule as the editor shows it. `target` is the folder, path, ID or name
// the scope needs, or the whole path for `custom`, kept as typed.
export interface Row {
  area: Area
  scope: Scope
  target: string
  capabilities: Capability[]
}

export const AREAS: { area: Area; label: string }[] = [
  { area: 'secrets', label: 'Secrets' },
  { area: 'entities', label: 'Entities' },
  { area: 'groups', label: 'Groups' },
  { area: 'users', label: 'Usernames' },
  { area: 'policies', label: 'Policies' },
  { area: 'seal', label: 'Seal' },
  { area: 'everything', label: 'Everything' },
  { area: 'custom', label: 'Custom path' },
]

// The resource each identity area's records live under on seal-gate.
const BASE: Partial<Record<Area, string>> = {
  entities: 'system/entities',
  groups: 'system/groups',
  users: 'system/users',
  policies: 'system/policies',
}

interface ScopeInfo {
  scope: Scope
  label: string
  // What the target field asks for, when the scope needs one.
  target?: string
}

const IDENTITY_SCOPES = (one: string, field: string): ScopeInfo[] => [
  { scope: 'all', label: `Every ${one}` },
  { scope: 'one', label: `One ${one}`, target: field },
  { scope: 'collection', label: 'The list' },
]

const SCOPES: Record<Area, ScopeInfo[]> = {
  secrets: [
    { scope: 'all', label: 'Every secret' },
    { scope: 'folder', label: 'A folder', target: 'folder' },
    { scope: 'one', label: 'One secret', target: 'secret' },
  ],
  entities: [...IDENTITY_SCOPES('entity', 'entity ID'), { scope: 'tokens', label: "One entity's tokens", target: 'entity ID' }],
  groups: IDENTITY_SCOPES('group', 'group ID'),
  users: IDENTITY_SCOPES('username', 'username'),
  policies: IDENTITY_SCOPES('policy', 'policy name'),
  seal: [{ scope: 'all', label: 'The seal' }],
  everything: [{ scope: 'all', label: 'Every resource' }],
  custom: [{ scope: 'all', label: 'Path', target: 'path' }],
}

export function scopesOf(area: Area): ScopeInfo[] {
  return SCOPES[area]
}

// What the target field is for, or null when the scope needs none.
export function targetOf(area: Area, scope: Scope): string | null {
  return SCOPES[area].find((s) => s.scope === scope)?.target ?? null
}

// The capabilities seal-gate checks on these resources; any other one there
// grants nothing. `deny` always counts.
export function checked(area: Area, scope: Scope): Capability[] {
  switch (area) {
    case 'secrets':
      return ['create', 'read', 'update', 'delete', 'list', 'rotate', 'deny']
    case 'entities':
      if (scope === 'collection') return ['create', 'list', 'deny']
      if (scope === 'tokens') return ['create', 'deny']
      // Every entity covers every entity's tokens too, which `create` issues.
      return scope === 'all' ? ['create', 'read', 'update', 'delete', 'deny'] : ['read', 'update', 'delete', 'deny']
    case 'groups':
      return scope === 'collection' ? ['create', 'list', 'deny'] : ['read', 'update', 'delete', 'deny']
    case 'users':
    case 'policies':
      return scope === 'collection' ? ['list', 'deny'] : ['read', 'update', 'delete', 'deny']
    case 'seal':
      return ['update', 'deny']
    default:
      return ['create', 'read', 'update', 'delete', 'list', 'rotate', 'deny']
  }
}

// One segment without a star, as an ID or name in a path.
const SEGMENT = /^[^/*]+$/

// Reads a stored path into a row. Anything that is not exactly the path a row
// would write stays `custom`, so writing it back never changes it.
export function toRow(rule: Rule): Row {
  const { path, capabilities } = rule
  const row = (area: Area, scope: Scope, target = ''): Row => ({ area, scope, target, capabilities })
  if (path === '*') return row('everything', 'all')
  if (path === 'system/seal') return row('seal', 'all')
  if (path.startsWith('secrets/')) {
    const rest = path.slice('secrets/'.length)
    if (rest === '*') return row('secrets', 'all')
    const folder = rest.endsWith('/*') ? rest.slice(0, -2) : null
    if (folder !== null && folder !== '' && !folder.includes('*') && !folder.endsWith('/')) return row('secrets', 'folder', folder)
    if (rest !== '' && !rest.includes('*') && !rest.endsWith('/')) return row('secrets', 'one', rest)
    return row('custom', 'all', path)
  }
  for (const [area, base] of Object.entries(BASE) as [Area, string][]) {
    if (path === base) return row(area, 'collection')
    if (path === `${base}/*`) return row(area, 'all')
    if (!path.startsWith(`${base}/`)) continue
    const rest = path.slice(base.length + 1)
    if (SEGMENT.test(rest)) return row(area, 'one', rest)
    const id = area === 'entities' && rest.endsWith('/tokens') ? rest.slice(0, -'/tokens'.length) : ''
    if (SEGMENT.test(id)) return row(area, 'tokens', id)
  }
  return row('custom', 'all', path)
}

// The path a row writes.
export function toPath(row: Row): string {
  const target = row.target.trim()
  switch (row.area) {
    case 'everything':
      return '*'
    case 'seal':
      return 'system/seal'
    case 'custom':
      return target
    case 'secrets':
      if (row.scope === 'folder') return `secrets/${target.replace(/\/+$/, '')}/*`
      return row.scope === 'one' ? `secrets/${target}` : 'secrets/*'
    default: {
      const base = BASE[row.area]!
      if (row.scope === 'collection') return base
      if (row.scope === 'one') return `${base}/${target}`
      return row.scope === 'tokens' ? `${base}/${target}/tokens` : `${base}/*`
    }
  }
}

export function toRule(row: Row): Rule {
  return { path: toPath(row), capabilities: row.capabilities }
}

// The same row in another area or scope: the first scope when the area
// changes, the target kept while the new scope asks for one, and only the
// capabilities that still mean something there.
export function reshape(row: Row, area: Area, scope?: Scope): Row {
  const next = scope ?? (area === row.area ? row.scope : SCOPES[area][0]!.scope)
  const keepTarget = targetOf(area, next) !== null && (area !== 'custom' || row.area === 'custom')
  const target = keepTarget ? row.target : area === 'custom' ? toPath(row) : ''
  const allowed = checked(area, next)
  return { area, scope: next, target, capabilities: row.capabilities.filter((c) => allowed.includes(c)) }
}

// Why seal-gate would refuse the rule a row writes, or null.
export function rowProblem(row: Row): string | null {
  const field = targetOf(row.area, row.scope)
  const target = row.target.trim()
  if (field !== null && target === '') return `Enter a ${field}.`
  if (field !== null && row.area !== 'secrets' && row.area !== 'custom' && !SEGMENT.test(target)) {
    return `The ${field} is one segment, without / or *.`
  }
  if (row.area === 'secrets' && target.includes('*')) return 'No * in a secret path: pick a scope instead.'
  return rulePathProblem(toPath(row)) ?? (row.capabilities.length === 0 ? 'Tick at least one capability.' : null)
}

const VERBS: Partial<Record<Capability, string>> = {
  create: 'create',
  read: 'read',
  update: 'change',
  delete: 'delete',
  list: 'list',
  rotate: 'rotate',
}

function joined(words: string[]): string {
  return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

const NOUNS: Partial<Record<Area, [plural: string, one: string]>> = {
  entities: ['entities', 'entity'],
  groups: ['groups', 'group'],
  users: ['usernames', 'username'],
  policies: ['policies', 'policy'],
}

// What the rule's resources are, in words.
function subject(row: Row): string {
  const target = row.target.trim()
  switch (row.area) {
    case 'everything':
      return 'everything'
    case 'custom':
      return target
    case 'secrets':
      if (row.scope === 'folder') return `every secret in ${target.replace(/\/+$/, '')}/`
      return row.scope === 'one' ? `the secret ${target}` : 'every secret'
    default: {
      const [plural, one] = NOUNS[row.area]!
      if (row.scope === 'collection') return plural
      if (row.scope === 'tokens') return `tokens for entity ${target}`
      return row.scope === 'one' ? `${one} ${target}` : `every ${one}`
    }
  }
}

// The rule as a sentence: what it lets the token do, on what.
export function describe(row: Row): string {
  if (row.capabilities.includes('deny')) return `Refuses everything on ${subject(row)}, whatever other rules grant.`
  if (row.area === 'seal' && row.capabilities.includes('update')) return 'Seal the instance.'
  const verbs = row.capabilities.flatMap((c) => {
    if (c !== 'create' || row.area !== 'entities') return VERBS[c] ?? []
    // On one entity's tokens, or every entity's, creating issues a token.
    if (row.scope === 'tokens') return ['issue']
    return row.scope === 'all' ? ['issue tokens for'] : ['create']
  })
  if (verbs.length === 0) return 'Grants nothing yet.'
  const sentence = `${joined(verbs)} ${subject(row)}.`
  return sentence[0]!.toUpperCase() + sentence.slice(1)
}
