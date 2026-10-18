import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { canAnythingUnder, capabilities, offers } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { useStore } from '../../lib/store'
import { ListsContext, useLists, useListsValue } from './lists'
import './IdentityPage.css'

interface Tab {
  kind: 'entities' | 'groups' | 'users'
  to: string
  label: string
  // The area the token must be able to do something under for the tab to
  // be worth offering.
  area: string
  lead: string
}

const TABS: Tab[] = [
  {
    kind: 'entities',
    to: '/identity/entities',
    label: 'Entities',
    area: resources.entities,
    lead: 'An entity is a person or service. It gets access from groups and from policies given to it directly, signs in with a username or a token, and every token speaks for one entity.',
  },
  {
    kind: 'groups',
    to: '/identity/groups',
    label: 'Groups',
    area: resources.groups,
    lead: 'A group is a named set of policies. Every entity in it gets those policies, so changing the group changes access for all of them at once.',
  },
  {
    kind: 'users',
    to: '/identity/usernames',
    label: 'Usernames',
    area: resources.users,
    lead: 'A username and password let a person sign in as an entity. Several usernames can sign in as the same entity; services usually have none and use tokens instead.',
  },
]

// The tabs this token is offered, in order. Empty while the rules are still
// being read, so a tab never appears only to vanish.
function useTabs(): Tab[] {
  const caps = useStore(capabilities)
  return TABS.filter((tab) => offers(canAnythingUnder(caps, tab.area)))
}

export function IdentityPage() {
  const lists = useListsValue()
  return (
    <ListsContext.Provider value={lists}>
      <Sections />
    </ListsContext.Provider>
  )
}

function Sections() {
  const tabs = useTabs()
  const { pathname } = useLocation()
  const current = tabs.find((tab) => pathname.startsWith(tab.to))

  return (
    <>
      <div className="page-head">
        <h1>Identity</h1>
        <p>{current?.lead ?? TABS[0]!.lead}</p>
      </div>

      {tabs.length > 1 && (
        <nav aria-label="Identity sections" className="identity-tabs">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="identity-tabs__tab">
              {tab.label}
              <Count kind={tab.kind} />
            </NavLink>
          ))}
        </nav>
      )}

      <Outlet />
    </>
  )
}

// How many a tab holds, from the listing it shows. Nothing while it is not
// known: a token may be able to read entities without listing them.
function Count({ kind }: { kind: Tab['kind'] }) {
  const listing = useLists()[kind]
  if (listing.state !== 'ok') return null
  return <span className="identity-tabs__count">{listing.items.length}</span>
}

// `/identity` itself: the first section this token is offered. The nav only
// shows Identity when there is one.
export function IdentityIndex() {
  const tabs = useTabs()
  if (tabs.length === 0) return <p className="muted">Loading…</p>
  return <Navigate to={tabs[0]!.to} replace />
}
