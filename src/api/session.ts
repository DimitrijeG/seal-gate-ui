import { createStore } from '../lib/store'
import type { components } from './schema'

// The session token lives in sessionStorage only: it survives a reload but
// not closing the tab, and never reaches localStorage, a URL or a log.
const KEY = 'seal-gate.token'

// Whom the session's token authenticates as, from /auth/token/self.
export type Identity =
  | { root: true }
  | { root: false; entityId: string; alias: string | null; expiresAt: string }

// The generated type leaves every field optional (its oneOf cannot be
// expressed in TypeScript), so the shape is checked here. Null for an answer
// in neither shape the spec allows.
export function toIdentity(self: components['schemas']['TokenSelfResponse']): Identity | null {
  if (self.root === true) return { root: true }
  if (self.entity_id !== undefined && self.expires_at !== undefined) {
    return { root: false, entityId: self.entity_id, alias: self.alias ?? null, expiresAt: self.expires_at }
  }
  return null
}

// How the console names whoever is signed in: the alias, "root", or the
// start of the entity ID when it has no alias.
export function displayName(who: Identity): string {
  if (who.root) return 'root'
  return who.alias ?? `entity ${who.entityId.slice(0, 8)}`
}

function load(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const token = createStore<string | null>(load())

// Null until read from the server for the current token.
export const identity = createStore<Identity | null>(null)

// Set when a request made with the session token came back 401: the token
// expired, was revoked, or its entity was deleted. The page stays where it
// is behind a dialog until the user signs in again.
export const sessionEnded = createStore(false)

export function signIn(value: string, who: Identity | null = null): void {
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    // Storage blocked: the session lasts until reload.
  }
  token.set(value)
  identity.set(who)
  sessionEnded.set(false)
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
  token.set(null)
  identity.set(null)
}

export function endSession(): void {
  signOut()
  sessionEnded.set(true)
}
