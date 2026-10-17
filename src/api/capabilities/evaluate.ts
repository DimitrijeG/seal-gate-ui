import type { components } from '../schema'

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

// Whether the rules could allow anything at all under `prefix`, for deciding
// whether a whole area of the console is worth offering. False when nothing
// grants there, or a deny covers all of it.
export function allowsAnythingUnder(rules: Rule[], prefix: string): boolean {
  const overlaps = (pattern: string) =>
    pattern.endsWith('*')
      ? pattern.slice(0, -1).startsWith(prefix) || prefix.startsWith(pattern.slice(0, -1))
      : pattern.startsWith(prefix)
  const coversAll = (pattern: string) => pattern.endsWith('*') && prefix.startsWith(pattern.slice(0, -1))

  if (rules.some((r) => r.capabilities.includes('deny') && coversAll(r.path))) return false
  return rules.some((r) => overlaps(r.path) && r.capabilities.some((c) => c !== 'deny'))
}
