import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { type Answer, can, capabilities } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { type ApiResult, call, isServerFault } from '../../api/result'
import { useStore } from '../../lib/store'
import type { Summary, UserSummary } from './identity'

// One of the listings behind the Identity screen. `denied` is for a token
// whose rules say it may not list them, so nothing was sent.
export type Listing<T> =
  | { state: 'loading' }
  | { state: 'ok'; items: T[] }
  | { state: 'denied' }
  // The server broke; Errors.dc shows its own sentence and a Retry.
  | { state: 'fault' }
  | { state: 'error'; messages: string[] }

// What a listing holds, or null while it is not there to show.
export function items<T>(listing: Listing<T>): T[] | null {
  return listing.state === 'ok' ? listing.items : null
}

const readEntities = (): Promise<ApiResult<Summary[]>> =>
  call(api.GET('/entities')).then((res) => (res.ok ? { ok: true, data: res.data.entities } : res))

const readGroups = (): Promise<ApiResult<Summary[]>> =>
  call(api.GET('/groups')).then((res) => (res.ok ? { ok: true, data: res.data.groups } : res))

const readPolicies = (): Promise<ApiResult<string[]>> =>
  call(api.GET('/policies')).then((res) => (res.ok ? { ok: true, data: res.data.names } : res))

const readUsers = (): Promise<ApiResult<UserSummary[]>> =>
  call(api.GET('/auth/users')).then((res) => (res.ok ? { ok: true, data: res.data.users } : res))

function useListing<T>(canList: Answer, read: () => Promise<ApiResult<T[]>>): [Listing<T>, () => void] {
  const [listing, setListing] = useState<Listing<T>>({ state: 'loading' })
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    // Nothing is sent until the rules are known, or once they refuse it.
    if (canList === 'pending' || canList === 'no') return
    let current = true
    void read().then((res) => {
      if (!current) return
      if (res.ok) setListing({ state: 'ok', items: res.data })
      else if (isServerFault(res.error)) setListing({ state: 'fault' })
      else if (res.error.kind === 'http') setListing({ state: 'error', messages: res.error.messages })
      // Unreachable or sealed: the shell's banner says so, and the next
      // status poll brings the read back.
    })
    return () => {
      current = false
    }
  }, [canList, read, reloads])

  return [canList === 'no' ? { state: 'denied' } : listing, reload]
}

// The listings the Identity screen is built from. They are read once for the
// whole screen rather than per tab: the section tabs count them, the entity
// list names the groups an entity holds, the usernames list names the entity
// each one signs in as, and both detail panels pick from the policy names.
export interface Lists {
  entities: Listing<Summary>
  groups: Listing<Summary>
  users: Listing<UserSummary>
  policies: Listing<string>
  reloadEntities: () => void
  reloadGroups: () => void
  reloadUsers: () => void
}

export const ListsContext = createContext<Lists | null>(null)

// Reads them all, for the provider the Identity screen puts above its tabs.
export function useListsValue(): Lists {
  const caps = useStore(capabilities)
  const [entities, reloadEntities] = useListing(can(caps, 'list', resources.entities), readEntities)
  const [groups, reloadGroups] = useListing(can(caps, 'list', resources.groups), readGroups)
  const [users, reloadUsers] = useListing(can(caps, 'list', resources.users), readUsers)
  const [policies] = useListing(can(caps, 'list', resources.policies), readPolicies)
  return { entities, groups, users, policies, reloadEntities, reloadGroups, reloadUsers }
}

export function useLists(): Lists {
  const lists = useContext(ListsContext)
  if (lists === null) throw new Error('useLists outside the Identity screen')
  return lists
}
