import type { components } from '../schema'

// The server reports the rules and is the authority on them; matching them
// here only decides what the console offers, never what is allowed.

export type Rule = components['schemas']['Rule']
export type Capability = Rule['capabilities'][number]

// A rule's path matches a resource exactly, or as a plain string prefix when
// it ends in `*` (so `secrets/dev*` matches `secrets/devx` too). Mirrors
// seal-gate's authorization.matches.
export function matches(pattern: string, resource: string): boolean {
  if (pattern.endsWith('*')) return resource.startsWith(pattern.slice(0, -1))
  return pattern === resource
}

// Whether the rules allow `capability` on `resource`: some matching rule
// grants it and no matching rule holds `deny`, which refuses every
// capability, not only the ones beside it. Mirrors seal-gate's
// authorization.Service.Authorize for an entity.
export function allows(rules: Rule[], resource: string, capability: Capability): boolean {
  let granted = false
  let denied = false
  for (const rule of rules) {
    if (!matches(rule.path, resource)) continue
    if (rule.capabilities.includes('deny')) denied = true
    if (rule.capabilities.includes(capability)) granted = true
  }
  return granted && !denied
}

// Whether the rules could allow anything at all under `prefix` (or, given a
// capability, that one), for deciding whether a whole area or an action with
// no resource yet is worth offering. False when nothing grants there, or a
// deny covers all of it.
export function allowsAnythingUnder(rules: Rule[], prefix: string, capability?: Capability): boolean {
  const overlaps = (pattern: string) =>
    pattern.endsWith('*')
      ? pattern.slice(0, -1).startsWith(prefix) || prefix.startsWith(pattern.slice(0, -1))
      : pattern.startsWith(prefix)
  const coversAll = (pattern: string) => pattern.endsWith('*') && prefix.startsWith(pattern.slice(0, -1))
  const grants = (caps: Capability[]) =>
    capability === undefined ? caps.some((c) => c !== 'deny') : caps.includes(capability)

  if (rules.some((r) => r.capabilities.includes('deny') && coversAll(r.path))) return false
  return rules.some((r) => overlaps(r.path) && grants(r.capabilities))
}

// The prefixes under `area` (itself included) that the rules let the token
// list, read from rules that grant `list`: `secrets/dev/*` gives
// `secrets/dev/`. One inside another is left out, so listing each once and
// merging covers everything a token that cannot list the whole area may list.
export function listablePrefixes(rules: Rule[], area: string): string[] {
  const found = new Set<string>()
  for (const rule of rules) {
    if (!rule.capabilities.includes('list') || !rule.path.startsWith(area)) continue
    const stem = rule.path.endsWith('*') ? rule.path.slice(0, -1) : rule.path
    const prefix = stem.slice(0, stem.lastIndexOf('/') + 1)
    if (prefix.length >= area.length && allows(rules, prefix, 'list')) found.add(prefix)
  }
  return [...found].filter((p) => ![...found].some((q) => q !== p && p.startsWith(q))).sort()
}

// The single resources under `area` the rules name exactly and let the token
// read: `secrets/token` gives itself. No folder listing can reach them, since
// a listing starts only at a folder, so the token's own rules are where their
// names come from.
export function readablePaths(rules: Rule[], area: string): string[] {
  const found = new Set<string>()
  for (const rule of rules) {
    const { path } = rule
    if (path.endsWith('*') || path.endsWith('/') || !path.startsWith(area) || path === area) continue
    if (allows(rules, path, 'read')) found.add(path)
  }
  return [...found].sort()
}
