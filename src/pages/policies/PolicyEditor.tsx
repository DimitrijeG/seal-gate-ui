import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router'
import { can, capabilities, forgetCapabilities, offers } from '../../api/capabilities/capabilities'
import type { Rule } from '../../api/capabilities/evaluate'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, isServerFault, messageText } from '../../api/result'
import { displayName, identity } from '../../api/session'
import { useStore } from '../../lib/store'
import { ServerFault } from '../../ui/ServerFault'
import { COLUMNS, cellChanged, countChanges, nameProblem, ruleProblem, toggle } from './rules'

type Loaded =
  | { state: 'loading' }
  | { state: 'ok'; rules: Rule[] }
  | { state: 'gone' }
  | { state: 'forbidden' }
  | { state: 'fault' }
  | { state: 'error'; messages: string[] }

interface PolicyEditorProps {
  // Null for a new policy.
  name: string | null
  // Every listed name, to refuse a taken one before sending; null when the
  // list is not loaded.
  existing: string[] | null
  onSaved: (name: string) => void
  onGone: () => void
}

const EMPTY_RULE: Rule = { path: '', capabilities: [] }

export function PolicyEditor({ name, existing, onSaved, onGone }: PolicyEditorProps) {
  const caps = useStore(capabilities)
  const who = useStore(identity)
  const [loaded, setLoaded] = useState<Loaded>(name === null ? { state: 'ok', rules: [] } : { state: 'loading' })
  const [draft, setDraft] = useState<Rule[]>(name === null ? [EMPTY_RULE] : [])
  const [newName, setNewName] = useState('')
  const [view, setView] = useState<'rules' | 'json'>('rules')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  // Bumped by Errors.dc's Retry, to read the policy again after a 500.
  const [reads, setReads] = useState(0)

  useEffect(() => {
    if (name === null) return
    let current = true
    void call(api.GET('/policies/{name}', { params: { path: { name } } })).then((res) => {
      if (!current) return
      if (res.ok) {
        setLoaded({ state: 'ok', rules: res.data.rules })
        setDraft(res.data.rules)
      } else if (res.error.kind !== 'http') return
      else if (res.error.status === 404) setLoaded({ state: 'gone' })
      else if (res.error.status === 403) setLoaded({ state: 'forbidden' })
      else if (isServerFault(res.error)) setLoaded({ state: 'fault' })
      else setLoaded({ state: 'error', messages: res.error.messages })
    })
    return () => {
      current = false
    }
  }, [name, reads])

  const target = name ?? newName
  const saved = loaded.state === 'ok' ? loaded.rules : []
  const changes = name === null ? 0 : countChanges(saved, draft)
  const dirty = name === null ? newName !== '' || countChanges([EMPTY_RULE], draft) > 0 : changes > 0
  const canEdit = name === null || offers(can(caps, 'update', resources.policy(name)))
  const canDelete = name !== null && offers(can(caps, 'delete', resources.policy(name)))

  const problems = draft.map(ruleProblem)
  const invalid = problems.some((p) => p !== null)
  const nameError = name === null ? (nameProblem(newName) ?? (existing?.includes(newName) ? 'taken' : null)) : null
  const refused = name === null && nameProblem(newName) === null && can(caps, 'update', resources.policy(newName)) === 'no'

  // Leaving with unsaved edits asks first; leaving because they were just
  // saved, or the policy deleted, does not.
  const leaving = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leaving.current &&
      currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Leave without saving the changes to this policy?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const update = (row: number, next: Rule) => setDraft(draft.map((r, i) => (i === row ? next : r)))

  const save = async () => {
    if (invalid || nameError !== null || refused) return
    setBusy(true)
    setErrors([])
    const res = await call(api.PUT('/policies/{name}', { params: { path: { name: target } }, body: { rules: draft } }))
    setBusy(false)
    if (res.ok) {
      // The session's own rules may be among these.
      forgetCapabilities()
      if (name !== null) setLoaded({ state: 'ok', rules: draft })
      else leaving.current = true
      onSaved(target)
    } else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  const remove = async () => {
    if (name === null) return
    setBusy(true)
    setErrors([])
    const res = await call(api.DELETE('/policies/{name}', { params: { path: { name } } }))
    setBusy(false)
    if (res.ok) {
      forgetCapabilities()
      leaving.current = true
      onGone()
    } else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  if (loaded.state !== 'ok') {
    return (
      <section className="policies-editor" aria-labelledby="ed-h">
        <div className="policies-editor__head">
          <h2 id="ed-h" className="policies-editor__name">
            {name}
          </h2>
        </div>
        <div className="policies-editor__message">
          {loaded.state === 'loading' && <p className="muted">Loading…</p>}
          {loaded.state === 'gone' && (
            <div className="gone">
              <span className="gone__name">{name}</span>
              <span className="muted">No longer exists. Someone deleted it.</span>
              <button type="button" className="button button--quiet" onClick={onGone}>
                Refresh list
              </button>
            </div>
          )}
          {loaded.state === 'forbidden' && (
            <p className="denied">{who === null ? 'This token' : displayName(who)} can't read this policy.</p>
          )}
          {loaded.state === 'fault' && <ServerFault onRetry={() => setReads((n) => n + 1)} />}
          {loaded.state === 'error' && (
            <p className="alert" role="alert">
              {messageText(loaded.messages)}
            </p>
          )}
        </div>
      </section>
    )
  }

  const needle = filter.trim().toLowerCase()
  const visible = draft.map((rule, row) => ({ rule, row })).filter(({ rule }) => rule.path.toLowerCase().includes(needle))
  const label = name ?? (newName || 'new policy')

  return (
    <section className="policies-editor" aria-labelledby="ed-h">
      <div className="policies-editor__head">
        <div className="policies-editor__title">
          {name !== null ? (
            <h2 id="ed-h" className="policies-editor__name">
              {name}
            </h2>
          ) : (
            <div className="field">
              <h2 id="ed-h" className="policies-editor__new">
                New policy
              </h2>
              <label htmlFor="p-name" className="visually-hidden">
                Name
              </label>
              <input
                id="p-name"
                className="field__input"
                placeholder="name"
                spellCheck={false}
                autoComplete="off"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-invalid={newName !== '' && (nameError !== null || refused)}
                aria-describedby="p-name-hint"
              />
              <span id="p-name-hint" className={`field__hint${newName !== '' && (nameError !== null || refused) ? ' field__hint--error' : ''}`}>
                {nameError === 'taken' ? (
                  <>
                    A policy with this name exists. <Link to={`/policies/${newName}`}>Open it</Link>.
                  </>
                ) : newName !== '' && nameError !== null ? (
                  nameError
                ) : refused ? (
                  'This token may not create a policy with this name.'
                ) : (
                  'One segment of A–Z a–z 0–9 . _ -'
                )}
              </span>
            </div>
          )}
          <span className="muted">
            {draft.length} {draft.length === 1 ? 'rule' : 'rules'}
          </span>
        </div>
        <div className="policies-editor__tools">
          <div className="search-field search-field--small">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.5-4.5" />
            </svg>
            <label htmlFor="rule-filter" className="visually-hidden">
              Filter rules
            </label>
            <input id="rule-filter" type="search" placeholder="Filter rules by path" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div role="group" aria-label="View" className="segmented">
            <button type="button" aria-pressed={view === 'rules'} onClick={() => setView('rules')}>
              Rules
            </button>
            <button type="button" aria-pressed={view === 'json'} onClick={() => setView('json')}>
              JSON
            </button>
          </div>
        </div>
      </div>

      {view === 'json' ? (
        <pre className="policies-json" aria-label={`JSON of ${label}`}>
          {JSON.stringify({ rules: draft }, null, 2)}
        </pre>
      ) : (
        <div className="policies-grid-wrap">
          {draft.length === 0 ? (
            <p className="muted policies-editor__message">No rules: this policy grants nothing.</p>
          ) : (
            <div role="table" aria-label={`Rules of ${label}`} className="policies-grid">
              <div role="row" className="policies-grid__row policies-grid__row--head">
                <span role="columnheader" className="policies-grid__path-head">
                  Path
                </span>
                {COLUMNS.map((c) => (
                  <span key={c} role="columnheader" className={c === 'deny' ? 'policies-grid__deny-head' : undefined}>
                    {c}
                  </span>
                ))}
                <span role="columnheader">
                  <span className="visually-hidden">Remove</span>
                </span>
              </div>
              {visible.map(({ rule, row }) => {
                const denies = rule.capabilities.includes('deny')
                const problem = problems[row] ?? null
                return (
                  <div key={row} role="row" className={`policies-grid__row${denies ? ' policies-grid__row--deny' : ''}`}>
                    <span role="cell" className="policies-grid__path">
                      <input
                        type="text"
                        spellCheck={false}
                        value={rule.path}
                        readOnly={!canEdit}
                        aria-label={`Rule ${row + 1} path`}
                        aria-invalid={problem !== null && (rule.path !== '' || rule.capabilities.length > 0)}
                        title={problem ?? undefined}
                        onChange={(e) => update(row, { ...rule, path: e.target.value })}
                      />
                    </span>
                    {COLUMNS.map((c) => (
                      <span key={c} role="cell" className="policies-grid__cell">
                        <Square
                          on={rule.capabilities.includes(c)}
                          deny={c === 'deny'}
                          changed={name !== null && cellChanged(saved, draft, row, c)}
                          disabled={!canEdit}
                          label={`Rule ${row + 1}: ${c}`}
                          onToggle={() => update(row, toggle(rule, c))}
                        />
                      </span>
                    ))}
                    <span role="cell" className="policies-grid__remove">
                      {canEdit && (
                        <button type="button" aria-label={`Remove rule ${row + 1}`} onClick={() => setDraft(draft.filter((_, i) => i !== row))}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M5 7h14" />
                            <path d="M10 7V5h4v2" />
                            <path d="M7 7l1 12h8l1-12" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {canEdit && view === 'rules' && (
        <div className="policies-editor__add">
          <button type="button" className="add-chip" onClick={() => setDraft([...draft, EMPTY_RULE])}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add rule
          </button>
          <span className="field__hint">Click a square to grant or remove. Tinted rows deny, and deny wins.</span>
        </div>
      )}

      {errors.length > 0 && (
        <p className="alert policies-editor__alert" role="alert">
          {messageText(errors)}
        </p>
      )}

      {canEdit && (name === null || dirty) ? (
        <div className="policies-editor__bar policies-editor__bar--dirty">
          <span className="policies-editor__changes">
            {invalid
              ? firstProblem(problems)
              : name === null
                ? 'Not saved yet'
                : `${changes} unsaved ${changes === 1 ? 'change' : 'changes'}, ringed in the table`}
          </span>
          <div className="policies-editor__buttons">
            {name !== null && (
              <button type="button" className="button button--quiet button--lg" disabled={busy} onClick={() => setDraft(saved)}>
                Discard
              </button>
            )}
            <button
              type="button"
              className="button button--primary button--lg"
              disabled={busy || invalid || nameError !== null || refused}
              onClick={() => void save()}
            >
              {name === null ? 'Create policy' : 'Save policy'}
            </button>
          </div>
        </div>
      ) : name !== null ? (
        <div className="policies-editor__bar">
          {confirming ? (
            <>
              <span>Delete {name} for good? Entities and groups that name it keep the name, which then grants nothing.</span>
              <div className="policies-editor__buttons">
                <button type="button" className="button button--quiet button--lg" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep it
                </button>
                <button type="button" className="button button--danger button--lg" disabled={busy} onClick={() => void remove()}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="muted">{canEdit ? 'All changes saved' : 'This token may read this policy, not change it.'}</span>
              {canDelete && (
                <button type="button" className="button button--danger button--lg" onClick={() => setConfirming(true)}>
                  Delete policy
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}

function firstProblem(problems: (string | null)[]): string {
  const row = problems.findIndex((p) => p !== null)
  return `Rule ${row + 1}: ${problems[row]}`
}

interface SquareProps {
  on: boolean
  deny: boolean
  changed: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}

function Square({ on, deny, changed, disabled, label, onToggle }: SquareProps) {
  const tone = on ? (deny ? ' square--deny' : ' square--on') : ''
  return (
    <button
      type="button"
      className={`square${tone}${changed ? ' square--changed' : ''}`}
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  )
}
