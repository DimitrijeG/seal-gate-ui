import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { type Status, api, applyStatus, refreshStatus, server } from '../../api/client'
import { call } from '../../api/result'
import { token } from '../../api/session'
import { isBase64 } from '../../lib/base64'
import { useStore } from '../../lib/store'
import { MAX_SEGMENTS, secondsAgo, unsealProgress } from './progress'
import './UnsealPage.css'

export function UnsealPage() {
  const srv = useStore(server)
  const status = srv.state === 'loading' ? null : srv.status
  if (status === null) return null
  if (!status.initialized) return <Navigate to="/init" replace />

  return (
    <>
      <div className="page-head">
        <h1>Unseal</h1>
        <p>
          The master key was split into {status.shares} shares. Any {status.threshold} key holders, each entering
          their own share from their own machine, rebuild it.
        </p>
      </div>
      <UnsealCard status={status} at={srv.state === 'up' ? srv.at : null} />
    </>
  )
}

function UnsealCard({ status, at }: { status: Status; at: number | null }) {
  const signedIn = useStore(token) !== null
  const [share, setShare] = useState('')
  const [sending, setSending] = useState(false)
  // The last outcome worth saying in place; cleared by the next action.
  const [outcome, setOutcome] = useState<'failed' | 'not-needed' | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const progress = unsealProgress(status)
  const shareInvalid = share.trim() !== '' && !isBase64(share)

  const send = async (body: { share: string } | { reset: true }) => {
    setSending(true)
    setOutcome(null)
    setErrors([])
    const res = await call(api.POST('/sys/unseal', { body }))
    setSending(false)
    if (res.ok) {
      applyStatus(res.data)
      return
    }
    if (res.error.kind === 'network') return // The banner says so.
    if (res.error.status === 400 && 'share' in body) {
      // The shares at the threshold did not combine; the server discarded
      // them all.
      setOutcome('failed')
    } else if (res.error.status === 409) {
      // Other key holders met the threshold first.
      setOutcome('not-needed')
    } else {
      setErrors(res.error.messages)
    }
    void refreshStatus()
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!isBase64(share) || sending) return
    const value = share.trim()
    // Sent once and not kept: the field clears as it goes.
    setShare('')
    void send({ share: value })
  }

  return (
    <section className="card unseal" aria-labelledby="state-h">
      {progress.unsealed ? (
        <div className="unseal__state">
          <div className="unseal__badge unseal__badge--unsealed">
            <BigLock open />
          </div>
          <div className="unseal__state-text">
            <h2 id="state-h">Unsealed</h2>
            <p>The key is rebuilt and in memory. Sealing discards it; the shares are needed again.</p>
          </div>
          {signedIn ? (
            <SealButton />
          ) : (
            <Link className="button button--primary button--lg" to="/login">
              Sign in
            </Link>
          )}
        </div>
      ) : (
        <div className="unseal__state">
          <div className="unseal__badge unseal__badge--sealed">
            <BigLock />
          </div>
          <div className="unseal__state-text">
            <h2 id="state-h">Sealed</h2>
            <p>The key is not in memory. Secrets, policies and tokens are refused until the threshold is met.</p>
          </div>
        </div>
      )}

      <div className="unseal__progress">
        <div className="unseal__progress-head">
          <span className="unseal__progress-text">{progress.text}</span>
          <span className="field__hint">
            Held by the server, so every browser sees the same count
            {at !== null && (
              <>
                {' · '}
                <UpdatedAgo at={at} />
              </>
            )}
          </span>
        </div>
        <ProgressBar filled={progress.filled} threshold={progress.threshold} unsealed={progress.unsealed} label={progress.text} />
      </div>

      {outcome === 'failed' && (
        <p className="alert unseal__alert" role="alert">
          The shares did not combine into the key, so the server discarded them. Start again with correct shares.
        </p>
      )}
      {outcome === 'not-needed' && (
        <p className="notice notice--done" role="status">
          Already unsealed. Your share was not needed.
        </p>
      )}
      {errors.length > 0 && (
        <p className="alert" role="alert">
          {errors.join(' ')}
        </p>
      )}

      {!progress.unsealed && (
        <>
          <form className="unseal__form" onSubmit={submit} noValidate>
            <label htmlFor="share" className="field__label">
              Your unseal share
            </label>
            <div className="unseal__row">
              <input
                id="share"
                className="field__input unseal__input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your share"
                value={share}
                onChange={(e) => setShare(e.target.value)}
                aria-invalid={shareInvalid}
                aria-describedby="share-hint"
              />
              <button type="submit" className="button button--primary unseal__submit" disabled={!isBase64(share) || sending}>
                Submit share
              </button>
            </div>
            <span id="share-hint" className={`field__hint${shareInvalid ? ' field__hint--error' : ''}`}>
              {shareInvalid
                ? 'Not a share: shares are standard base64.'
                : 'Sent once and not kept by this page. The field clears after sending.'}
            </span>
          </form>
          <div className="unseal__reset">
            <span className="muted">Started with the wrong shares? Discard the buffered ones for everyone.</span>
            <button
              type="button"
              className="button button--quiet button--lg"
              disabled={status.progress === 0 || sending}
              onClick={() => void send({ reset: true })}
            >
              Discard buffered shares
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function SealButton() {
  const [sealing, setSealing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const seal = async () => {
    setSealing(true)
    setErrors([])
    const res = await call(api.POST('/sys/seal'))
    setSealing(false)
    // A refused seal (no `update` on system/seal) is said here; a 401 ends
    // the session globally.
    if (!res.ok && res.error.kind === 'http' && res.error.status !== 401) setErrors(res.error.messages)
    void refreshStatus()
  }

  return (
    <div className="unseal__seal">
      <button type="button" className="button button--primary button--lg" disabled={sealing} onClick={() => void seal()}>
        Seal now
      </button>
      {errors.length > 0 && (
        <span className="field__hint field__hint--error" role="alert">
          {errors.join(' ')}
        </span>
      )}
    </div>
  )
}

function ProgressBar({ filled, threshold, unsealed, label }: { filled: number; threshold: number; unsealed: boolean; label: string }) {
  const tone = unsealed ? 'unseal__seg--done' : 'unseal__seg--filled'
  if (threshold > MAX_SEGMENTS) {
    return (
      <div role="img" aria-label={label} className="unseal__track">
        <div className={`unseal__seg ${tone}`} style={{ width: `${(100 * filled) / threshold}%` }} />
      </div>
    )
  }
  return (
    <div role="img" aria-label={label} className="unseal__segments">
      {Array.from({ length: threshold }, (_, i) => (
        <div key={i} className={`unseal__seg${i < filled ? ` ${tone}` : ''}`} />
      ))}
    </div>
  )
}

function UpdatedAgo({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <>updated {secondsAgo(at, now)} s ago</>
}

function BigLock({ open = false }: { open?: boolean }) {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
      <path d="M12 15v2" />
    </svg>
  )
}
