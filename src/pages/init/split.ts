// The limits InitRequest sets on a split.
export const MIN = 2
export const MAX = 255

export interface SplitErrors {
  shares?: string
  threshold?: string
}

export type SplitCheck = { ok: true; shares: number; threshold: number } | { ok: false; errors: SplitErrors }

function parseCount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= MIN && n <= MAX ? n : null
}

// Checks the form as typed, so nothing the server would refuse is sent.
export function checkSplit(sharesText: string, thresholdText: string): SplitCheck {
  const shares = parseCount(sharesText)
  const threshold = parseCount(thresholdText)
  const errors: SplitErrors = {}
  if (shares === null) errors.shares = `A whole number from ${MIN} to ${MAX}.`
  if (threshold === null) errors.threshold = `A whole number from ${MIN} to ${MAX}.`
  else if (shares !== null && threshold > shares) errors.threshold = `At most the share count, ${shares}.`
  if (shares === null || threshold === null || errors.threshold) return { ok: false, errors }
  return { ok: true, shares, threshold }
}

// The boxes the split diagram draws: every share up to eight, otherwise the
// first six, a gap, and the last.
export function diagramBoxes(shares: number): (number | null)[] {
  if (shares <= 8) return Array.from({ length: shares }, (_, i) => i + 1)
  return [1, 2, 3, 4, 5, 6, null, shares]
}
