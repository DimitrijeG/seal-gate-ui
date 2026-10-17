// Fills `{name}` placeholders in a route. A secret's `path` may hold `/`
// between segments, which the server routes as a multi-segment wildcard; it
// is sent as written, each segment encoded, so the trace reads
// `/v1/secrets/db/password` rather than `/v1/secrets/db%2Fpassword`. Every
// other parameter is one segment and fully encoded.
export function serializePath(pathname: string, params: Record<string, unknown>): string {
  return pathname.replace(/\{([^}]+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    if (value === undefined || value === null) return placeholder
    const text = String(value)
    if (name === 'path') return text.split('/').map(encodeURIComponent).join('/')
    return encodeURIComponent(text)
  })
}
