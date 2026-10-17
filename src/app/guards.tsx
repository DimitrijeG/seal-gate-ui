import { useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { server } from '../api/client'
import { sessionEnded, token } from '../api/session'
import { useStore } from '../lib/store'
import { LockIcon } from './icons'
import { startPath } from './navigation'
import { SessionEndedDialog } from './SessionEndedDialog'

// `/` goes to the first step the instance still needs.
export function Start() {
  const srv = useStore(server)
  const signedIn = useStore(token) !== null
  const to = startPath(srv.state === 'loading' ? null : srv.status, signedIn)
  return to === null ? null : <Navigate to={to} replace />
}

// The working screens need an unsealed instance and a session. Arriving
// without either redirects to the step that provides it. Losing either while
// working keeps the page where it is, inert, behind a banner or dialog, so
// nothing more is sent until it is restored.
export function RequireSession() {
  const srv = useStore(server)
  const signedIn = useStore(token) !== null
  const ended = useStore(sessionEnded)
  const location = useLocation()
  // Whether the working screens were ever ready since arriving: before that
  // a missing step redirects, after it the page pauses.
  const [entered, setEntered] = useState(false)

  const status = srv.state === 'loading' ? null : srv.status
  if (status === null) return null
  if (!status.initialized) return <Navigate to="/init" replace />

  if (!entered) {
    if (status.sealed) return <Navigate to="/unseal" replace />
    if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />
    setEntered(true)
  }
  if (!signedIn && !ended) return <Navigate to="/login" replace />

  const paused = status.sealed || ended
  return (
    <>
      {status.sealed && (
        <div className="banner banner--inline" role="alert">
          <span className="banner__text">
            <LockIcon />
            The instance was sealed. Work is paused.
          </span>
          <Link className="banner__link" to="/unseal">
            Go to Unseal
          </Link>
        </div>
      )}
      <div className="work-area" inert={paused}>
        <Outlet />
      </div>
      {ended && <SessionEndedDialog />}
    </>
  )
}
