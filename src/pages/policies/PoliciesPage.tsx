import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { can, canAnythingUnder, capabilities, offers } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, isServerFault, messageText } from '../../api/result'
import { useStore } from '../../lib/store'
import { ServerFault } from '../../ui/ServerFault'
import { PolicyEditor } from './PolicyEditor'
import './PoliciesPage.css'

type Names =
  | { state: 'none' }
  | { state: 'ok'; names: string[] }
  // The server broke; Errors.dc shows its own sentence and a Retry.
  | { state: 'fault' }
  | { state: 'error'; messages: string[] }

export function PoliciesPage() {
  const name = useParams().name ?? null
  const [search] = useSearchParams()
  const creating = search.get('new') !== null
  const navigate = useNavigate()
  const caps = useStore(capabilities)

  const canList = can(caps, 'list', resources.policies)
  // A policy is created by storing it, which needs `update` on its name.
  const canCreate = offers(canAnythingUnder(caps, `${resources.policies}/`, 'update'))

  const [names, setNames] = useState<Names>({ state: 'none' })
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  const [find, setFind] = useState('')

  useEffect(() => {
    if (!offers(canList)) return
    let current = true
    void call(api.GET('/policies')).then((res) => {
      if (!current) return
      if (res.ok) setNames({ state: 'ok', names: res.data.names })
      else if (isServerFault(res.error)) setNames({ state: 'fault' })
      else if (res.error.kind === 'http') setNames({ state: 'error', messages: res.error.messages })
    })
    return () => {
      current = false
    }
  }, [canList, reloads])

  const all = names.state === 'ok' ? names.names : null
  const needle = find.trim().toLowerCase()
  const shown = all?.filter((n) => n.toLowerCase().includes(needle)) ?? []

  return (
    <>
      <div className="page-head">
        <h1>Policies</h1>
        <p>
          A rule grants capabilities on part of seal-gate: every secret, a folder of them, one item, or a list. Every
          matching rule applies, and a matching deny refuses whatever else is granted.
        </p>
      </div>

      <div className="policies-body">
        <section className="policies-list" aria-label="Policies">
          <div className="policies-list__tools">
            <div className="search-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-4.5-4.5" />
              </svg>
              <label htmlFor="find" className="visually-hidden">
                Find policy
              </label>
              <input
                id="find"
                type="search"
                placeholder={all === null ? 'Find policy' : `Find among ${all.length}`}
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
            </div>
            {canCreate && (
              <Link className="button button--primary policies-list__new" to="/policies?new">
                New
              </Link>
            )}
          </div>
          {canList === 'no' ? (
            <p className="muted policies-list__message">This token may not list policies.</p>
          ) : names.state === 'fault' ? (
            <ServerFault className="policies-list__message" onRetry={reload} />
          ) : names.state === 'error' ? (
            <p className="alert policies-list__message" role="alert">
              {messageText(names.messages)}
            </p>
          ) : all === null ? (
            <p className="muted policies-list__message">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="muted policies-list__message">
              {all.length === 0 ? 'No policies yet.' : `No policy matches “${find.trim()}”.`}
            </p>
          ) : (
            <ul className="policies-list__items" aria-label="Policy names">
              {shown.map((n) => (
                <li key={n}>
                  <Link className="policies-list__item" to={`/policies/${n}`} aria-current={n === name && !creating ? 'true' : undefined}>
                    {n}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {creating ? (
          <PolicyEditor
            key="new"
            name={null}
            existing={all}
            onSaved={(saved) => {
              reload()
              void navigate(`/policies/${saved}`)
            }}
            onGone={() => void navigate('/policies')}
          />
        ) : name !== null ? (
          <PolicyEditor
            key={name}
            name={name}
            existing={all}
            onSaved={reload}
            onGone={() => {
              reload()
              void navigate('/policies')
            }}
          />
        ) : (
          <section className="policies-editor policies-editor--empty" aria-label="Policy">
            <p className="muted">Pick a policy to see its rules.</p>
          </section>
        )}
      </div>
    </>
  )
}
