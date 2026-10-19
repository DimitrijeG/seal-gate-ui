import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { can, canAnythingUnder, capabilities, offers } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, messageText } from '../../api/result'
import { PersonIcon, SearchIcon, TrashIcon } from '../../app/icons'
import { useStore } from '../../lib/store'
import { Select } from '../../ui/Select'
import { ServerFault } from '../../ui/ServerFault'
import {
  type Summary,
  type UserSummary,
  idProblem,
  label as nameOf,
  passwordProblem,
  userMatches,
  usernameProblem,
} from './identity'
import { PAGE } from './FindList'
import { items, useLists } from './lists'

export function UsernamesTab() {
  const caps = useStore(capabilities)
  const { users, entities, reloadUsers } = useLists()
  const all = items(users)
  const known = items(entities)
  // A username is created by storing it, which needs `update` on its name.
  const canCreate = offers(canAnythingUnder(caps, `${resources.users}/`, 'update'))

  const [find, setFind] = useState('')
  const [page, setPage] = useState(0)
  const [pageKey, setPageKey] = useState(find)
  if (pageKey !== find) {
    setPageKey(find)
    setPage(0)
  }

  // The entity a username signs in as, named from the entity list. A token
  // that may not list entities sees the ID it was given.
  const entityName = (id: string): string => {
    const found = known?.find((e) => e.id === id)
    return found === undefined ? `entity ${id.slice(0, 8)}` : nameOf(found, 'entity')
  }

  const shown = all?.filter((user) => userMatches(user, entityName(user.entity_id), find)) ?? []
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const onPage = shown.slice(page * PAGE, (page + 1) * PAGE)

  return (
    <div className="identity-body identity-body--users">
      <section className="identity-users" aria-label="Usernames">
        <div className="identity-users__tools">
          <div className="search-field">
            <SearchIcon size={18} />
            <label htmlFor="find" className="visually-hidden">
              Find username
            </label>
            <input
              id="find"
              type="search"
              placeholder={all === null ? 'Username or entity' : `Find among ${all.length}`}
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </div>
        </div>

        {users.state === 'denied' ? (
          <p className="muted identity-list__message">This token may not list usernames.</p>
        ) : users.state === 'fault' ? (
          <ServerFault className="identity-list__message" onRetry={reloadUsers} />
        ) : users.state === 'error' ? (
          <p className="alert identity-list__message" role="alert">
            {messageText(users.messages)}
          </p>
        ) : all === null ? (
          <p className="muted identity-list__message">Loading…</p>
        ) : onPage.length === 0 ? (
          <p className="muted identity-list__message">
            {all.length === 0 ? 'No usernames yet.' : `No username matches “${find.trim()}”.`}
          </p>
        ) : (
          <>
            <div className="identity-users__header" aria-hidden="true">
              <span>Username</span>
              <span>Signs in as</span>
              <span />
            </div>
            <ul className="identity-users__rows" aria-label="Stored usernames">
              {onPage.map((user) => (
                <UserRow key={user.name} user={user} entityName={entityName(user.entity_id)} onChanged={reloadUsers} />
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

      {canCreate && <NewUsername entities={known} existing={all} onCreated={reloadUsers} />}
    </div>
  )
}

interface UserRowProps {
  user: UserSummary
  entityName: string
  onChanged: () => void
}

function UserRow({ user, entityName, onChanged }: UserRowProps) {
  const caps = useStore(capabilities)
  const canChange = offers(can(caps, 'update', resources.user(user.name)))
  const canDelete = offers(can(caps, 'delete', resources.user(user.name)))
  // The entity page is only worth linking to where it can be read.
  const linkable = offers(canAnythingUnder(caps, resources.entities))

  const [changing, setChanging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const problem = passwordProblem(password)

  // Says so for a few seconds; the row does not remount when the list is
  // read again, so it would otherwise stand there for good.
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  const close = () => {
    setChanging(false)
    setPassword('')
    setErrors([])
  }

  const change = async () => {
    if (problem !== null) return
    setBusy(true)
    setErrors([])
    const res = await call(
      api.PUT('/auth/users/{name}', {
        params: { path: { name: user.name } },
        // Storing a user replaces all of it, so the entity goes back as is.
        body: { entity_id: user.entity_id, password },
      }),
    )
    setBusy(false)
    if (res.ok) {
      close()
      setDone(true)
      onChanged()
    } else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  const remove = async () => {
    setBusy(true)
    setErrors([])
    const res = await call(api.DELETE('/auth/users/{name}', { params: { path: { name: user.name } } }))
    setBusy(false)
    if (res.ok) onChanged()
    else if (res.error.kind === 'http') {
      setConfirming(false)
      setErrors(res.error.messages)
    }
  }

  return (
    <li className="identity-users__row">
      <code className="identity-users__name">{user.name}</code>
      <span className="identity-users__entity">
        {linkable ? <Link to={`/identity/entities/${user.entity_id}`}>{entityName}</Link> : entityName}
      </span>
      <span className="identity-users__actions">
        {confirming ? (
          <>
            <span className="muted">Remove {user.name}?</span>
            <button type="button" className="button button--danger" disabled={busy} onClick={() => void remove()}>
              Remove
            </button>
            <button type="button" className="button button--quiet" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </>
        ) : (
          <>
            {done && <span className="muted">Password changed</span>}
            {canChange && !changing && (
              <button type="button" className="button button--outline" onClick={() => setChanging(true)}>
                Change password
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="button button--danger button--icon"
                aria-label={`Remove username ${user.name}`}
                onClick={() => setConfirming(true)}
              >
                <TrashIcon />
              </button>
            )}
          </>
        )}
      </span>

      {changing && (
        <form
          className="identity-users__change"
          onSubmit={(e) => {
            e.preventDefault()
            void change()
          }}
        >
          <label htmlFor={`pw-${user.name}`} className="field__label">
            New password for {user.name}
          </label>
          <div className="identity-users__change-row">
            <input
              id={`pw-${user.name}`}
              className="field__input"
              type="password"
              value={password}
              autoFocus
              disabled={busy}
              aria-invalid={password !== '' && problem !== null}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="button button--primary" disabled={busy || problem !== null}>
              Save
            </button>
            <button type="button" className="button button--quiet" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
          {password !== '' && problem !== null && <span className="field__hint field__hint--error">{problem}</span>}
        </form>
      )}

      {errors.length > 0 && (
        <p className="alert identity-users__error" role="alert">
          {messageText(errors)}
        </p>
      )}
    </li>
  )
}

interface NewUsernameProps {
  // Entities to sign in as; null when the token may not list them, which
  // takes an ID instead.
  entities: Summary[] | null
  existing: UserSummary[] | null
  onCreated: () => void
}

function NewUsername({ entities, existing, onCreated }: NewUsernameProps) {
  const [name, setName] = useState('')
  const [entityId, setEntityId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [made, setMade] = useState<string | null>(null)

  // By name, so the one selected by default is the one shown first. The API
  // sorts entities by ID, which is random.
  const byName =
    entities === null
      ? null
      : entities.slice().sort((a, b) => nameOf(a, 'entity').localeCompare(nameOf(b, 'entity')))
  const chosen = byName === null ? entityId.trim() : entityId === '' ? (byName[0]?.id ?? '') : entityId
  const nameTrouble = usernameProblem(name.trim())
  const entityTrouble = byName === null ? idProblem(chosen) : chosen === '' ? 'No entity to sign in as.' : null
  const passwordTrouble = passwordProblem(password)
  const replaces = existing?.find((u) => u.name === name.trim())

  const create = async () => {
    if (nameTrouble !== null || entityTrouble !== null || passwordTrouble !== null) return
    setBusy(true)
    setErrors([])
    setMade(null)
    const res = await call(
      api.PUT('/auth/users/{name}', {
        params: { path: { name: name.trim() } },
        body: { entity_id: chosen, password },
      }),
    )
    setBusy(false)
    if (res.ok) {
      setMade(name.trim())
      setName('')
      setPassword('')
      onCreated()
    } else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  return (
    <section className="identity-detail" aria-labelledby="new-user-h">
      <h2 id="new-user-h">New username</h2>
      <form
        className="identity-new"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="u-name">
            Username
          </label>
          <input
            id="u-name"
            className="field__input identity-new__mono"
            type="text"
            value={name}
            disabled={busy}
            aria-invalid={name !== '' && nameTrouble !== null}
            aria-describedby="u-name-hint"
            onChange={(e) => setName(e.target.value)}
          />
          <span
            id="u-name-hint"
            className={`field__hint${name !== '' && nameTrouble !== null ? ' field__hint--error' : ''}`}
          >
            {(name !== '' ? nameTrouble : null) ??
              (replaces === undefined ? 'Lowercase a–z 0–9 . _ -' : `Replaces ${replaces.name}'s password and entity.`)}
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="u-entity">
            Signs in as
          </label>
          {byName === null ? (
            <input
              id="u-entity"
              className="field__input identity-new__mono"
              type="text"
              value={entityId}
              disabled={busy}
              aria-invalid={entityId !== '' && entityTrouble !== null}
              onChange={(e) => setEntityId(e.target.value)}
            />
          ) : (
            <Select
              id="u-entity"
              className="identity-new__select"
              icon={<PersonIcon />}
              value={chosen}
              disabled={busy || byName.length === 0}
              options={
                byName.length === 0
                  ? [{ value: '', label: 'No entities yet' }]
                  : byName.map((entity) => ({ value: entity.id, label: nameOf(entity, 'entity') }))
              }
              onChange={setEntityId}
            />
          )}
          <span
            className={`field__hint${entityId !== '' && entityTrouble !== null ? ' field__hint--error' : ''}`}
          >
            {(entityId !== '' ? entityTrouble : null) ?? 'The entity decides what this person can do.'}
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="u-password">
            Password
          </label>
          <input
            id="u-password"
            className="field__input"
            type="password"
            value={password}
            disabled={busy}
            aria-invalid={password !== '' && passwordTrouble !== null}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password !== '' && passwordTrouble !== null && (
            <span className="field__hint field__hint--error">{passwordTrouble}</span>
          )}
        </div>

        {errors.length > 0 && (
          <p className="alert" role="alert">
            {messageText(errors)}
          </p>
        )}
        {made !== null && (
          <p className="notice notice--done" role="status">
            {made} can sign in now.
          </p>
        )}

        <button
          type="submit"
          className="button button--primary button--lg"
          disabled={busy || nameTrouble !== null || entityTrouble !== null || passwordTrouble !== null}
        >
          Create username
        </button>
        <p className="muted">Saving a username that exists replaces its password and entity.</p>
      </form>
    </section>
  )
}
