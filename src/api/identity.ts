import { api } from './client'
import { call } from './result'
import { identity, toIdentity, token } from './session'

let inFlight: Promise<void> | null = null

// Reads whom the session's token authenticates as. A 401 ends the session
// (the client's middleware sees to that); any other failure leaves the
// identity unknown, to be read again later.
export function loadIdentity(): Promise<void> {
  inFlight ??= (async () => {
    const asked = token.get()
    try {
      const res = await call(api.GET('/auth/token/self'))
      // Kept only if the session still holds the token that was asked about.
      if (res.ok && token.get() === asked) identity.set(toIdentity(res.data))
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}
