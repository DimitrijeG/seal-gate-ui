import { useEffect, useState } from 'react'
import { can, capabilities, forgetCapabilities, offers, useCan } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, isServerFault, messageText } from '../../api/result'
import type { components } from '../../api/schema'
import { displayName, identity } from '../../api/session'
import { CrossIcon, GroupIcon, LockIcon } from '../../app/icons'
import { useStore } from '../../lib/store'
import { formatUtc } from '../../lib/time'
import { SecretRow } from '../../ui/SecretRow'
import { ServerFault } from '../../ui/ServerFault'
import {
  type TtlUnit,
  TTL_PRESETS,
  customTtl,
  groupPills,
  idProblem,
  inheritedPolicies,
  label as nameOf,
  shortId,
} from './identity'
import { items, useLists } from './lists'
import { DangerRow, DetailHead, PolicyPills } from './parts'
import { Picker } from './Picker'

type Entity = components['schemas']['EntityResponse']

type Detail =
  | { state: 'loading' }
  | { state: 'ok'; entity: Entity }
  | { state: 'gone' }
  | { state: 'forbidden' }
  | { state: 'fault' }
  | { state: 'error'; messages: string[] }

interface EntityDetailProps {
  id: string
  // Deleted here, or found missing.
  onGone: () => void
  // Renamed: the list shows names, so it is read again.
  onRenamed: () => void
}

