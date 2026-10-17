import { describe, expect, it } from 'vitest'
import { formatUtc } from './time'

describe('formatUtc', () => {
  it('writes an instant in UTC, as the design does', () => {
    expect(formatUtc('2026-10-16T11:30:00Z')).toBe('16 Oct 11:30 UTC')
    expect(formatUtc('2026-01-05T09:05:59.9Z')).toBe('5 Jan 09:05 UTC')
  })

  it('converts an offset to UTC', () => {
    expect(formatUtc('2026-10-17T01:15:00+02:00')).toBe('16 Oct 23:15 UTC')
  })
})
