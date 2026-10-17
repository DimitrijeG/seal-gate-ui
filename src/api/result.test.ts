import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OPEN_OPERATIONS } from './client'
import { call, errorMessages } from './result'

describe('errorMessages', () => {
  it('returns the server messages', () => {
    expect(errorMessages(403, { errors: ['permission denied'] })).toEqual(['permission denied'])
  })

  it('describes a body in another shape', () => {
    expect(errorMessages(502, '<html>Bad Gateway</html>')).toEqual(['The server answered 502 without an explanation.'])
    expect(errorMessages(500, { errors: [] })).toEqual(['The server answered 500 without an explanation.'])
  })
})

describe('call', () => {
  it('returns the data of a success', async () => {
    const response = new Response(null, { status: 200 })
    expect(await call(Promise.resolve({ data: { ok: 1 }, response }))).toEqual({ ok: true, data: { ok: 1 } })
  })

  it('returns the messages of an error', async () => {
    const response = new Response(null, { status: 409 })
    const result = await call(Promise.resolve({ error: { errors: ['already initialized'] }, response }))
    expect(result).toEqual({ ok: false, error: { kind: 'http', status: 409, messages: ['already initialized'] } })
  })

  it('reports a network failure', async () => {
    expect(await call(Promise.reject(new TypeError('Failed to fetch')))).toEqual({ ok: false, error: { kind: 'network' } })
  })

  it('reports a proxy that could not reach seal-gate as a network failure', async () => {
    for (const status of [502, 504]) {
      const response = new Response('Bad Gateway', { status })
      expect(await call(Promise.resolve({ error: 'Bad Gateway', response }))).toEqual({
        ok: false,
        error: { kind: 'network' },
      })
    }
  })

  it('rethrows anything else', async () => {
    await expect(call(Promise.reject(new Error('bug')))).rejects.toThrow('bug')
  })
})

describe('OPEN_OPERATIONS', () => {
  it('matches the operations the spec marks open', () => {
    // Each path is a two-space-indented key; an open operation carries
    // `security: []` under it.
    const spec = readFileSync(new URL('../../api/openapi.yaml', import.meta.url), 'utf8')
    const open = new Set<string>()
    let path = ''
    for (const line of spec.split('\n')) {
      const key = /^ {2}(\/\S*):\s*$/.exec(line)
      if (key?.[1]) path = key[1]
      else if (/^ {6}security: \[\]\s*$/.test(line)) open.add(path)
    }
    expect([...open].sort()).toEqual([...OPEN_OPERATIONS].sort())
  })
})