// One entity: the groups and policies it holds, the tokens it can be issued,
// and what may be done with it.
export function EntityDetail({ id, onGone, onRenamed }: EntityDetailProps) {
  const caps = useStore(capabilities)
  const who = useStore(identity)
  const lists = useLists()
  const canChange = useCan('update', resources.entity(id))
  const canDelete = useCan('delete', resources.entity(id))
  const canIssue = useCan('create', resources.entityTokens(id))

  const [detail, setDetail] = useState<Detail>({ state: 'loading' })
  const [reads, setReads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let current = true
    void call(api.GET('/entities/{id}', { params: { path: { id } } })).then((res) => {
      if (!current) return
      if (res.ok) setDetail({ state: 'ok', entity: res.data })
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

  // What each of the entity's groups brings, read one by one: the design
  // shows a group's policies on the entity as well, dashed.
  const groupIds = detail.state === 'ok' ? detail.entity.groups : []
  const groupKey = groupIds.join(',')
  // Kept with the groups it was read for, so an answer for another set is
  // never shown as this one's. It is partial when a group's policies could
  // not be read, and then the dashed pills are not the whole picture.
  const [brought, setBrought] = useState<{ key: string; byId: Map<string, string[]>; partial: boolean }>({
    key: '',
    byId: new Map(),
    partial: false,
  })

  useEffect(() => {
    if (groupKey === '') return
    let current = true
    void (async () => {
      const found = new Map<string, string[]>()
      let missed = false
      for (const gid of groupKey.split(',')) {
        if (!offers(can(caps, 'read', resources.group(gid)))) {
          missed = true
          continue
        }
        const res = await call(api.GET('/groups/{id}', { params: { path: { id: gid } } }))
        if (!current) return
        // A deleted group grants nothing, and shows as deleted already.
        if (res.ok) found.set(gid, res.data.policies)
        else if (!(res.error.kind === 'http' && res.error.status === 404)) missed = true
      }
      if (!current) return
      setBrought({ key: groupKey, byId: found, partial: missed })
    })()
    return () => {
      current = false
    }
  }, [groupKey, caps])

  // Replacing an entity replaces all of it, so every save sends the whole
  // thing with one part changed.
  const save = async (change: Partial<components['schemas']['EntityRequest']>): Promise<boolean> => {
    if (detail.state !== 'ok') return false
    const { alias, policies, groups } = detail.entity
    setBusy(true)
    setErrors([])
    const res = await call(
      api.PUT('/entities/{id}', { params: { path: { id } }, body: { alias, policies, groups, ...change } }),
    )
    setBusy(false)
    if (res.ok) {
      // This may be the session's own entity: what it may do can differ now.
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
    const res = await call(api.DELETE('/entities/{id}', { params: { path: { id } } }))
    setBusy(false)
    if (res.ok) {
      forgetCapabilities()
      onGone()
    } else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  if (detail.state === 'loading') {
    return (
      <section className="identity-detail" aria-label="Entity">
        <p className="muted">Loading…</p>
      </section>
    )
  }

  if (detail.state === 'gone') {
    return (
      <section className="identity-detail" aria-label="Entity">
        <div className="gone">
          <span className="gone__name">entity {shortId(id)}</span>
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
      <section className="identity-detail" aria-label="Entity">
        <div className="denied">
          <LockIcon />
          <span>{who === null ? 'This token' : displayName(who)} can't read this entity.</span>
        </div>
      </section>
    )
  }

  if (detail.state === 'fault') {
    return (
      <section className="identity-detail" aria-label="Entity">
        <ServerFault onRetry={() => setReads((n) => n + 1)} />
      </section>
    )
  }

  if (detail.state === 'error') {
    return (
      <section className="identity-detail" aria-label="Entity">
        <p className="alert" role="alert">
          {messageText(detail.messages)}
        </p>
      </section>
    )
  }

  const { entity } = detail
  const allGroups = items(lists.groups)
  const pills = groupPills(entity.groups, allGroups)
  // Null while the groups on screen are not the ones the policies were read
  // for, so a stale set is never shown as theirs.
  const read = brought.key === groupKey ? brought : null
  const inherited = inheritedPolicies(
    entity.policies,
    pills.filter((p) => !p.deleted).map((p) => ({ group: p.name, policies: read?.byId.get(p.id) ?? [] })),
  )
  // Groups it is not in yet, by name; null when they cannot be listed.
  const joinable =
    allGroups === null
      ? null
      : allGroups
          .filter((g) => !entity.groups.includes(g.id))
          .map((g) => nameOf(g, 'group'))
          .sort((a, b) => a.localeCompare(b))
  const byName = new Map((allGroups ?? []).map((g) => [nameOf(g, 'group'), g.id]))
  const policyOptions = items(lists.policies)?.filter((n) => !entity.policies.includes(n)) ?? null

  return (
    <section className="identity-detail" aria-labelledby="identity-detail-h">
      <DetailHead
        name={nameOf({ id, alias: entity.alias }, 'entity')}
        alias={entity.alias ?? ''}
        id={id}
        kind="entity"
        canRename={canChange}
        busy={busy}
        onRename={async (alias) => {
          const saved = await save({ alias })
          if (saved) onRenamed()
          return saved
        }}
      />

      <div className="identity-section">
        <div className="identity-section__head">
          <h3>Groups</h3>
          <span className="muted">Start here: a group brings its policies with it.</span>
        </div>
        <div className="pills">
          {pills.map((pill) => (
            <span key={pill.id} className={`pill ${pill.deleted ? 'pill--gone' : 'pill--held'}`}>
              <GroupIcon />
              {pill.name}
              {canChange && (
                <button
                  type="button"
                  className="pill__remove"
                  aria-label={`Leave group ${pill.name}`}
                  disabled={busy}
                  onClick={() => void save({ groups: entity.groups.filter((g) => g !== pill.id) })}
                >
                  <CrossIcon size={14} strokeWidth={2.4} />
                </button>
              )}
            </span>
          ))}
          {canChange && (
            <Picker
              label="Add group"
              options={joinable}
              typed={{ label: 'Group ID', problem: idProblem }}
              disabled={busy}
              onPick={(picked) => {
                const gid = byName.get(picked) ?? picked
                if (entity.groups.includes(gid)) return
                void save({ groups: [...entity.groups, gid] })
              }}
            />
          )}
          {pills.length === 0 && !canChange && <p className="muted">None.</p>}
        </div>
      </div>

      <PolicyPills
        heading="Policies"
        note={
          read?.partial === true
            ? 'Dashed ones come from a group. Some groups could not be read, so there may be more.'
            : 'Dashed ones come from a group and change with it.'
        }
        policies={entity.policies}
        inherited={inherited}
        options={policyOptions}
        canChange={canChange}
        busy={busy}
        onAdd={(name) => {
          if (!entity.policies.includes(name)) void save({ policies: [...entity.policies, name] })
        }}
        onRemove={(name) => void save({ policies: entity.policies.filter((p) => p !== name) })}
      />

      {canIssue && <IssueToken id={id} busy={busy} />}

      {errors.length > 0 && (
        <p className="alert" role="alert">
          {messageText(errors)}
        </p>
      )}

      <DangerRow
        note="Deleting this entity revokes every token issued to it."
        label="Delete entity"
        name={nameOf({ id, alias: entity.alias }, 'entity')}
        canDelete={canDelete}
        busy={busy}
        onDelete={() => void remove()}
      />
    </section>
  )
}


// The design's "Issue a token": a lifetime, and the token itself once, since
// the server keeps only its hash. It lives in this component's state alone.
function IssueToken({ id, busy }: { id: string; busy: boolean }) {
  const [choice, setChoice] = useState<string>(TTL_PRESETS[0]!.label)
  const [amount, setAmount] = useState('90')
  const [unit, setUnit] = useState<TtlUnit>('minutes')
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState<components['schemas']['CreateTokenResponse'] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  // Errors.dc's "invalid TTL": the server's maximum is configuration no API
  // reports, and its answer is only "invalid TTL", so the console learns the
  // limit exists from the refusal and says so on the lifetime itself.
  const [refused, setRefused] = useState(false)

  const custom = choice === 'Custom'
  const asked = custom ? customTtl(amount, unit) : { seconds: TTL_PRESETS.find((p) => p.label === choice)!.seconds }
  const problem = 'problem' in asked ? asked.problem : null
  const tooLong = refused ? 'Longer than this server allows. Try 1 day or less.' : null

  const issue = async () => {
    if ('problem' in asked) return
    setIssuing(true)
    setErrors([])
    setIssued(null)
    setRevealed(false)
    setRefused(false)
    const res = await call(api.POST('/entities/{id}/tokens', { params: { path: { id } }, body: { ttl: asked.seconds } }))
    setIssuing(false)
    if (res.ok) setIssued(res.data)
    else if (res.error.kind !== 'http') return // The shell's banner says so.
    // The only thing sent is the lifetime, so a 400 is about the lifetime.
    else if (res.error.status === 400) setRefused(true)
    else setErrors(res.error.messages)
  }

  return (
    <div className="identity-issue">
      <h3>Issue a token</h3>

      <div className="identity-issue__row">
        <span id="ttl-label" className="identity-issue__label">
          Valid for
        </span>
        <div className="segmented" role="group" aria-labelledby="ttl-label">
          {[...TTL_PRESETS.map((p) => p.label), 'Custom'].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={choice === option}
              disabled={issuing}
              onClick={() => {
                setRefused(false)
                setChoice(option)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="identity-issue__row">
        {custom && (
          <>
            <label htmlFor="ttl-amount" className="visually-hidden">
              Custom lifetime
            </label>
            <input
              id="ttl-amount"
              className="identity-issue__amount"
              type="number"
              min="1"
              value={amount}
              aria-invalid={problem !== null || refused}
              aria-describedby={problem ?? tooLong ? 'ttl-hint' : undefined}
              onChange={(e) => {
                setRefused(false)
                setAmount(e.target.value)
              }}
            />
            <div className="segmented" role="group" aria-label="Unit">
              {(['minutes', 'hours'] as TtlUnit[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={unit === option}
                  onClick={() => {
                    setRefused(false)
                    setUnit(option)
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          type="button"
          className="button button--primary button--lg"
          disabled={busy || issuing || problem !== null}
          onClick={() => void issue()}
        >
          Issue token
        </button>
      </div>

      {(problem ?? tooLong) !== null && (
        <span id="ttl-hint" className="field__hint field__hint--error">
          {problem ?? tooLong}
        </span>
      )}
      <span className="muted">
        Tokens always expire. The server refuses a lifetime above its maximum, a day unless configured otherwise.
      </span>

      {errors.length > 0 && (
        <p className="alert" role="alert">
          {messageText(errors)}
        </p>
      )}

      {issued !== null && (
        <>
          <SecretRow label="token" value={issued.token} revealed={revealed} onToggle={() => setRevealed(!revealed)} />
          <span className="muted">Shown once · expires {formatUtc(issued.expires_at)}</span>
        </>
      )}
    </div>
  )
}
