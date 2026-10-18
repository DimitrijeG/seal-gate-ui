// What the API trace shows in place of a secret.
export const MASK = '••••'

// Every JSON key whose value is a secret, a share, a token or a password.
// `value` is a secret's value; `share` and `shares` are unseal shares.
const SECRET_KEYS = new Set(['value', 'share', 'shares', 'root_token', 'token', 'password'])

// Returns a copy of a parsed JSON body with every secret value replaced by
// MASK, at any depth. An array under a secret key keeps its length, so the
// trace still shows how many shares came back. A number or boolean is never
// secret material: `shares` in a status or init request is a count.
export function maskJson(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(maskJson)
  if (body === null || typeof body !== 'object') return body
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!SECRET_KEYS.has(key) || typeof value === 'number' || typeof value === 'boolean') {
      masked[key] = maskJson(value)
    } else if (Array.isArray(value)) {
      masked[key] = value.map(() => MASK)
    } else if (typeof value === 'string' && value === '') {
      // An empty secret has nothing to hide; masking it would suggest a value.
      masked[key] = value
    } else {
      masked[key] = MASK
    }
  }
  return masked
}

// Masks a raw body for display. A body that is not JSON is never shown, since
// the console cannot tell what is in it.
export function maskBody(text: string): string {
  if (text === '') return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return `(not JSON, ${new TextEncoder().encode(text).length} bytes)`
  }
  return JSON.stringify(maskJson(parsed))
}
