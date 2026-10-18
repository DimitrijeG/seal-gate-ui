import { describe, expect, it } from 'vitest'
import { MASK, maskBody, maskJson } from './mask'

describe('maskJson', () => {
  it('masks the init response and keeps the share count', () => {
    expect(maskJson({ shares: ['a', 'b', 'c'], root_token: 't' })).toEqual({
      shares: [MASK, MASK, MASK],
      root_token: MASK,
    })
  })

  it('masks a share, a token, a password and a secret value', () => {
    expect(maskJson({ share: 's' })).toEqual({ share: MASK })
    expect(maskJson({ token: 't', expires_at: '2026-10-16T12:00:00Z' })).toEqual({
      token: MASK,
      expires_at: '2026-10-16T12:00:00Z',
    })
    expect(maskJson({ entity_id: 'e', password: 'p' })).toEqual({ entity_id: 'e', password: MASK })
    expect(maskJson({ value: 'dmFsdWU=', generated: true, ttl: 60 })).toEqual({
      value: MASK,
      generated: true,
      ttl: 60,
    })
  })

  it('leaves an empty secret value visible', () => {
    expect(maskJson({ value: '' })).toEqual({ value: '' })
  })

  it('masks at any depth', () => {
    expect(maskJson({ outer: [{ token: 't' }] })).toEqual({ outer: [{ token: MASK }] })
  })

  it('masks an object or null under a secret key', () => {
    expect(maskJson({ token: { nested: 'x' } })).toEqual({ token: MASK })
    expect(maskJson({ value: null })).toEqual({ value: MASK })
  })

  it('shows counts and flags under a secret key', () => {
    expect(maskJson({ shares: 5, threshold: 3 })).toEqual({ shares: 5, threshold: 3 })
    expect(maskJson({ reset: true, share: false })).toEqual({ reset: true, share: false })
  })

  it('leaves bodies without secrets alone', () => {
    const status = { initialized: true, sealed: false, shares: 5, threshold: 3, progress: 0 }
    expect(maskJson(status)).toEqual(status)
    expect(maskJson({ errors: ['permission denied'] })).toEqual({ errors: ['permission denied'] })
    expect(maskJson({ paths: ['db/password'] })).toEqual({ paths: ['db/password'] })
  })
})

describe('maskBody', () => {
  it('masks JSON text', () => {
    expect(maskBody('{"password":"hunter2","username":"alice"}')).toBe(
      `{"password":"${MASK}","username":"alice"}`,
    )
  })

  it('never shows a body that is not JSON', () => {
    expect(maskBody('secret text')).toBe('(not JSON, 11 bytes)')
  })

  it('returns an empty body as empty', () => {
    expect(maskBody('')).toBe('')
  })
})
