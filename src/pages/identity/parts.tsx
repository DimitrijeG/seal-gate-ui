import { useState } from 'react'
import { Link } from 'react-router'
import { canAnythingUnder, capabilities, offers } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { CrossIcon, ShieldIcon } from '../../app/icons'
import { useStore } from '../../lib/store'
import { CopyButton } from '../../ui/CopyButton'
import { type InheritedPolicy, aliasProblem } from './identity'
import { Picker } from './Picker'

// An entity and a group are the same shape on screen: a named thing with an
// ID, a set of policies, and a delete that takes something away from whoever
// holds it. These are the pieces both detail panels are built from.

interface DetailHeadProps {
  // The name as shown: the alias, or "entity 3f9c0a7e" for one without.
  name: string
  // What the rename field starts from; empty when there is no alias.
  alias: string
  id: string
  kind: 'entity' | 'group'
  canRename: boolean
  busy: boolean
  // True once saved, which closes the field.
  onRename: (alias: string) => Promise<boolean>
}

export function DetailHead({ name, alias, id, kind, canRename, busy, onRename }: DetailHeadProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(alias)
  const problem = aliasProblem(draft.trim())

  const start = () => {
    setDraft(alias)
    setEditing(true)
  }

  const submit = async () => {
    if (problem !== null) return
    if (await onRename(draft.trim())) setEditing(false)
  }

  return (
    <div className="identity-detail__head">
      <div className="identity-detail__naming">
        {editing ? (
          <form
            className="identity-rename"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label htmlFor="rename" className="field__label">
              Name
            </label>
            <div className="identity-rename__row">
              <input
                id="rename"
                className="field__input"
                type="text"
                value={draft}
                autoFocus
                disabled={busy}
                aria-invalid={problem !== null}
                aria-describedby={problem === null ? undefined : 'rename-hint'}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className="button button--primary" disabled={busy || problem !== null}>
                Save
              </button>
              <button type="button" className="button button--quiet" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
            <span id="rename-hint" className={`field__hint${problem === null ? '' : ' field__hint--error'}`}>
              {problem ?? `Leaving it empty gives this ${kind} no name, and it shows by ID.`}
            </span>
          </form>
        ) : (
          <>
            <h2 id="identity-detail-h">{name}</h2>
            <div className="identity-detail__id">
              <span className="muted">ID</span>
              <code>{id}</code>
              <CopyButton className="identity-copy" value={id} label="Copy ID" icon />
            </div>
          </>
        )}
      </div>
      {canRename && !editing && (
        <button type="button" className="button button--outline" onClick={start}>
          Rename
        </button>
      )}
    </div>
  )
}

interface PolicyPillsProps {
  heading: string
  // The design's line beside the heading.
  note: string
  // Held directly, and removable.
  policies: string[]
  // Brought by a group, shown dashed. Groups have none of their own.
  inherited?: InheritedPolicy[]
  // Policy names to pick from, less what is held; null when the token may
  // not list them, which offers a typed name instead.
  options: string[] | null
  canChange: boolean
  busy: boolean
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}

export function PolicyPills({
  heading,
  note,
  policies,
  inherited = [],
  options,
  canChange,
  busy,
  onAdd,
  onRemove,
}: PolicyPillsProps) {
  return (
    <div className="identity-section">
      <div className="identity-section__head">
        <h3>{heading}</h3>
        <span className="muted">{note}</span>
      </div>
      <div className="pills">
        {policies.map((name) => (
          <span key={name} className="pill pill--held">
            <ShieldIcon />
            <PolicyName name={name} />
            {canChange && (
              <button
                type="button"
                className="pill__remove"
                aria-label={`Remove policy ${name}`}
                disabled={busy}
                onClick={() => onRemove(name)}
              >
                <CrossIcon size={14} strokeWidth={2.4} />
              </button>
            )}
          </span>
        ))}
        {inherited.map(({ name, from }) => (
          <span key={name} className="pill pill--inherited">
            <ShieldIcon />
            <PolicyName name={name} />
            <span className="muted">from {from.join(', ')}</span>
          </span>
        ))}
        {canChange && (
          <Picker
            label="Add policy"
            options={options}
            typed={{ label: 'Policy name', problem: policyNameProblem }}
            disabled={busy}
            onPick={onAdd}
          />
        )}
      </div>
      {policies.length === 0 && inherited.length === 0 && !canChange && (
        <p className="muted">None.</p>
      )}
    </div>
  )
}

// A policy name links to its rules, but only where the Policies screen is
// offered: a token that may not read any policy would land on a refusal.
function PolicyName({ name }: { name: string }) {
  const caps = useStore(capabilities)
  const readable = offers(canAnythingUnder(caps, resources.policies))
  if (!readable) return <code>{name}</code>
  return (
    <Link className="pill__link" to={`/policies/${name}`}>
      {name}
    </Link>
  )
}

// Why seal-gate would refuse a policy name typed into the picker. Policy
// names allow upper case, unlike aliases and usernames.
function policyNameProblem(name: string): string | null {
  if (name === '') return 'Enter a name.'
  if (new TextEncoder().encode(name).length > 128) return 'At most 128 bytes.'
  if (name === '.' || name === '..') return 'Not . or ..'
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'One segment of A–Z a–z 0–9 . _ -'
  return null
}

interface DangerRowProps {
  // What deleting takes away, as the design words it.
  note: string
  // "Delete entity", "Delete group".
  label: string
  // The name the confirm asks about.
  name: string
  canDelete: boolean
  busy: boolean
  onDelete: () => void
}

export function DangerRow({ note, label, name, canDelete, busy, onDelete }: DangerRowProps) {
  const [confirming, setConfirming] = useState(false)
  if (!canDelete) return null

  return (
    <div className="identity-danger">
      {confirming ? (
        <>
          <span className="identity-danger__ask">Delete {name} for good?</span>
          <div className="identity-danger__buttons">
            <button type="button" className="button button--danger button--lg" disabled={busy} onClick={onDelete}>
              Delete
            </button>
            <button
              type="button"
              className="button button--quiet button--lg"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="muted">{note}</span>
          <button
            type="button"
            className="button button--danger button--lg"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {label}
          </button>
        </>
      )}
    </div>
  )
}
