// Standard, padded base64, the only form seal-gate decodes for shares and
// tokens (Go's encoding/json reads a []byte with StdEncoding, strictly).
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

// Text as UTF-8 bytes in standard base64, the form a secret's value is sent in.
export function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // In chunks: spreading 64 KiB into one call would overflow the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// Whether a pasted value, without the whitespace a paste may carry around
// it, is non-empty standard base64.
export function isBase64(text: string): boolean {
  const value = text.trim()
  return value !== '' && BASE64.test(value)
}
