import createClient, { type Middleware } from 'openapi-fetch'
import { createStore } from '../lib/store'
import { maskBody } from './mask'
import { serializePath } from './paths'
import { isProxyFailure } from './result'
import type { components, paths } from './schema'
import { endSession, token } from './session'
import { record } from './trace'

export type Status = components['schemas']['StatusResponse']

// Operations the spec marks `security: []`. They are sent without the
// session token, so it never travels further than it must. A test checks
// this list against api/openapi.yaml.
export const OPEN_OPERATIONS = new Set(['/sys/init', '/sys/unseal', '/sys/status', '/sys/health', '/auth/login'])

// What the console knows about the server. `down` keeps the last status seen,
// so the page can stay as it was behind the banner.
export type Server =
  | { state: 'loading' }
  | { state: 'up'; status: Status }
  | { state: 'down'; status: Status | null }

export const server = createStore<Server>({ state: 'loading' })

export const POLL_MS = 5000

// Same origin: the dev server, and the reverse proxy in deployment, forward
// /v1 to seal-gate.
export const api = createClient<paths>({ baseUrl: '/v1', pathSerializer: serializePath })

const sentTokens = new Map<string, string | null>()
const requestBodies = new Map<string, string>()

function tracePath(request: Request): string {
  const url = new URL(request.url)
  return url.pathname + url.search
}

function traceRequest(id: string, sentToken: string | null): string {
  const body = requestBodies.get(id) ?? ''
  if (body !== '') return maskBody(body)
  return sentToken === null ? '' : 'Authorization: Bearer ••••'
}

const middleware: Middleware = {
  async onRequest({ request, schemaPath, id }) {
    const current = token.get()
    // A caller may send a token of its own, as sign-in by token does to check
    // one before keeping it.
    if (!request.headers.has('Authorization') && current !== null && !OPEN_OPERATIONS.has(schemaPath)) {
      request.headers.set('Authorization', `Bearer ${current}`)
    }
    const sent = request.headers.get('Authorization')
    sentTokens.set(id, sent === null ? null : sent.replace(/^Bearer /, ''))
    requestBodies.set(id, request.body === null ? '' : await request.clone().text())
    return request
  },

  async onResponse({ request, response, schemaPath, id }) {
    const sentToken = sentTokens.get(id) ?? null
    record({
      method: request.method,
      path: tracePath(request),
      status: response.status,
      request: traceRequest(id, sentToken),
      response: maskBody(await response.clone().text()),
    })
    sentTokens.delete(id)
    requestBodies.delete(id)

    if (isProxyFailure(response.status)) {
      markDown()
      return response
    }
    // Only the session's own token ending ends the session. At login a 401
    // means wrong credentials, and a token being checked is not yet ours.
    if (response.status === 401 && sentToken !== null && sentToken === token.get()) {
      endSession()
    }
    if (schemaPath !== '/sys/status' && (response.status === 503 || server.get().state === 'down')) {
      void refreshStatus()
    }
    return response
  },

  onError({ request, id }) {
    record({
      method: request.method,
      path: tracePath(request),
      status: null,
      request: traceRequest(id, sentTokens.get(id) ?? null),
      response: '',
    })
    sentTokens.delete(id)
    requestBodies.delete(id)
    markDown()
  },
}

api.use(middleware)

function markDown(): void {
  server.set((prev) => ({ state: 'down', status: prev.state === 'loading' ? null : prev.status }))
}

// Records a status the server returned, from polling or from init and
// unseal, which answer with one.
export function applyStatus(status: Status): void {
  server.set({ state: 'up', status })
}

let inFlight: Promise<void> | null = null

export function refreshStatus(): Promise<void> {
  inFlight ??= (async () => {
    try {
      // Any other error answer still means the server is reachable; it shows
      // in the trace, and the console keeps what it knew.
      const { data } = await api.GET('/sys/status')
      if (data) applyStatus(data)
    } catch {
      // A network failure is already recorded by the middleware.
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

// Polls status while the tab is visible, so the console notices another
// operator sealing or unsealing, and a server that comes back.
export function startStatusPolling(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const tick = async () => {
    if (document.visibilityState === 'visible') await refreshStatus()
    if (!stopped) timer = setTimeout(tick, POLL_MS)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshStatus()
  }

  void tick()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
