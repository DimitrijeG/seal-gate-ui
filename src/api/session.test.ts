import { describe, expect, it } from 'vitest'
import { toIdentity } from './session'

describe('toIdentity', () => {
  it('reads the root token', () => {
    expect(toIdentity({ root: true })).toEqual({ root: true })
  })

  it('reads an entity token, with or without an alias', () => {
    const id = '0123456789abcdef0123456789abcdef'
    expect(toIdentity({ entity_id: id, alias: 'alice', expires_at: '2026-10-16T11:30:00Z' })).toEqual({
      root: false,
      entityId: id,
      alias: 'alice',
      expiresAt: '2026-10-16T11:30:00Z',
    })
    expect(toIdentity({ entity_id: id, expires_at: '2026-10-16T11:30:00Z' })).toEqual({
      root: false,
      entityId: id,
      alias: null,
      expiresAt: '2026-10-16T11:30:00Z',
    })
  })

  it('refuses a shape the spec does not allow', () => {
    expect(toIdentity({})).toBeNull()
    expect(toIdentity({ root: false })).toBeNull()
    expect(toIdentity({ entity_id: '0123456789abcdef0123456789abcdef' })).toBeNull()
  })
})
