import { describe, expect, it } from 'vitest'
import type { Rule } from '../../api/capabilities/evaluate'
import { COLUMNS, cellChanged, countChanges, nameProblem, rulePathProblem, toggle } from './rules'

describe('COLUMNS', () => {
  it('has a column for every capability', () => {
    expect(COLUMNS).toEqual(['create', 'read', 'update', 'delete', 'list', 'rotate', 'deny'])
  })
})

describe('nameProblem', () => {
  it('accepts a valid name', () => {
    expect(nameProblem('dev-read')).toBeNull()
    expect(nameProblem('A.b_9')).toBeNull()
  })

  it('refuses what seal-gate refuses', () => {
    expect(nameProblem('')).toBe('Enter a name.')
    expect(nameProblem('a/b')).toBe('One segment of A–Z a–z 0–9 . _ -, not . or ..')
    expect(nameProblem('..')).toBe('One segment of A–Z a–z 0–9 . _ -, not . or ..')
    expect(nameProblem('x'.repeat(129))).toBe('At most 128 bytes.')
  })
})

describe('rulePathProblem', () => {
  it('accepts paths and prefixes ending in *', () => {
    for (const p of ['secrets/dev/key', 'secrets/dev/*', 'secrets/dev*', 'system/policies', '*']) {
      expect(rulePathProblem(p)).toBeNull()
    }
  })

  it('refuses * anywhere but the end, and bad segments', () => {
    expect(rulePathProblem('secrets/*/key')).toBe('* only at the end.')
    expect(rulePathProblem('secrets//x')).toBe('Segments of A–Z a–z 0–9 . _ - separated by /.')
    expect(rulePathProblem('/secrets')).toBe('Segments of A–Z a–z 0–9 . _ - separated by /.')
    expect(rulePathProblem('secrets/../x')).toBe('Segments of A–Z a–z 0–9 . _ - separated by /.')
    expect(rulePathProblem('secrets//*')).toBe('Segments of A–Z a–z 0–9 . _ - separated by /.')
    expect(rulePathProblem('')).toBe('Enter a path.')
    expect(rulePathProblem('x'.repeat(258))).toBe('At most 257 bytes.')
  })
})

describe('changes', () => {
  const saved: Rule[] = [
    { path: 'secrets/dev/*', capabilities: ['read', 'list'] },
    { path: 'secrets/dev/admin-key', capabilities: ['deny'] },
  ]

  it('counts nothing for an unchanged draft', () => {
    expect(countChanges(saved, saved)).toBe(0)
  })

  it('counts each square, path and added or removed rule', () => {
    const draft: Rule[] = [toggle(toggle(saved[0]!, 'read'), 'update'), { ...saved[1]!, path: 'secrets/dev/other' }]
    expect(countChanges(saved, draft)).toBe(3)
    expect(cellChanged(saved, draft, 0, 'read')).toBe(true)
    expect(cellChanged(saved, draft, 0, 'list')).toBe(false)
    expect(countChanges(saved, [...draft, { path: '', capabilities: [] }])).toBe(4)
    expect(countChanges(saved, [saved[0]!])).toBe(1)
  })
})
