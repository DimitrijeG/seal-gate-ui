// Standard, padded base64, the only form seal-gate decodes for shares and
// tokens (Go's encoding/json reads a []byte with StdEncoding, strictly).
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

// Whether a pasted value, without the whitespace a paste may carry around
// it, is non-empty standard base64.
export function isBase64(text: string): boolean {
  const value = text.trim()
  return value !== '' && BASE64.test(value)
}
