import { createStore } from '../lib/store'

// The session token lives in sessionStorage only: it survives a reload but
// not closing the tab, and never reaches localStorage, a URL or a log.
const KEY = 'seal-gate.token'

function load(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const token = createStore<string | null>(load())

// Set when a request made with the session token came back 401: the token
// expired, was revoked, or its entity was deleted. The page stays where it
// is behind a dialog until the user signs in again.
export const sessionEnded = createStore(false)

export function signIn(value: string): void {
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    // Storage blocked: the session lasts until reload.
  }
  token.set(value)
  sessionEnded.set(false)
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
  token.set(null)
}

export function endSession(): void {
  signOut()
  sessionEnded.set(true)
}
