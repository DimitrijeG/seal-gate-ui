import { useState } from 'react'
import { Link } from 'react-router'
import { can, capabilities } from '../../api/capabilities/capabilities'
import { resources } from '../../api/capabilities/resources'
import { api } from '../../api/client'
import { call, messageText } from '../../api/result'
import { encodeText } from '../../lib/base64'
import { useStore } from '../../lib/store'
import { pathProblem } from './paths'

// Bounds from the spec: a stored value decodes to at most 64 KiB; a generated
// one is 16 to 65536 bytes; a TTL is at most 9223372036 seconds.
const MAX_VALUE_BYTES = 65536
const MIN_LENGTH = 16
const MAX_LENGTH = 65536
const MAX_TTL = 9223372036

const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const
type Unit = keyof typeof UNITS
type Kind = 'store' | 'generate'

interface NewSecretProps {
  folder: string
  // Every listed path, to tell before sending that a path is taken; null
  // when the list is not loaded.
  existing: string[] | null
  onCancel: () => void
  onCreated: (path: string) => void
}

// A new secret: a value stored as given, or random bytes the server makes.
// Not in design/ yet (TODO.md); built from its fields and buttons.
export function NewSecret({ folder, existing, onCancel, onCreated }: NewSecretProps) {
  const caps = useStore(capabilities)
  const [path, setPath] = useState(folder)
  const [kind, setKind] = useState<Kind>('store')
  const [value, setValue] = useState('')
  const [length, setLength] = useState('32')
  const [ttl, setTtl] = useState('')
  const [unit, setUnit] = useState<Unit>('days')
  const [sending, setSending] = useState(false)
  const [taken, setTaken] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const problem = pathProblem(path)
  const pathReady = problem === null
  const exists = pathReady && (existing?.includes(path) === true || taken === path)
  const refused = pathReady && can(caps, 'create', resources.secret(path)) === 'no'
  // The folder it starts from is not yet a path; no complaint until edited.
  const pristine = path === folder

  const valueBytes = new TextEncoder().encode(value).length
  const valueTooLarge = kind === 'store' && valueBytes > MAX_VALUE_BYTES
  const lengthOk = /^\d+$/.test(length) && Number(length) >= MIN_LENGTH && Number(length) <= MAX_LENGTH
  const ttlSeconds = ttl.trim() === '' ? 0 : /^\d+$/.test(ttl.trim()) ? Number(ttl) * UNITS[unit] : NaN
  const ttlOk = Number.isInteger(ttlSeconds) && ttlSeconds >= 0 && ttlSeconds <= MAX_TTL

  const ready =
    pathReady && !exists && !refused && ttlOk && !sending && (kind === 'store' ? !valueTooLarge : lengthOk)

  const pathError = problem ?? (refused ? 'This token may not create a secret here.' : null)
  const showError = exists || (pathError !== null && !pristine)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setSending(true)
    setErrors([])
    const body = ttlSeconds > 0 ? { ttl: ttlSeconds } : {}
    const res =
      kind === 'store'
        ? await call(api.PUT('/secrets/{path}', { params: { path: { path } }, body: { value: encodeText(value), ...body } }))
        : await call(api.POST('/secrets/generate/{path}', { params: { path: { path } }, body: { length: Number(length), ...body } }))
    setSending(false)
    if (res.ok) {
      // The value is not kept once sent.
      setValue('')
      onCreated(path)
    } else if (res.error.kind === 'http') {
      // Someone took the path since the list was read.
      if (res.error.status === 409) setTaken(path)
      else setErrors(res.error.messages)
    }
  }

  return (
    <form className="secrets-detail" aria-labelledby="new-h" onSubmit={(e) => void submit(e)} noValidate>
      <h2 id="new-h" className="secrets-new__title">
        New secret
      </h2>

      <div className="field">
        <label htmlFor="s-path" className="field__label">
          Path
        </label>
        <input
          id="s-path"
          className="field__input"
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          aria-invalid={showError}
          aria-describedby="s-path-hint"
        />
        <span id="s-path-hint" className={`field__hint${showError ? ' field__hint--error' : ''}`}>
          {taken === path ? (
            <>
              Someone just created a secret here. Pick another path or <Link to={`/secrets/${path}`}>open it</Link>.
            </>
          ) : exists ? (
            <>
              A secret already exists here. <Link to={`/secrets/${path}`}>Open it</Link>.
            </>
          ) : showError ? (
            pathError
          ) : (
            'Segments of A–Z a–z 0–9 . _ - separated by /.'
          )}
        </span>
      </div>

      <div className="secrets-kind" role="group" aria-label="Kind">
        <button type="button" aria-pressed={kind === 'store'} className="secrets-kind__option" onClick={() => setKind('store')}>
          Store a value
        </button>
        <button type="button" aria-pressed={kind === 'generate'} className="secrets-kind__option" onClick={() => setKind('generate')}>
          Generate
        </button>
      </div>

      {kind === 'store' ? (
        <div className="field">
          <label htmlFor="s-value" className="field__label">
            Value
          </label>
          <textarea
            id="s-value"
            className="field__input secrets-new__value"
            spellCheck={false}
            autoComplete="off"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={valueTooLarge}
            aria-describedby="s-value-hint"
          />
          <span id="s-value-hint" className={`field__hint${valueTooLarge ? ' field__hint--error' : ''}`}>
            {valueTooLarge
              ? `Larger than seal-gate accepts: ${valueBytes} of at most ${MAX_VALUE_BYTES} bytes.`
              : 'Sent as UTF-8 in base64. Empty stores an empty secret.'}
          </span>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="s-length" className="field__label">
            Length in bytes
          </label>
          <input
            id="s-length"
            className="field__input"
            type="number"
            inputMode="numeric"
            min={MIN_LENGTH}
            max={MAX_LENGTH}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            aria-invalid={!lengthOk}
            aria-describedby="s-length-hint"
          />
          <span id="s-length-hint" className={`field__hint${lengthOk ? '' : ' field__hint--error'}`}>
            {lengthOk ? 'Random bytes made by the server, shown once it has them.' : `A whole number from ${MIN_LENGTH} to ${MAX_LENGTH}.`}
          </span>
        </div>
      )}

      <div className="field">
        <label htmlFor="s-ttl" className="field__label">
          {kind === 'store' ? 'Expires after' : 'Rotate every'} <span className="muted">(optional)</span>
        </label>
        <div className="secrets-ttl">
          <input
            id="s-ttl"
            className="field__input"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="never"
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            aria-invalid={!ttlOk}
            aria-describedby="s-ttl-hint"
          />
          <label htmlFor="s-unit" className="visually-hidden">
            Unit
          </label>
          <select id="s-unit" className="secrets-scope" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
        <span id="s-ttl-hint" className={`field__hint${ttlOk ? '' : ' field__hint--error'}`}>
          {!ttlOk
            ? 'A whole number, or empty for never.'
            : kind === 'store'
              ? 'After this it reads as missing. Empty: it never expires.'
              : 'Due for rotation this long after each one. Empty: never due.'}
        </span>
      </div>

      {errors.length > 0 && (
        <p className="alert" role="alert">
          {messageText(errors)}
        </p>
      )}

      <div className="secrets-actions">
        <button type="submit" className="button button--primary button--lg" disabled={!ready}>
          {kind === 'store' ? 'Store secret' : 'Generate secret'}
        </button>
        <button type="button" className="button button--quiet button--lg" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
