import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { api, server } from '../../api/client'
import { call, messageText } from '../../api/result'
import { sessionEnded, signIn, toIdentity, token } from '../../api/session'
import { isBase64 } from '../../lib/base64'
import { useStore } from '../../lib/store'
import './LoginPage.css'

// UserRequest's bound on a password, in UTF-8 bytes.
const MAX_PASSWORD_BYTES = 1024

type Method = 'password' | 'token'

// Where to go after signing in: back where the session ended or the user
// was sent from, or the start.
function returnPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const { from } = state
    if (typeof from === 'string' && from.startsWith('/') && from !== '/login') return from
  }
  return '/'
}

export function LoginPage() {
  const srv = useStore(server)
  const signedIn = useStore(token) !== null
  const ended = useStore(sessionEnded)
  const location = useLocation()
  const [method, setMethod] = useState<Method>('password')
  const [errors, setErrors] = useState<string[]>([])

  const status = srv.state === 'loading' ? null : srv.status
  if (status === null) return null
  if (!status.initialized) return <Navigate to="/init" replace />
  // Signed in, here or just now by the forms below: carry on.
  if (signedIn && !ended) return <Navigate to={returnPath(location.state)} replace />

  const sealed = status.sealed
  const pick = (next: Method) => {
    setMethod(next)
    setErrors([])
  }

  return (
    <div className="login">
      <div className="login__head">
        <h1>Sign in</h1>
        <p>Every request is made as the entity you sign in as.</p>
      </div>

      {sealed && (
        <div className="login__sealed">
          <span>The instance is sealed. Sign-in works once it is unsealed.</span>
          <Link className="button button--primary" to="/unseal">
            Go to Unseal
          </Link>
        </div>
      )}

      <section className="login__card">
        <div role="tablist" aria-label="Sign-in method" className="login__tabs">
          <button
            type="button"
            role="tab"
            id="tab-password"
            aria-selected={method === 'password'}
            aria-controls="panel-password"
            className="login__tab"
            onClick={() => pick('password')}
          >
            Username
          </button>
          <button
            type="button"
            role="tab"
            id="tab-token"
            aria-selected={method === 'token'}
            aria-controls="panel-token"
            className="login__tab"
            onClick={() => pick('token')}
          >
            Token
          </button>
        </div>

        {errors.length > 0 && (
          <p className="alert" role="alert">
            {messageText(errors)}
          </p>
        )}

        {method === 'password' ? (
          <PasswordForm sealed={sealed} onError={setErrors} />
        ) : (
          <TokenForm sealed={sealed} onError={setErrors} />
        )}
      </section>

      <p className="login__foot">The token stays in this tab only. Closing the tab signs you out.</p>
    </div>
  )
}

interface FormProps {
  sealed: boolean
  onError: (messages: string[]) => void
}

function PasswordForm({ sealed, onError }: FormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)

  const tooLong = new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES
  const ready = username !== '' && password !== '' && !tooLong && !sealed && !sending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setSending(true)
    onError([])
    const res = await call(api.POST('/auth/login', { body: { username, password } }))
    setSending(false)
    // The password is not kept once sent.
    setPassword('')
    if (res.ok) {
      signIn(res.data.token)
    } else if (res.error.kind === 'http') {
      onError(res.error.messages)
    }
  }

  return (
    <form id="panel-password" role="tabpanel" aria-labelledby="tab-password" className="login__form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor="l-user" className="field__label">
          Username
        </label>
        <input
          id="l-user"
          className="login__input"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="l-pw" className="field__label">
          Password
        </label>
        <input
          id="l-pw"
          className="login__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={tooLong}
          aria-describedby={tooLong ? 'l-pw-hint' : undefined}
        />
        {tooLong && (
          <span id="l-pw-hint" className="field__hint field__hint--error">
            Longer than any password seal-gate accepts (1024 bytes).
          </span>
        )}
      </div>
      <button type="submit" className="login__submit" disabled={!ready}>
        Sign in
      </button>
    </form>
  )
}

function TokenForm({ sealed, onError }: FormProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)

  const invalid = value.trim() !== '' && !isBase64(value)
  const ready = isBase64(value) && !sealed && !sending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    const candidate = value.trim()
    setSending(true)
    onError([])
    // Checked before it is kept: the server says whom it speaks for, or
    // that it speaks for no one.
    const res = await call(api.GET('/auth/token/self', { headers: { Authorization: `Bearer ${candidate}` } }))
    setSending(false)
    setValue('')
    if (res.ok) {
      signIn(candidate, toIdentity(res.data))
    } else if (res.error.kind === 'http') {
      onError(res.error.messages)
    }
  }

  return (
    <form id="panel-token" role="tabpanel" aria-labelledby="tab-token" className="login__form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor="l-tok" className="field__label">
          Token
        </label>
        <input
          id="l-tok"
          className="login__input login__input--mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid}
          aria-describedby="l-tok-hint"
        />
        <span id="l-tok-hint" className={`field__hint${invalid ? ' field__hint--error' : ''}`}>
          {invalid
            ? 'Not a token: tokens are standard base64.'
            : 'The root token from initialization, or one issued to an entity.'}
        </span>
      </div>
      <button type="submit" className="login__submit" disabled={!ready}>
        Sign in
      </button>
    </form>
  )
}
