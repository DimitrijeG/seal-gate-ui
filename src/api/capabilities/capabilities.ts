import { createStore, useStore } from '../../lib/store'
import { api, refusals } from '../client'
import { call } from '../result'
import { identity, token } from '../session'
import { type Capability, type Rule, allows, allowsAnythingUnder } from './evaluate'

// What the console knows about what the session's token may do. No API says,
// so for an entity it reads the entity, its groups and their policies and
// evaluates the rules as the server would. If any of those reads is refused,
// it does not know, and offers actions and lets the server decide.
export type Capabilities =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'root' }
  | { state: 'rules'; rules: Rule[] }
  | { state: 'unknown' }

// `pending` while the rules are still being read; `unknown` once reading
// them was refused.
export type Answer = 'yes' | 'no' | 'unknown' | 'pending'

export const capabilities = createStore<Capabilities>({ state: 'none' })

// Counts loads and resets; a load that finishes after a newer one started,
// or after a reset, is discarded.
let generation = 0

// A different token may do different things.
token.subscribe(forgetCapabilities)

// A refusal while the rules were known means they changed (someone edited a
// policy or a group): read them again. Not while unknown or loading, where a
// refusal is expected and reading again would only be refused again.
refusals.subscribe(() => {
  if (capabilities.get().state === 'rules') forgetCapabilities()
})

// Drops what is known, so the shell reads it again; also for screens that
// change the session's own entity, groups or policies.
export function forgetCapabilities(): void {
  generation++
  capabilities.set({ state: 'none' })
}

export async function loadCapabilities(): Promise<void> {
  const who = identity.get()
  if (who === null) return
  if (who.root) {
    capabilities.set({ state: 'root' })
    return
  }
  const run = ++generation
  const asked = token.get()
  capabilities.set({ state: 'loading' })
  const result = await readRules(who.entityId)
  if (run === generation && token.get() === asked) {
    capabilities.set(result === null ? { state: 'unknown' } : { state: 'rules', rules: result })
  }
}

// The rules of every policy the entity holds, directly or through a group;
// null as soon as one read is refused or fails. A deleted group and a missing
// policy grant nothing, as on the server, so they are skipped.
async function readRules(entityId: string): Promise<Rule[] | null> {
  const entity = await call(api.GET('/entities/{id}', { params: { path: { id: entityId } } }))
  if (!entity.ok) return null

  const names = new Set(entity.data.policies)
  for (const id of entity.data.groups) {
    const group = await call(api.GET('/groups/{id}', { params: { path: { id } } }))
    if (group.ok) group.data.policies.forEach((name) => names.add(name))
    else if (!(group.error.kind === 'http' && group.error.status === 404)) return null
  }

  const rules: Rule[] = []
  for (const name of names) {
    const policy = await call(api.GET('/policies/{name}', { params: { path: { name } } }))
    if (policy.ok) rules.push(...policy.data.rules)
    else if (!(policy.error.kind === 'http' && policy.error.status === 404)) return null
  }
  return rules
}

export function can(caps: Capabilities, capability: Capability, resource: string): Answer {
  switch (caps.state) {
    case 'root':
      return 'yes'
    case 'rules':
      return allows(caps.rules, resource, capability) ? 'yes' : 'no'
    case 'unknown':
      return 'unknown'
    default:
      return 'pending'
  }
}

export function canAnythingUnder(caps: Capabilities, prefix: string, capability?: Capability): Answer {
  switch (caps.state) {
    case 'root':
      return 'yes'
    case 'rules':
      return allowsAnythingUnder(caps.rules, prefix, capability) ? 'yes' : 'no'
    case 'unknown':
      return 'unknown'
    default:
      return 'pending'
  }
}

// Whether to offer something: yes, or unknown, in which case the server
// decides and a refusal is shown where it was asked. Nothing is offered while
// the answer is pending, so an action never appears only to vanish.
export function offers(answer: Answer): boolean {
  return answer === 'yes' || answer === 'unknown'
}

export function useCan(capability: Capability, resource: string): boolean {
  return offers(can(useStore(capabilities), capability, resource))
}
