import type { Status } from '../api/client'

export interface NavItem {
  to: string
  label: string
}

const INITIALIZE: NavItem = { to: '/init', label: 'Initialize' }
const UNSEAL: NavItem = { to: '/unseal', label: 'Unseal' }
const WORK: NavItem[] = [
  { to: '/secrets', label: 'Secrets' },
  { to: '/identity', label: 'Identity' },
  { to: '/policies', label: 'Policies' },
]

// Only what the current state allows: Initialize until it is done, Unseal
// after, and the working screens once unsealed and signed in.
export function navItems(status: Status | null, signedIn: boolean): NavItem[] {
  if (status === null) return []
  if (!status.initialized) return [INITIALIZE]
  if (status.sealed || !signedIn) return [UNSEAL]
  return [UNSEAL, ...WORK]
}

// Where the console opens: the first step the instance still needs. Null
// while the status is unknown.
export function startPath(status: Status | null, signedIn: boolean): string | null {
  if (status === null) return null
  if (!status.initialized) return '/init'
  if (status.sealed) return '/unseal'
  if (!signedIn) return '/login'
  return '/secrets'
}
