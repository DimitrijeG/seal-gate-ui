import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { refreshStatus, server, startStatusPolling } from '../api/client'
import { canAnythingUnder, capabilities, loadCapabilities, offers } from '../api/capabilities/capabilities'
import { resources } from '../api/capabilities/resources'
import { loadIdentity } from '../api/identity'
import { identity, token } from '../api/session'
import { useStore } from '../lib/store'
import { CodeIcon, LockIcon } from './icons'
import { navItems } from './navigation'
import { SessionMenu } from './SessionMenu'
import { StatusPill } from './StatusPill'
import { TracePanel } from './TracePanel'
import './Shell.css'

// The resources behind each working screen; a screen is offered while the
// token may do anything under one of them.
const AREAS: Record<string, string[]> = {
  '/secrets': ['secrets/'],
  '/identity': [resources.entities, resources.groups, resources.users],
  '/policies': [resources.policies],
}

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
  const currentToken = useStore(token)
  const who = useStore(identity)
  const signedIn = currentToken !== null
  const [traceOn, setTraceOn] = useState(loadTraceOn)
  // Sign-in stands alone in the design: brand and status only.
  const bare = useLocation().pathname === '/login'

  useEffect(() => startStatusPolling(), [])

  const status = srv.state === 'loading' ? null : srv.status
  const unsealed = status !== null && status.initialized && !status.sealed
  // Changes with every status poll, so a read that failed is tried again.
  const polled = srv.state === 'up' ? srv.at : 0

  // Whom the token speaks for, read once it can be: a sealed instance
  // answers nothing but status.
  useEffect(() => {
    if (currentToken !== null && who === null && unsealed) void loadIdentity()
  }, [currentToken, who, unsealed, polled])

  // Then what it may do, so the console offers only that.
  const caps = useStore(capabilities)
  useEffect(() => {
    if (who !== null && caps.state === 'none' && unsealed) void loadCapabilities()
  }, [who, caps.state, unsealed, polled])

  const offered = (to: string) => {
    const areas = AREAS[to] ?? []
    return areas.some((prefix) => offers(canAnythingUnder(caps, prefix)))
  }

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
                {navItems(status, signedIn, offered).map((item) => (
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
              <SessionMenu />
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
