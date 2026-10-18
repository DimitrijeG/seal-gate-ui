import { describe, expect, it } from 'vitest'
import { LIMIT, addEntry } from './trace'

const status = { method: 'GET', path: '/v1/sys/status', status: 200, request: '', response: '{"sealed":true}' }

describe('addEntry', () => {
  it('puts the newest entry first', () => {
    const first = addEntry([], status)
    const second = addEntry(first, { ...status, path: '/v1/sys/health', status: 503 })
    expect(second.map((e) => e.path)).toEqual(['/v1/sys/health', '/v1/sys/status'])
  })

  it('folds an identical repeat into the newest entry', () => {
    const entries = addEntry(addEntry([], status), status)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.repeats).toBe(2)
  })

  it('starts a new entry when anything differs', () => {
    const entries = addEntry(addEntry([], status), { ...status, response: '{"sealed":false}' })
    expect(entries).toHaveLength(2)
  })

  it('folds only into the newest entry', () => {
    let entries = addEntry([], status)
    entries = addEntry(entries, { ...status, path: '/v1/policies' })
    entries = addEntry(entries, status)
    expect(entries).toHaveLength(3)
  })

  it('keeps at most LIMIT entries', () => {
    let entries = addEntry([], status)
    for (let i = 0; i < LIMIT + 5; i++) entries = addEntry(entries, { ...status, path: `/v1/x${i}` })
    expect(entries).toHaveLength(LIMIT)
    expect(entries[0]?.path).toBe(`/v1/x${LIMIT + 4}`)
  })
})
