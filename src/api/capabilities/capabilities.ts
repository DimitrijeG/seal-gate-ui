import { createStore, useStore } from '../../lib/store'
import { api, refusals } from '../client'
import { call } from '../result'
import { identity, token } from '../session'
import { type Capability, type Rule, allows, allowsAnythingUnder } from './evaluate'

// What the console knows about what the session's token may do: the rules the
// server reports for it, evaluated here only to decide what to offer. If the
// server could not report them, it does not know, and offers actions and lets
// the server decide.
export type Capabilities =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'root' }
  | { state: 'rules'; rules: Rule[] }
  | { state: 'unknown' }

// `pending` while the rules are still being read; `unknown` once reading
// them failed.
export type Answer = 'yes' | 'no' | 'unknown' | 'pending'

export const capabilities = createStore<Capabilities>({ state: 'none' })

// Counts loads and resets; a load that finishes after a newer one started,
// or after a reset, is discarded.
let generation = 0

// A different token may do different things.
token.subscribe(forgetCapabilities)

// A refusal while the rules were known means they changed (someone edited a
// policy or a group): read them again. Not while unknown, where the server
// decides anyway, or loading, where the new rules are on their way.
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
  const result = await readRules()
  if (run === generation && token.get() === asked) capabilities.set(result)
}

// The rules the server checks the token against, its own policies' and its
// groups'. Asking needs nothing beyond the token, so only a fault fails it.
async function readRules(): Promise<Capabilities> {
  const res = await call(api.GET('/auth/token/self/rules'))
  if (!res.ok) return { state: 'unknown' }
  if (res.data.root === true) return { state: 'root' }
  return res.data.rules === undefined ? { state: 'unknown' } : { state: 'rules', rules: res.data.rules }
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
