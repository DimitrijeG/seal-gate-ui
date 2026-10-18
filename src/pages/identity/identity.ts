import type { components } from '../../api/schema'

export type Summary = components['schemas']['Summary']
export type UserSummary = components['schemas']['UserSummary']

// EntityRequest's and GroupRequest's bound on an alias, UserRequest's on a
// password, and the username bound in the path, all in UTF-8 bytes.
const MAX_ALIAS = 128
const MAX_USERNAME = 128
const MAX_PASSWORD = 1024

const LOWER_SEGMENT = /^[a-z0-9._-]+$/

function bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

// Why seal-gate would refuse an entity's or group's alias, or null. One
// segment of lowercase [a-z0-9._-], not `.` or `..`, at most 128 bytes.
// Empty is allowed and holds no alias.
export function aliasProblem(alias: string): string | null {
  if (alias === '') return null
  if (bytes(alias) > MAX_ALIAS) return `At most ${MAX_ALIAS} bytes.`
  if (alias === '.' || alias === '..') return 'Not . or ..'
  if (!LOWER_SEGMENT.test(alias)) return 'Lowercase a–z 0–9 . _ - only.'
  return null
}

// Why seal-gate would refuse a username, or null. Same shape as an alias,
// but a username is the path segment itself, so it cannot be empty.
export function usernameProblem(name: string): string | null {
  if (name === '') return 'Enter a username.'
  if (bytes(name) > MAX_USERNAME) return `At most ${MAX_USERNAME} bytes.`
  if (name === '.' || name === '..') return 'Not . or ..'
  if (!LOWER_SEGMENT.test(name)) return 'Lowercase a–z 0–9 . _ - only.'
  return null
}

// Why seal-gate would refuse a password, or null. UserRequest takes 1 to
// 1024 bytes once UTF-8 encoded.
export function passwordProblem(password: string): string | null {
  if (password === '') return 'Enter a password.'
  if (bytes(password) > MAX_PASSWORD) return `Longer than any password seal-gate accepts (${MAX_PASSWORD} bytes).`
  return null
}

// The start of an ID, as the console shows one that has no name.
export function shortId(id: string): string {
  return id.slice(0, 8)
}

// How the console names an entity or group: its alias, or the start of its
// ID. The same shape as `displayName` for whoever is signed in.
export function label(summary: Summary, kind: 'entity' | 'group'): string {
  return summary.alias ?? `${kind} ${shortId(summary.id)}`
}

// The list's find box: an entity or group matches by name or by ID.
export function matches(summary: Summary, needle: string): boolean {
  const text = needle.trim().toLowerCase()
  if (text === '') return true
  return summary.id.includes(text) || (summary.alias?.toLowerCase().includes(text) ?? false)
}

export interface GroupPill {
  id: string
  name: string
  // True only when the group list was read and does not hold the ID.
  deleted: boolean
}

// An entity's groups as pills, named from the group list. One the list
// lacks was deleted and grants nothing, so it is marked; if groups cannot
// be listed at all, every one shows as a bare ID and none as deleted.
export function groupPills(ids: string[], groups: Summary[] | null): GroupPill[] {
  return ids.map((id) => {
    if (groups === null) return { id, name: `group ${shortId(id)}`, deleted: false }
    const found = groups.find((g) => g.id === id)
    if (found === undefined) return { id, name: `Deleted group ${shortId(id)}`, deleted: true }
    return { id, name: label(found, 'group'), deleted: false }
  })
}

export interface InheritedPolicy {
  name: string
  // The groups that bring it, as shown: "from auditors".
  from: string[]
}

// The policies an entity gets through its groups, less the ones it already
// holds directly — those show as its own. Sorted by name, each with the
// groups that bring it.
export function inheritedPolicies(
  direct: string[],
  brought: { group: string; policies: string[] }[],
): InheritedPolicy[] {
  const held = new Set(direct)
  const byName = new Map<string, string[]>()
  for (const { group, policies } of brought) {
    for (const name of policies) {
      if (held.has(name)) continue
      const from = byName.get(name)
      if (from === undefined) byName.set(name, [group])
      else if (!from.includes(group)) from.push(group)
    }
  }
  return [...byName]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, from]) => ({ name, from }))
}

export type TtlUnit = 'minutes' | 'hours'

export const TTL_PRESETS: { label: string; seconds: number }[] = [
  { label: '1 hour', seconds: 3600 },
  { label: '8 hours', seconds: 8 * 3600 },
  { label: '1 day', seconds: 24 * 3600 },
]

// A custom token lifetime in seconds, or why it cannot be sent. The server
// refuses one above its maximum and no API says what that is, so any whole
// number is offered and a refusal is shown where it was asked.
export function customTtl(amount: string, unit: TtlUnit): { seconds: number } | { problem: string } {
  const text = amount.trim()
  if (text === '') return { problem: 'Enter a number.' }
  if (!/^\d+$/.test(text)) return { problem: 'Whole minutes or hours.' }
  const seconds = Number(text) * (unit === 'hours' ? 3600 : 60)
  if (seconds < 60) return { problem: 'At least 1.' }
  if (!Number.isSafeInteger(seconds)) return { problem: 'Too large.' }
  return { seconds }
}

// The usernames list's find box: a user matches by username, by the name of
// the entity it signs in as, or by that entity's ID.
export function userMatches(user: UserSummary, entityName: string, needle: string): boolean {
  const text = needle.trim().toLowerCase()
  if (text === '') return true
  return (
    user.name.toLowerCase().includes(text) ||
    entityName.toLowerCase().includes(text) ||
    user.entity_id.includes(text)
  )
}

// Why seal-gate would refuse an ID typed in by hand, or null: it generates
// 16 random bytes in lowercase hex. For pickers and forms that name an
// entity or group by ID, where the token may not list them.
export function idProblem(id: string): string | null {
  if (id === '') return 'Enter an ID.'
  if (!/^[0-9a-f]{32}$/.test(id)) return '32 lowercase hex characters.'
  return null
}
