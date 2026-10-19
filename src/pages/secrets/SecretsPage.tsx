import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { type Capabilities, can, canAnythingUnder, capabilities, offers } from '../../api/capabilities/capabilities'
import { listablePrefixes, readablePaths } from '../../api/capabilities/evaluate'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, isServerFault, messageText } from '../../api/result'
import { useStore } from '../../lib/store'
import { ServerFault } from '../../ui/ServerFault'
import { NewSecret } from './NewSecret'
import { baseName, folderView, parseLocation } from './paths'
import { SecretDetail } from './SecretDetail'
import './SecretsPage.css'

// Secrets per page; a folder's subfolders are always all shown.
const PAGE = 10

// Where the paths come from: the prefixes to list, and single paths to add
// that no listing can reach.
interface Sources {
  starts: string[]
  known: string[]
}

// Every path in one request when the token may list them all, or the server
// must decide; otherwise each folder its rules let it list, merged with the
// single secrets they let it read. Either way folders, counts and search work
// from the top. Null while the rules are still being read.
function sources(caps: Capabilities): Sources | null {
  const area = resources.secretList()
  const all = can(caps, 'list', area)
  if (all === 'pending') return null
  if (all !== 'no' || caps.state !== 'rules') return { starts: [''], known: [] }
  const strip = (p: string) => p.slice(area.length)
  return { starts: listablePrefixes(caps.rules, area).map(strip), known: readablePaths(caps.rules, area).map(strip) }
}

// The last answer to the list requests, and the sources it was for: one for
// other sources counts as still loading.
type Listing =
  | { state: 'none' }
  | { state: 'ok'; from: Sources; paths: string[] }
  // The server broke; Errors.dc shows its own sentence and a Retry.
  | { state: 'fault'; from: Sources }
  | { state: 'error'; from: Sources; messages: string[] }

export function SecretsPage() {
  const rest = useParams()['*'] ?? ''
  const { folder, selected } = parseLocation(rest)
  const [search, setSearch] = useSearchParams()
  const creating = search.get('new') !== null
  const navigate = useNavigate()
  const caps = useStore(capabilities)

  const from = useMemo(() => sources(caps), [caps])
  const limited = caps.state === 'rules' && can(caps, 'list', resources.secretList()) === 'no'
  const canCreate = offers(canAnythingUnder(caps, 'secrets/', 'create'))

  const [listing, setListing] = useState<Listing>({ state: 'none' })
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    if (from === null || from.starts.length === 0) return
    let current = true
    const requests = from.starts.map((prefix) => call(api.GET('/secrets', { params: { query: prefix === '' ? {} : { prefix } } })))
    void Promise.all(requests).then((results) => {
      if (!current) return
      const found = new Set(from.known)
      for (const res of results) {
        if (res.ok) {
          res.data.paths.forEach((p) => found.add(p))
          continue
        }
        if (isServerFault(res.error)) setListing({ state: 'fault', from })
        else if (res.error.kind === 'http') setListing({ state: 'error', from, messages: res.error.messages })
        return
      }
      setListing({ state: 'ok', from, paths: [...found].sort() })
    })
    return () => {
      current = false
    }
  }, [from, reloads])

  // With nothing to list, the single secrets are the whole answer.
  const answered = listing.state !== 'none' && listing.from === from
  const paths =
    from !== null && from.starts.length === 0 ? from.known : answered && listing.state === 'ok' ? listing.paths : null
  const listError = answered && listing.state === 'error' ? listing.messages : null
  const listFault = answered && listing.state === 'fault'
  const nothing = from !== null && from.starts.length === 0 && from.known.length === 0
  const openNew = () => setSearch({ new: '' })
  const closeNew = () => setSearch({})

  return (
    <>
      <div className="secrets-head">
        <div className="page-head">
          <h1>Secrets</h1>
          <p>
            {paths !== null && !nothing && `${paths.length} ${paths.length === 1 ? 'secret' : 'secrets'}${limited ? ' this token may see' : ''}. `}
            Values are encrypted with the master key before they reach storage.
          </p>
        </div>
        {canCreate && !creating && (
          <button type="button" className="button button--primary button--lg" onClick={openNew}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New secret
          </button>
        )}
      </div>

      <div className="secrets-body">
        <section className="secrets-browse" aria-label="Browse secrets">
          {from === null ? null : nothing ? (
            <p className="muted secrets-browse__message">This token may not list or read any secrets.</p>
          ) : listFault ? (
            <ServerFault className="secrets-browse__message" onRetry={reload} />
          ) : listError !== null ? (
            <p className="alert secrets-browse__message" role="alert">
              {messageText(listError)}
            </p>
          ) : (
            <Browser paths={paths} folder={folder} selected={selected} />
          )}
        </section>

        {creating ? (
          <NewSecret
            folder={folder}
            existing={paths}
            onCancel={closeNew}
            onCreated={(path) => {
              reload()
              void navigate(`/secrets/${path}`)
            }}
          />
        ) : selected !== null ? (
          <SecretDetail
            key={selected}
            path={selected}
            onGone={() => {
              reload()
              void navigate(`/secrets/${folder}`)
            }}
          />
        ) : (
          <section className="secrets-detail secrets-detail--empty" aria-label="Secret">
            <p className="muted">Pick a secret to see its value.</p>
          </section>
        )}
      </div>
    </>
  )
}

