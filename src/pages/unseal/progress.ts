import type { Status } from '../../api/client'

// Above this many shares the bar is one track rather than a segment per
// share, which would be too thin to see.
export const MAX_SEGMENTS = 24

export interface Progress {
  text: string
  // Shares counted toward the threshold; all of them once unsealed.
  filled: number
  threshold: number
  unsealed: boolean
}

export function unsealProgress(status: Status): Progress {
  const threshold = status.threshold ?? 0
  if (!status.sealed) return { text: 'Threshold met: key rebuilt', filled: threshold, threshold, unsealed: true }
  return {
    text: `${status.progress} of ${threshold} shares submitted`,
    filled: status.progress,
    threshold,
    unsealed: false,
  }
}

// How long ago, in whole seconds, for "updated 2 s ago".
export function secondsAgo(at: number, now: number): number {
  return Math.max(0, Math.floor((now - at) / 1000))
}
