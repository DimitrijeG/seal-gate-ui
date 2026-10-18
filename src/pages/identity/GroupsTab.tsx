import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCan } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, messageText } from '../../api/result'
import { FindList } from './FindList'
import { GroupDetail } from './GroupDetail'
import { aliasProblem, label as nameOf } from './identity'
import { useLists } from './lists'

export function GroupsTab() {
  const id = useParams().id ?? null
  const [search, setSearch] = useSearchParams()
  const creating = search.get('new') !== null
  const navigate = useNavigate()
  const { groups, reloadGroups } = useLists()
  const canCreate = useCan('create', resources.groups)

  return (
    <div className="identity-body">
      <FindList
        kind="group"
        listing={groups}
        selected={creating ? null : id}
        canCreate={canCreate}
        onNew={() => setSearch({ new: '' })}
        href={(summary) => `/identity/groups/${summary.id}`}
        name={(summary) => nameOf(summary, 'group')}
        onRetry={reloadGroups}
      />

      {creating ? (
        <NewGroup
          onCancel={() => setSearch({})}
          onCreated={(created) => {
            reloadGroups()
            void navigate(`/identity/groups/${created}`)
          }}
        />
      ) : id !== null ? (
        <GroupDetail
          key={id}
          id={id}
          onRenamed={reloadGroups}
          onGone={() => {
            reloadGroups()
            void navigate('/identity/groups')
          }}
        />
      ) : (
        <section className="identity-detail identity-detail--empty" aria-label="Group">
          <p className="muted">Pick a group to see the policies it brings.</p>
        </section>
      )}
    </div>
  )
}

function NewGroup({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [alias, setAlias] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const problem = aliasProblem(alias.trim())

  const create = async () => {
    if (problem !== null) return
    setBusy(true)
    setErrors([])
    const res = await call(api.POST('/groups', { body: { alias: alias.trim() } }))
    setBusy(false)
    if (res.ok) onCreated(res.data.id)
    else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  return (
    <section className="identity-detail" aria-labelledby="new-group-h">
      <h2 id="new-group-h">New group</h2>
      <p className="muted">Give it policies once it exists, then entities join it from their own page.</p>
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
            {problem ?? 'Optional, and unique across groups. Without one it shows by ID.'}
          </span>
        </div>
        {errors.length > 0 && (
          <p className="alert" role="alert">
            {messageText(errors)}
          </p>
        )}
        <div className="identity-new__buttons">
          <button type="submit" className="button button--primary button--lg" disabled={busy || problem !== null}>
            Create group
          </button>
          <button type="button" className="button button--quiet button--lg" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
