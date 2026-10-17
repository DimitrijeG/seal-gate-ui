// A request's outcome with the failure spelled out, so a screen handles every
// case without a try/catch of its own.
export type ApiError =
  // The server answered with an error; `messages` are its own words.
  | { kind: 'http'; status: number; messages: string[] }
  // No answer: the server is down or the network dropped.
  | { kind: 'network' }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

// The proxy in front of seal-gate (Vite in development, Caddy in deployment)
// answers 502 when seal-gate is down and 504 when it does not answer in
// time. seal-gate itself sends neither, so both mean no answer from it.
export function isProxyFailure(status: number): boolean {
  return status === 502 || status === 504
}

// The server's messages from an `{"errors": [...]}` body. Anything else, such
// as a proxy's error page, gets a plain description instead.
export function errorMessages(status: number, body: unknown): string[] {
  if (typeof body === 'object' && body !== null && 'errors' in body) {
    const { errors } = body
    if (Array.isArray(errors) && errors.length > 0 && errors.every((e) => typeof e === 'string')) {
      return errors
    }
  }
  return [`The server answered ${status} without an explanation.`]
}

export async function call<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ApiResult<T>> {
  let result: Awaited<typeof request>
  try {
    result = await request
  } catch (error) {
    // fetch rejects with a TypeError when no response arrives.
    if (error instanceof TypeError) return { ok: false, error: { kind: 'network' } }
    throw error
  }
  const { response } = result
  if (isProxyFailure(response.status)) return { ok: false, error: { kind: 'network' } }
  if (!response.ok) {
    return { ok: false, error: { kind: 'http', status: response.status, messages: errorMessages(response.status, result.error) } }
  }
  return { ok: true, data: result.data as T }
}
