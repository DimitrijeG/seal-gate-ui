import type { Status } from '../api/client'

export interface NavItem {
  to: string
  label: string
}

const INITIALIZE: NavItem = { to: '/init', label: 'Initialize' }
const UNSEAL: NavItem = { to: '/unseal', label: 'Unseal' }
// The home screen: always offered, since it says so when the token may see nothing.
const SECRETS: NavItem = { to: '/secrets', label: 'Secrets' }
const OPTIONAL: NavItem[] = [
  { to: '/identity', label: 'Identity' },
  { to: '/policies', label: 'Policies' },
]

// Only what the current state allows: Initialize until it is done, Unseal
// while sealed, and once unsealed and signed in the working screens, less any
// the token surely cannot use (`offered` answers that per screen path).
// Sealing is not a screen: the status in the header offers it.
export function navItems(
  status: Status | null,
  signedIn: boolean,
  offered: (to: string) => boolean = () => true,
): NavItem[] {
  if (status === null) return []
  if (!status.initialized) return [INITIALIZE]
  if (status.sealed) return [UNSEAL]
  if (!signedIn) return []
  return [SECRETS, ...OPTIONAL.filter((item) => offered(item.to))]
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
