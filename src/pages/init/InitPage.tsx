import { useEffect, useState } from 'react'
import { Link, Navigate, useBlocker, useNavigate } from 'react-router'
import { api, refreshStatus, server } from '../../api/client'
import { call } from '../../api/result'
import type { components } from '../../api/schema'
import { useStore } from '../../lib/store'
import { SecretRow } from '../../ui/SecretRow'
import { MAX, MIN, checkSplit, diagramBoxes } from './split'
import './InitPage.css'

type InitResponse = components['schemas']['InitResponse']

export function InitPage() {
  const srv = useStore(server)
  // The shares and root token exist only here, in this component's memory:
  // leaving the page forgets them.
  const [result, setResult] = useState<InitResponse | null>(null)
  const [conflict, setConflict] = useState(false)
  const [entered, setEntered] = useState(false)

  const status = srv.state === 'loading' ? null : srv.status
  if (status === null && result === null) return null

  if (!entered) {
    // Arriving at an instance that is already initialized: Unseal is next.
    if (status?.initialized) return <Navigate to="/unseal" replace />
    setEntered(true)
  }

  return (
    <>
      <div className="page-head">
        <h1>Initialize the instance</h1>
        <p>
          Initialization creates the master key, splits it with Shamir's secret sharing, and hands the shares out
          once. It can happen only once per instance.
        </p>
      </div>
      {result !== null ? (
        <InitResult result={result} />
      ) : conflict || status?.initialized ? (
        // Someone else initialized it while this page was open.
        <div className="notice notice--info">
          <span className="notice__title">Already initialized by someone else</span>
          <span>Ask them for your share, then unseal.</span>
          <Link className="button button--primary" to="/unseal">
            Go to Unseal
          </Link>
        </div>
      ) : (
        <SplitForm onInitialized={setResult} onConflict={() => setConflict(true)} />
      )}
    </>
  )
}

function SplitForm({
  onInitialized,
  onConflict,
}: {
  onInitialized: (result: InitResponse) => void
  onConflict: () => void
}) {
  const [sharesText, setSharesText] = useState('5')
  const [thresholdText, setThresholdText] = useState('3')
  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const check = checkSplit(sharesText, thresholdText)
  const fieldErrors = check.ok ? {} : check.errors
  // The diagram follows what is typed; while a count is invalid it keeps
  // the last valid split.
  const [shown, setShown] = useState({ shares: 5, threshold: 3 })
  if (check.ok && (check.shares !== shown.shares || check.threshold !== shown.threshold)) {
    setShown({ shares: check.shares, threshold: check.threshold })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!check.ok || sending) return
    setSending(true)
    setErrors([])
    const res = await call(api.POST('/sys/init', { body: { shares: check.shares, threshold: check.threshold } }))
    setSending(false)
    if (res.ok) {
      onInitialized(res.data)
      void refreshStatus()
    } else if (res.error.kind === 'http' && res.error.status === 409) {
      onConflict()
      void refreshStatus()
    } else if (res.error.kind === 'http') {
      setErrors(res.error.messages)
    }
    // No answer: the banner says so, and the form stays for another try.
  }

  // The threshold may not exceed the share count, once that is valid.
  const sharesMax = fieldErrors.shares === undefined ? Number(sharesText) : MAX

  return (
    <form className="card" aria-labelledby="split-h" onSubmit={(e) => void submit(e)} noValidate>
      <h2 id="split-h">Split the key</h2>
      <div className="split-fields">
        <div className="field">
          <label htmlFor="shares" className="field__label">
            Shares
          </label>
          <input
            id="shares"
            className="field__input"
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={sharesText}
            onChange={(e) => setSharesText(e.target.value)}
            aria-invalid={fieldErrors.shares !== undefined}
            aria-describedby="shares-hint"
          />
          <span id="shares-hint" className={`field__hint${fieldErrors.shares ? ' field__hint--error' : ''}`}>
            {fieldErrors.shares ?? 'How many key holders, 2 to 255.'}
          </span>
        </div>
        <div className="field">
          <label htmlFor="threshold" className="field__label">
            Threshold
          </label>
          <input
            id="threshold"
            className="field__input"
            type="number"
            inputMode="numeric"
            min={MIN}
            max={sharesMax}
            value={thresholdText}
            onChange={(e) => setThresholdText(e.target.value)}
            aria-invalid={fieldErrors.threshold !== undefined}
            aria-describedby="threshold-hint"
          />
          <span id="threshold-hint" className={`field__hint${fieldErrors.threshold ? ' field__hint--error' : ''}`}>
            {fieldErrors.threshold ?? 'How many must meet to unseal, at most the share count.'}
          </span>
        </div>
      </div>

      <div className="split-diagram" aria-hidden="true">
        <div className="split-diagram__key">master key</div>
        <span className="split-diagram__text">split into</span>
        <div className="split-diagram__shares">
          {diagramBoxes(shown.shares).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="split-diagram__gap">
                …
              </span>
            ) : (
              <div key={n} className="split-diagram__share">
                {n}
              </div>
            ),
          )}
        </div>
        <span className="split-diagram__text">any {shown.threshold} rebuild it</span>
      </div>

      {errors.length > 0 && (
        <p className="alert" role="alert">
          {errors.join(' ')}
        </p>
      )}

      <div className="split-actions">
        <button type="submit" className="button button--primary button--lg" disabled={!check.ok || sending}>
          Initialize
        </button>
        <span className="muted">The instance stays sealed afterwards.</span>
      </div>
    </form>
  )
}

function InitResult({ result }: { result: InitResponse }) {
  const navigate = useNavigate()
  // Revealing one hides the others, so only one is ever on screen.
  const [revealed, setRevealed] = useState<number | 'root' | null>(null)
  const [stored, setStored] = useState(false)

  // Leaving forgets the shares for good, so ask first until they are stored.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !stored && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('The shares and the root token are shown only once. Leave without them?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    if (stored) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stored])

  const toggle = (which: number | 'root') => setRevealed(revealed === which ? null : which)

  const download = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'seal-gate-init.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="card init-result" aria-labelledby="result-h">
      <div className="init-result__head">
        <div className="init-result__title">
          <h2 id="result-h">Shares and root token</h2>
          <button type="button" className="button button--outline button--lg" onClick={download}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            Download as JSON
          </button>
        </div>
        <p className="notice notice--warn">
          Shown once. The server keeps only a hash of the root token and none of the shares; if these are lost, the
          data cannot be unsealed.
        </p>
      </div>
      <ol className="init-result__shares">
        {result.shares.map((share, i) => (
          <li key={i}>
            <SecretRow label={`Share ${i + 1}`} value={share} revealed={revealed === i} onToggle={() => toggle(i)} />
          </li>
        ))}
      </ol>
      <div className="init-result__root">
        <SecretRow label="Root token" value={result.root_token} revealed={revealed === 'root'} onToggle={() => toggle('root')} />
      </div>
      <p className="muted">
        Revealing one hides the others. Give each share to a different key holder; this page forgets them when you
        leave it.
      </p>
      <div className="init-result__actions">
        <label className="init-result__check">
          <input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} />I have stored the shares
          and the root token
        </label>
        <button type="button" className="button button--primary button--lg" disabled={!stored} onClick={() => void navigate('/unseal')}>
          Continue to unseal
        </button>
      </div>
    </section>
  )
}