interface BrowserProps {
  paths: string[] | null
  folder: string
  selected: string | null
}

function Browser({ paths, folder, selected }: BrowserProps) {
  const [filter, setFilter] = useState('')
  const [scope, setScope] = useState<'folder' | 'all'>('folder')
  const [page, setPage] = useState(0)
  // A new folder or filter starts again on the first page.
  const [pageKey, setPageKey] = useState(`${folder}|${filter}|${scope}`)
  if (pageKey !== `${folder}|${filter}|${scope}`) {
    setPageKey(`${folder}|${filter}|${scope}`)
    setPage(0)
  }

  const needle = filter.trim().toLowerCase()
  const searchingAll = scope === 'all' && needle !== ''
  let folders: { name: string; count: number }[] = []
  let secrets: string[] = []
  if (paths !== null) {
    if (searchingAll) {
      secrets = paths.filter((p) => p.toLowerCase().includes(needle))
    } else {
      const view = folderView(paths, folder)
      folders = view.folders.filter((f) => f.name.toLowerCase().includes(needle))
      secrets = view.secrets.filter((p) => baseName(p).toLowerCase().includes(needle))
    }
  }
  const pages = Math.max(1, Math.ceil(secrets.length / PAGE))
  const shown = secrets.slice(page * PAGE, (page + 1) * PAGE)
  const place = searchingAll ? 'all paths' : folder === '' ? 'the top level' : folder

  return (
    <>
      <div className="secrets-tools">
        <Breadcrumb folder={folder} />
        <div className="secrets-tools__row">
          <div className="secrets-filter">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.5-4.5" />
            </svg>
            <label htmlFor="filter" className="visually-hidden">
              Filter
            </label>
            <input id="filter" type="search" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <label htmlFor="scope" className="visually-hidden">
            Search in
          </label>
          <select id="scope" className="secrets-scope" value={scope} onChange={(e) => setScope(e.target.value as 'folder' | 'all')}>
            <option value="folder">In {folder === '' ? 'the top level' : folder}</option>
            <option value="all">In all paths</option>
          </select>
        </div>
      </div>

      {paths === null ? (
        <p className="muted secrets-browse__message">Loading…</p>
      ) : folders.length === 0 && secrets.length === 0 ? (
        <p className="muted secrets-browse__message">
          {needle !== '' ? `Nothing in ${place} matches “${filter.trim()}”.` : paths.length === 0 ? 'No secrets yet.' : `Nothing in ${place}.`}
        </p>
      ) : (
        <ul className="secrets-list" aria-label="Contents">
          {folders.map((f) => (
            <li key={f.name}>
              <Link className="secrets-row" to={`/secrets/${folder}${f.name}`}>
                <span className="secrets-row__name">
                  <FolderIcon />
                  <span className="secrets-row__folder">{f.name}</span>
                </span>
                <span className="secrets-row__count">
                  {f.count} {f.count === 1 ? 'secret' : 'secrets'}
                </span>
              </Link>
            </li>
          ))}
          {shown.map((p) => (
            <li key={p}>
              <Link className="secrets-row" to={`/secrets/${p}`} aria-current={p === selected ? 'true' : undefined}>
                <span className="secrets-row__name">
                  <SecretIcon />
                  <span className="secrets-row__secret">{searchingAll ? p : baseName(p)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {paths !== null && (
        <div className="secrets-foot">
          <span className="muted">
            {!searchingAll && `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}, `}
            {secrets.length === 0
              ? `no secrets in ${place}`
              : `${page * PAGE + 1}–${page * PAGE + shown.length} of ${secrets.length} ${secrets.length === 1 ? 'secret' : 'secrets'} in ${place}`}
          </span>
          {pages > 1 && (
            <div className="secrets-foot__pages">
              <button type="button" className="secrets-page" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button type="button" className="secrets-page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Breadcrumb({ folder }: { folder: string }) {
  const segments = folder.split('/').filter((s) => s !== '')
  return (
    <nav aria-label="Path" className="secrets-crumbs">
      <ol>
        <li>{segments.length === 0 ? <span aria-current="page">all</span> : <Link to="/secrets/">all</Link>}</li>
        {segments.map((segment, i) => {
          const to = `/secrets/${segments.slice(0, i + 1).join('/')}/`
          const last = i === segments.length - 1
          return [
            <li key={`sep-${i}`} aria-hidden="true" className="secrets-crumbs__sep">
              /
            </li>,
            <li key={to}>{last ? <span aria-current="page">{segment}</span> : <Link to={to}>{segment}</Link>}</li>,
          ]
        })}
      </ol>
    </nav>
  )
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-600)" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h6l2 2h10v10H3z" />
    </svg>
  )
}

function SecretIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="10" rx="3" />
      <circle cx="8" cy="12" r="0.9" />
      <circle cx="12" cy="12" r="0.9" />
      <circle cx="16" cy="12" r="0.9" />
    </svg>
  )
}
