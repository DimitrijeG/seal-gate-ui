import { describe, expect, it } from 'vitest'
import { serializePath } from './paths'

describe('serializePath', () => {
  it('keeps the slashes of a secret path', () => {
    expect(serializePath('/secrets/{path}', { path: 'db/postgres/app-user' })).toBe(
      '/secrets/db/postgres/app-user',
    )
  })

  it('encodes within each segment of a secret path', () => {
    expect(serializePath('/secrets/{path}', { path: 'a b/c?d' })).toBe('/secrets/a%20b/c%3Fd')
  })

  it('fully encodes any other parameter', () => {
    expect(serializePath('/policies/{name}', { name: 'a/b' })).toBe('/policies/a%2Fb')
    expect(serializePath('/entities/{id}/tokens', { id: '0123abcd' })).toBe('/entities/0123abcd/tokens')
  })

  it('leaves a placeholder without a value', () => {
    expect(serializePath('/policies/{name}', {})).toBe('/policies/{name}')
  })
})
