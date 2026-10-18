import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useCan } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, messageText } from '../../api/result'
import { identity } from '../../api/session'
import { useStore } from '../../lib/store'
import { EntityDetail } from './EntityDetail'
import { aliasProblem, label as nameOf } from './identity'
import { FindList } from './FindList'
import { useLists } from './lists'

export function EntitiesTab() {
  const id = useParams().id ?? null
  const [search, setSearch] = useSearchParams()
  const creating = search.get('new') !== null
  const navigate = useNavigate()
  const { entities, reloadEntities } = useLists()
  const canCreate = useCan('create', resources.entities)

  return (
    <div className="identity-body">
      <FindList
        kind="entity"
        listing={entities}
        selected={creating ? null : id}
        canCreate={canCreate}
        onNew={() => setSearch({ new: '' })}
        href={(summary) => `/identity/entities/${summary.id}`}
        name={(summary) => nameOf(summary, 'entity')}
        denied={<OwnEntity />}
        onRetry={reloadEntities}
      />

      {creating ? (
        <NewEntity
          onCancel={() => setSearch({})}
          onCreated={(created) => {
            reloadEntities()
            void navigate(`/identity/entities/${created}`)
          }}
        />
      ) : id !== null ? (
        <EntityDetail
          key={id}
          id={id}
          onRenamed={reloadEntities}
          onGone={() => {
            reloadEntities()
            void navigate('/identity/entities')
          }}
        />
      ) : (
        <section className="identity-detail identity-detail--empty" aria-label="Entity">
          <p className="muted">Pick an entity to see its groups and policies.</p>
        </section>
      )}
    </div>
  )
}

// A token that may not list entities can still read its own, which is where
// its own access comes from. Not in design/.
function OwnEntity() {
  const who = useStore(identity)
  const canRead = useCan('read', who === null || who.root ? resources.entities : resources.entity(who.entityId))
  if (who === null || who.root || !canRead) return null
  return (
    <p className="muted identity-list__message">
      <Link to={`/identity/entities/${who.entityId}`}>Open your own entity</Link> to see where your access comes from.
    </p>
  )
}

function NewEntity({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [alias, setAlias] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const problem = aliasProblem(alias.trim())

  const create = async () => {
    if (problem !== null) return
    setBusy(true)
    setErrors([])
    const res = await call(api.POST('/entities', { body: { alias: alias.trim() } }))
    setBusy(false)
    if (res.ok) onCreated(res.data.id)
    else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  return (
    <section className="identity-detail" aria-labelledby="new-entity-h">
      <h2 id="new-entity-h">New entity</h2>
      <p className="muted">
        The server chooses its ID and never reuses one. Give it groups, policies and tokens once it exists.
      </p>
      <form
        className="identity-new"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="new-alias">
            Name
          </label>
          <input
            id="new-alias"
            className="field__input"
            type="text"
            value={alias}
            autoFocus
            disabled={busy}
            aria-invalid={problem !== null}
            aria-describedby="new-alias-hint"
            onChange={(e) => setAlias(e.target.value)}
          />
          <span id="new-alias-hint" className={`field__hint${problem === null ? '' : ' field__hint--error'}`}>
            {problem ?? 'Optional, and unique across entities. Without one it shows by ID.'}
          </span>
        </div>
        {errors.length > 0 && (
          <p className="alert" role="alert">
            {messageText(errors)}
          </p>
        )}
        <div className="identity-new__buttons">
          <button type="submit" className="button button--primary button--lg" disabled={busy || problem !== null}>
            Create entity
          </button>
          <button type="button" className="button button--quiet button--lg" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

