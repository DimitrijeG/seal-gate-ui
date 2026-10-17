import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { refreshStatus, server, startStatusPolling } from '../api/client'
import { token } from '../api/session'
import { useStore } from '../lib/store'
import { CodeIcon, LockIcon } from './icons'
import { navItems } from './navigation'
import { StatusPill } from './StatusPill'
import { TracePanel } from './TracePanel'
import './Shell.css'

// Whether the trace is open is a per-tab convenience, not a secret.
const TRACE_KEY = 'seal-gate.trace'

function loadTraceOn(): boolean {
  try {
    return sessionStorage.getItem(TRACE_KEY) === '1'
  } catch {
    return false
  }
}

function saveTraceOn(on: boolean): void {
  try {
    sessionStorage.setItem(TRACE_KEY, on ? '1' : '0')
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}

export function Shell() {
  const srv = useStore(server)
  const signedIn = useStore(token) !== null
  const [traceOn, setTraceOn] = useState(loadTraceOn)
  // Sign-in stands alone in the design: brand and status only.
  const bare = useLocation().pathname === '/login'

  useEffect(() => startStatusPolling(), [])

  const status = srv.state === 'loading' ? null : srv.status
  const toggleTrace = () => {
    setTraceOn(!traceOn)
    saveTraceOn(!traceOn)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="app-brand" to="/">
            <LockIcon size={22} />
            seal-gate
          </Link>
          {!bare && (
            <>
              <nav aria-label="Main" className="app-nav">
                {navItems(status, signedIn).map((item) => (
                  <NavLink key={item.to} to={item.to} className="app-nav__link">
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <button
                type="button"
                className={`trace-toggle${traceOn ? ' trace-toggle--on' : ''}`}
                aria-pressed={traceOn}
                onClick={toggleTrace}
              >
                <CodeIcon />
                API trace
              </button>
            </>
          )}
          <div className="app-header__end">
            <StatusPill status={status} />
          </div>
        </div>
      </header>

      {srv.state === 'down' && (
        <div className="banner" role="alert">
          <span>Can't reach seal-gate. Trying again in 5 s.</span>
          <button type="button" className="banner__action" onClick={() => void refreshStatus()}>
            Try now
          </button>
        </div>
      )}

      <div className="app-body">
        <main className="app-main">
          <Outlet />
        </main>
        {traceOn && !bare && <TracePanel />}
      </div>
    </div>
  )
}
