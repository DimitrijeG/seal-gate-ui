import { describe, expect, it } from 'vitest'
import { can, canAnythingUnder, offers } from './capabilities'

describe('can', () => {
  const rules = [{ path: 'system/seal', capabilities: ['update' as const] }]

  it('answers yes for the root', () => {
    expect(can({ state: 'root' }, 'delete', 'system/policies/x')).toBe('yes')
  })

  it('answers from the rules once they are known', () => {
    expect(can({ state: 'rules', rules }, 'update', 'system/seal')).toBe('yes')
    expect(can({ state: 'rules', rules }, 'read', 'system/seal')).toBe('no')
  })

  it('is pending until the rules are read, and unknown when they could not be', () => {
    expect(can({ state: 'none' }, 'update', 'system/seal')).toBe('pending')
    expect(can({ state: 'loading' }, 'update', 'system/seal')).toBe('pending')
    expect(can({ state: 'unknown' }, 'update', 'system/seal')).toBe('unknown')
  })
})

describe('offers', () => {
  it('offers yes and unknown, never no or pending', () => {
    expect(offers('yes')).toBe(true)
    expect(offers('unknown')).toBe(true)
    expect(offers('no')).toBe(false)
    expect(offers('pending')).toBe(false)
  })
})

describe('canAnythingUnder', () => {
  it('answers for a whole area', () => {
    const rules = [{ path: 'secrets/dev/*', capabilities: ['read' as const] }]
    expect(canAnythingUnder({ state: 'rules', rules }, 'secrets/')).toBe('yes')
    expect(canAnythingUnder({ state: 'rules', rules }, 'system/policies')).toBe('no')
    expect(canAnythingUnder({ state: 'root' }, 'system/')).toBe('yes')
    expect(canAnythingUnder({ state: 'unknown' }, 'secrets/')).toBe('unknown')
  })
})
