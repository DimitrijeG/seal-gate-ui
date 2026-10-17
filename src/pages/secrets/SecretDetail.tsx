import { useEffect, useState } from 'react'
import { useCan } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, messageText } from '../../api/result'
import type { components } from '../../api/schema'
import { displayName, identity } from '../../api/session'
import { useStore } from '../../lib/store'
import { formatUtcFull } from '../../lib/time'
import { CopyButton } from '../../ui/CopyButton'
import { HIDDEN } from '../../ui/SecretRow'
import { baseName, decodedLength, formatDuration } from './paths'

type Secret = components['schemas']['SecretReadResponse']

type Detail =
  | { state: 'loading' }
  | { state: 'ok'; secret: Secret }
  | { state: 'gone' }
  | { state: 'forbidden' }
  | { state: 'error'; messages: string[] }

// One secret: its value, kind and timing, and what may be done with it.
// `onGone` leaves it once deleted here, or found missing.
export function SecretDetail({ path, onGone }: { path: string; onGone: () => void }) {
  const who = useStore(identity)
  const canRotate = useCan('rotate', resources.secret(path))
  const canDelete = useCan('delete', resources.secret(path))
  const [detail, setDetail] = useState<Detail>({ state: 'loading' })
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [reads, setReads] = useState(0)

  useEffect(() => {
    let current = true
    void call(api.GET('/secrets/{path}', { params: { path: { path } } })).then((res) => {
      if (!current) return
      if (res.ok) setDetail({ state: 'ok', secret: res.data })
      else if (res.error.kind !== 'http') return // The shell's banner says so.
      else if (res.error.status === 404) setDetail({ state: 'gone' })
      else if (res.error.status === 403) setDetail({ state: 'forbidden' })
      else setDetail({ state: 'error', messages: res.error.messages })
    })
    return () => {
      current = false
    }
  }, [path, reads])

  const folder = path.slice(0, path.length - baseName(path).length)

  const rotate = async () => {
    setBusy(true)
    setErrors([])
    setNotice(null)
    const res = await call(api.POST('/secrets/rotate/{path}', { params: { path: { path } } }))
    setBusy(false)
    if (res.ok) {
      setRevealed(false)
      setReads((n) => n + 1)
    } else if (res.error.kind === 'http') {
      if (res.error.status === 409) {
        // Someone stored a plain value over it since it was read.
        setNotice('Not rotated: this secret was replaced with a stored value.')
        setReads((n) => n + 1)
      } else if (res.error.status === 404) setDetail({ state: 'gone' })
      else setErrors(res.error.messages)
    }
  }

  const remove = async () => {
    setBusy(true)
    setErrors([])
    const res = await call(api.DELETE('/secrets/{path}', { params: { path: { path } } }))
    setBusy(false)
    if (res.ok) onGone()
    else if (res.error.kind === 'http') setErrors(res.error.messages)
  }

  return (
    <section className="secrets-detail" aria-labelledby="detail-h">
      <div className="secrets-detail__head">
        <span className="secrets-detail__folder">{folder}</span>
        <div className="secrets-detail__title">
          <h2 id="detail-h">{baseName(path)}</h2>
          {detail.state === 'ok' && (
            <span className="secrets-detail__badge">
              {detail.secret.generated ? 'Generated' : 'Stored'} · {decodedLength(detail.secret.value)}{' '}
              {decodedLength(detail.secret.value) === 1 ? 'byte' : 'bytes'}
            </span>
          )}
        </div>
      </div>

      {detail.state === 'loading' && <p className="muted">Loading…</p>}

      {detail.state === 'gone' && (
        <div className="secrets-gone">
          <span className="secrets-gone__path">{path}</span>
          <span className="muted">No longer exists. It was deleted or it expired.</span>
          <button type="button" className="button button--quiet" onClick={onGone}>
            Refresh list
          </button>
        </div>
      )}

      {detail.state === 'forbidden' && (
        <div className="secrets-denied">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>{who === null ? 'This token' : displayName(who)} can't read this value.</span>
        </div>
      )}

      {detail.state === 'error' && (
        <p className="alert" role="alert">
          {messageText(detail.messages)}
        </p>
      )}

      {detail.state === 'ok' && (
        <>
          <div className="secrets-value">
            <span className="secrets-value__label">
              Value <span className="muted">(base64)</span>
            </span>
            <code className={`secrets-value__code${revealed ? ' secrets-value__code--shown' : ''}`}>
              {revealed ? detail.secret.value === '' ? '(empty)' : detail.secret.value : HIDDEN}
            </code>
            <div className="secrets-value__actions">
              <button
                type="button"
                className={`secret-row__button${revealed ? ' secret-row__button--on' : ''}`}
                aria-pressed={revealed}
                onClick={() => setRevealed(!revealed)}
              >
                {revealed ? 'Hide' : 'Reveal'}
              </button>
              <CopyButton className="secret-row__button" value={detail.secret.value} label="Copy value" />
            </div>
          </div>

          <Timing secret={detail.secret} />

          {notice !== null && (
            <p className="secrets-toast" role="status">
              {notice}
            </p>
          )}
          {errors.length > 0 && (
            <p className="alert" role="alert">
              {messageText(errors)}
            </p>
          )}

          {(canRotate && detail.secret.generated) || canDelete ? (
            <div className="secrets-actions">
              {confirming ? (
                <>
                  <span className="secrets-actions__ask">Delete {baseName(path)} for good?</span>
                  <button type="button" className="button button--danger button--lg" disabled={busy} onClick={() => void remove()}>
                    Delete
                  </button>
                  <button type="button" className="button button--quiet button--lg" disabled={busy} onClick={() => setConfirming(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <>
                  {canRotate && detail.secret.generated && (
                    <button type="button" className="button button--primary button--lg" disabled={busy} onClick={() => void rotate()}>
                      Rotate now
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" className="button button--danger button--lg" disabled={busy} onClick={() => setConfirming(true)}>
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function Timing({ secret }: { secret: Secret }) {
  const when = secret.expires_at === undefined ? 'never' : formatUtcFull(secret.expires_at)
  const period = secret.ttl === undefined ? 'none' : formatDuration(secret.ttl)
  return (
    <dl className="secrets-timing">
      <div>
        <dt>{secret.generated ? 'Rotation due' : 'Expires'}</dt>
        <dd>{when}</dd>
      </div>
      <div>
        <dt>{secret.generated ? 'Rotation period' : 'Lifetime'}</dt>
        <dd>{period}</dd>
      </div>
    </dl>
  )
}
