import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import { call, messageText } from '../api/result'
import { type Identity, identity, signIn, signOut } from '../api/session'
import { useStore } from '../lib/store'
import { formatUtc } from '../lib/time'

function displayName(who: Identity): string {
  if (who.root) return 'root'
  return who.alias ?? `entity ${who.entityId.slice(0, 8)}`
}

// Who is signed in, and what can be done with the session's token. Not in
// design/: it takes the header spot of the skipped "Acting as" select.
export function SessionMenu() {
  const who = useStore(identity)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (who === null) return null

  const leave = () => {
    signOut()
    void navigate('/login')
  }

  // The server refuses to rotate or revoke the root token, so neither is
  // offered for it.
  const rotate = async () => {
    if (who.root) return
    setBusy(true)
    setErrors([])
    const res = await call(api.POST('/auth/token/rotate'))
    setBusy(false)
    if (res.ok) signIn(res.data.token, { ...who, expiresAt: res.data.expires_at })
    else if (res.error.kind === 'http' && res.error.status !== 401) setErrors(res.error.messages)
  }

  const revoke = async () => {
    setBusy(true)
    setErrors([])
    const res = await call(api.POST('/auth/token/revoke'))
    setBusy(false)
    if (res.ok) leave()
    else if (res.error.kind === 'http' && res.error.status !== 401) setErrors(res.error.messages)
  }

  return (
    <div className="session" ref={ref}>
      <button
        type="button"
        className="session__button"
        aria-expanded={open}
        aria-controls="session-panel"
        onClick={() => setOpen(!open)}
      >
        <span className="session__label">Signed in as</span>
        <span className="session__name">{displayName(who)}</span>
      </button>
      {open && (
        <div id="session-panel" className="session__panel">
          <span className="session__detail">
            {who.root ? 'Root token · does not expire' : `Token expires ${formatUtc(who.expiresAt)}`}
          </span>
          {errors.length > 0 && (
            <span className="field__hint field__hint--error" role="alert">
              {messageText(errors)}
            </span>
          )}
          {!who.root && (
            <>
              <button type="button" className="session__item" disabled={busy} onClick={() => void rotate()}>
                Rotate token
              </button>
              <button type="button" className="session__item" disabled={busy} onClick={() => void revoke()}>
                Revoke token
              </button>
            </>
          )}
          <button type="button" className="session__item" disabled={busy} onClick={leave}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
