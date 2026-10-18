import { useEffect, useState } from 'react'
import { forgetCapabilities, useCan } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, isServerFault, messageText } from '../../api/result'
import type { components } from '../../api/schema'
import { displayName, identity } from '../../api/session'
import { LockIcon } from '../../app/icons'
import { useStore } from '../../lib/store'
import { ServerFault } from '../../ui/ServerFault'
import { label as nameOf, shortId } from './identity'
import { items, useLists } from './lists'
import { DangerRow, DetailHead, PolicyPills } from './parts'

type Group = components['schemas']['GroupResponse']

type Detail =
  | { state: 'loading' }
  | { state: 'ok'; group: Group }
  | { state: 'gone' }
  | { state: 'forbidden' }
  | { state: 'fault' }
  | { state: 'error'; messages: string[] }

interface GroupDetailProps {
  id: string
  onGone: () => void
  onRenamed: () => void
}

// One group: the policies it brings to every entity in it.
export function GroupDetail({ id, onGone, onRenamed }: GroupDetailProps) {
  const who = useStore(identity)
  const lists = useLists()
  const canChange = useCan('update', resources.group(id))
  const canDelete = useCan('delete', resources.group(id))

  const [detail, setDetail] = useState<Detail>({ state: 'loading' })
  const [reads, setReads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let current = true
    void call(api.GET('/groups/{id}', { params: { path: { id } } })).then((res) => {
      if (!current) return
      if (res.ok) setDetail({ state: 'ok', group: res.data })
      else if (res.error.kind !== 'http') return // The shell's banner says so.
      else if (res.error.status === 404) setDetail({ state: 'gone' })
      else if (res.error.status === 403) setDetail({ state: 'forbidden' })
      else if (isServerFault(res.error)) setDetail({ state: 'fault' })
      else setDetail({ state: 'error', messages: res.error.messages })
    })
    return () => {
      current = false
    }
  }, [id, reads])

  // Replacing a group replaces all of it, so every save sends the whole
  // thing with one part changed.
  const save = async (change: Partial<components['schemas']['GroupRequest']>): Promise<boolean> => {
    if (detail.state !== 'ok') return false
    const { alias, policies } = detail.group
    setBusy(true)
    setErrors([])
    const res = await call(api.PUT('/groups/{id}', { params: { path: { id } }, body: { alias, policies, ...change } }))
    setBusy(false)
    if (res.ok) {
      // The session's entity may be in this group.
      forgetCapabilities()
      setReads((n) => n + 1)
      return true
    }
    if (res.error.kind === 'http') {
      if (res.error.status === 404) setDetail({ state: 'gone' })
      else setErrors(res.error.messages)
    }
    return false
  }

  const remove = async () => {
    setBusy(true)
    setErrors([])
    const res = await call(api.DELETE('/groups/{id}', { params: { path: { id } } }))
    setBusy(false)
    if (res.ok) {
      forgetCapabilities()
      onGone()
    } else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  if (detail.state === 'loading') {
    return (
      <section className="identity-detail" aria-label="Group">
        <p className="muted">Loading…</p>
      </section>
    )
  }

  if (detail.state === 'gone') {
    return (
      <section className="identity-detail" aria-label="Group">
        <div className="gone">
          <span className="gone__name">group {shortId(id)}</span>
          <span className="muted">No longer exists. It was deleted.</span>
          <button type="button" className="button button--quiet" onClick={onGone}>
            Refresh list
          </button>
        </div>
      </section>
    )
  }

  if (detail.state === 'forbidden') {
    return (
      <section className="identity-detail" aria-label="Group">
        <div className="denied">
          <LockIcon />
          <span>{who === null ? 'This token' : displayName(who)} can't read this group.</span>
        </div>
      </section>
    )
  }

  if (detail.state === 'fault') {
    return (
      <section className="identity-detail" aria-label="Group">
        <ServerFault onRetry={() => setReads((n) => n + 1)} />
      </section>
    )
  }

  if (detail.state === 'error') {
    return (
      <section className="identity-detail" aria-label="Group">
        <p className="alert" role="alert">
          {messageText(detail.messages)}
        </p>
      </section>
    )
  }

  const { group } = detail
  const name = nameOf({ id, alias: group.alias }, 'group')
  const policyOptions = items(lists.policies)?.filter((n) => !group.policies.includes(n)) ?? null

  return (
    <section className="identity-detail" aria-labelledby="identity-detail-h">
      <DetailHead
        name={name}
        alias={group.alias ?? ''}
        id={id}
        kind="group"
        canRename={canChange}
        busy={busy}
        onRename={async (alias) => {
          const saved = await save({ alias })
          if (saved) onRenamed()
          return saved
        }}
      />

      <PolicyPills
        heading="Policies it brings"
        note="Every entity in the group gets these."
        policies={group.policies}
        options={policyOptions}
        canChange={canChange}
        busy={busy}
        onAdd={(policy) => {
          if (!group.policies.includes(policy)) void save({ policies: [...group.policies, policy] })
        }}
        onRemove={(policy) => void save({ policies: group.policies.filter((p) => p !== policy) })}
      />

      <p className="identity-note">
        Entities join a group from their own page, under Groups. Membership is stored on the entity, not here.
      </p>

      {errors.length > 0 && (
        <p className="alert" role="alert">
          {messageText(errors)}
        </p>
      )}

      <DangerRow
        note="Entities in this group lose the policies it brings."
        label="Delete group"
        name={name}
        canDelete={canDelete}
        busy={busy}
        onDelete={() => void remove()}
      />
    </section>
  )
}
