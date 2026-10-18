import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { SearchIcon } from '../../app/icons'
import { messageText } from '../../api/result'
import { ServerFault } from '../../ui/ServerFault'
import { type Summary, matches } from './identity'
import type { Listing } from './lists'

// Rows per page. Entities and groups are listed whole, so paging is done
// here from what came back.
export const PAGE = 10

interface FindListProps {
  kind: 'entity' | 'group'
  listing: Listing<Summary>
  // The ID shown in the detail pane beside it, if any.
  selected: string | null
  canCreate: boolean
  onNew: () => void
  href: (summary: Summary) => string
  name: (summary: Summary) => string
  // Shown under the refusal, where there is somewhere else to go.
  denied?: ReactNode
  // Reads the listing again, for Errors.dc's Retry after a 500.
  onRetry: () => void
}

// The design's left pane: find, New, the names, and paging under them.
// Entities and groups list the same way.
export function FindList({ kind, listing, selected, canCreate, onNew, href, name, denied, onRetry }: FindListProps) {
  const [find, setFind] = useState('')
  const [page, setPage] = useState(0)
  // A new search starts again on the first page.
  const [pageKey, setPageKey] = useState(find)
  if (pageKey !== find) {
    setPageKey(find)
    setPage(0)
  }

  const all = listing.state === 'ok' ? listing.items : null
  // The API sorts by ID, which is random, so the names would come out in no
  // order at all. The design lists them by name.
  const shown = (all?.filter((summary) => matches(summary, find)) ?? [])
    .slice()
    .sort((a, b) => name(a).localeCompare(name(b)))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const onPage = shown.slice(page * PAGE, (page + 1) * PAGE)
  const plural = kind === 'entity' ? 'entities' : 'groups'

  return (
    <section className="identity-list" aria-label={plural[0]!.toUpperCase() + plural.slice(1)}>
      <div className="identity-list__tools">
        <div className="search-field">
          <SearchIcon size={18} />
          <label htmlFor="find" className="visually-hidden">
            Find {kind}
          </label>
          <input
            id="find"
            type="search"
            placeholder={all === null ? 'Name or ID' : `Find among ${all.length}`}
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
        </div>
        {canCreate && (
          <button type="button" className="button button--primary identity-list__new" onClick={onNew}>
            New
          </button>
        )}
      </div>

      {listing.state === 'denied' ? (
        <>
          <p className="muted identity-list__message">This token may not list {plural}.</p>
          {denied}
        </>
      ) : listing.state === 'fault' ? (
        <ServerFault className="identity-list__message" onRetry={onRetry} />
      ) : listing.state === 'error' ? (
        <p className="alert identity-list__message" role="alert">
          {messageText(listing.messages)}
        </p>
      ) : all === null ? (
        <p className="muted identity-list__message">Loading…</p>
      ) : onPage.length === 0 ? (
        <p className="muted identity-list__message">
          {all.length === 0 ? `No ${plural} yet.` : `No ${kind} matches “${find.trim()}”.`}
        </p>
      ) : (
        <>
          <ul className="identity-list__items" aria-label={`${kind === 'entity' ? 'Entity' : 'Group'} names`}>
            {onPage.map((summary) => (
              <li key={summary.id}>
                <Link
                  className="identity-list__item"
                  to={href(summary)}
                  aria-current={summary.id === selected ? 'true' : undefined}
                >
                  {/* The name alone: aliases are unique, and the panel
                      beside it shows the whole ID with a copy button. */}
                  <span className="identity-list__name">{name(summary)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="identity-list__foot">
            <span className="muted">
              {page * PAGE + 1}–{page * PAGE + onPage.length} of {shown.length}
            </span>
            {pages > 1 && (
              <div className="identity-list__pages">
                <button
                  type="button"
                  className="identity-page"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="identity-page"
                  aria-label="Next page"
                  disabled={page >= pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
