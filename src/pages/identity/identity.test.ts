import { describe, expect, it } from 'vitest'
import {
  type Summary,
  aliasProblem,
  customTtl,
  groupPills,
  inheritedPolicies,
  label,
  matches,
  passwordProblem,
  shortId,
  userMatches,
  usernameProblem,
} from './identity'

describe('aliasProblem', () => {
  it('accepts an alias seal-gate stores, and no alias at all', () => {
    expect(aliasProblem('alice')).toBeNull()
    expect(aliasProblem('payments-api')).toBeNull()
    expect(aliasProblem('a.b_9-c')).toBeNull()
    expect(aliasProblem('')).toBeNull()
  })

  it('refuses what seal-gate refuses', () => {
    expect(aliasProblem('Alice')).toBe('Lowercase a–z 0–9 . _ - only.')
    expect(aliasProblem('a b')).toBe('Lowercase a–z 0–9 . _ - only.')
    expect(aliasProblem('a/b')).toBe('Lowercase a–z 0–9 . _ - only.')
    expect(aliasProblem('.')).toBe('Not . or ..')
    expect(aliasProblem('..')).toBe('Not . or ..')
    expect(aliasProblem('x'.repeat(129))).toBe('At most 128 bytes.')
  })

  it('counts bytes, not characters', () => {
    expect(aliasProblem('é'.repeat(65))).toBe('At most 128 bytes.')
  })
})

describe('usernameProblem', () => {
  it('accepts a username seal-gate stores', () => {
    expect(usernameProblem('alice')).toBeNull()
    expect(usernameProblem('ana.oncall')).toBeNull()
  })

  it('refuses an empty one, unlike an alias', () => {
    expect(usernameProblem('')).toBe('Enter a username.')
    expect(usernameProblem('Alice')).toBe('Lowercase a–z 0–9 . _ - only.')
    expect(usernameProblem('..')).toBe('Not . or ..')
    expect(usernameProblem('x'.repeat(129))).toBe('At most 128 bytes.')
  })
})

describe('passwordProblem', () => {
  it('accepts 1 to 1024 bytes', () => {
    expect(passwordProblem('demo-password')).toBeNull()
    expect(passwordProblem('x'.repeat(1024))).toBeNull()
  })

  it('refuses nothing typed and more than the bound', () => {
    expect(passwordProblem('')).toBe('Enter a password.')
    expect(passwordProblem('x'.repeat(1025))).toBe(
      'Longer than any password seal-gate accepts (1024 bytes).',
    )
    expect(passwordProblem('é'.repeat(513))).toBe(
      'Longer than any password seal-gate accepts (1024 bytes).',
    )
  })
})

describe('label', () => {
  const id = '3f9c0a7e51d24b8c9e6f1a2b3c4d5e6f'

  it('uses the alias when there is one', () => {
    expect(label({ id, alias: 'alice' }, 'entity')).toBe('alice')
  })

  it('falls back to the start of the ID, named by kind', () => {
    expect(label({ id }, 'entity')).toBe('entity 3f9c0a7e')
    expect(label({ id }, 'group')).toBe('group 3f9c0a7e')
    expect(shortId(id)).toBe('3f9c0a7e')
  })
})

describe('matches', () => {
  const alice: Summary = { id: '3f9c0a7e51d24b8c9e6f1a2b3c4d5e6f', alias: 'alice' }
  const nameless: Summary = { id: '8a1e4c2f90b37d65e1f0a9b8c7d6e5f4' }

  it('matches everything while nothing is typed', () => {
    expect(matches(alice, '')).toBe(true)
    expect(matches(nameless, '   ')).toBe(true)
  })

  it('matches by name, ignoring case', () => {
    expect(matches(alice, 'ALI')).toBe(true)
    expect(matches(alice, 'bob')).toBe(false)
  })

  it('matches by ID, so a nameless one can be found', () => {
    expect(matches(nameless, '8a1e')).toBe(true)
    expect(matches(nameless, 'alice')).toBe(false)
  })
})

describe('groupPills', () => {
  const developers: Summary = { id: 'aaaa1111aaaa1111aaaa1111aaaa1111', alias: 'developers' }
  const nameless: Summary = { id: 'bbbb2222bbbb2222bbbb2222bbbb2222' }

  it('names each group from the list', () => {
    expect(groupPills([developers.id, nameless.id], [developers, nameless])).toEqual([
      { id: developers.id, name: 'developers', deleted: false },
      { id: nameless.id, name: 'group bbbb2222', deleted: false },
    ])
  })

  it('marks an ID the list does not hold as deleted', () => {
    expect(groupPills(['cccc3333cccc3333cccc3333cccc3333'], [developers])).toEqual([
      { id: 'cccc3333cccc3333cccc3333cccc3333', name: 'Deleted group cccc3333', deleted: true },
    ])
  })

  it('marks none as deleted when groups cannot be listed', () => {
    expect(groupPills([developers.id], null)).toEqual([
      { id: developers.id, name: 'group aaaa1111', deleted: false },
    ])
  })
})

describe('inheritedPolicies', () => {
  it('lists what the groups bring, with the groups that bring it', () => {
    expect(
      inheritedPolicies([], [
        { group: 'developers', policies: ['dev-read', 'dev-write'] },
        { group: 'on-call', policies: ['ops-admin'] },
      ]),
    ).toEqual([
      { name: 'dev-read', from: ['developers'] },
      { name: 'dev-write', from: ['developers'] },
      { name: 'ops-admin', from: ['on-call'] },
    ])
  })

  it('gathers every group that brings the same policy', () => {
    expect(
      inheritedPolicies([], [
        { group: 'auditors', policies: ['audit-read'] },
        { group: 'on-call', policies: ['audit-read'] },
      ]),
    ).toEqual([{ name: 'audit-read', from: ['auditors', 'on-call'] }])
  })

  it('leaves out a policy the entity already holds directly', () => {
    expect(
      inheritedPolicies(['dev-read'], [{ group: 'developers', policies: ['dev-read', 'dev-write'] }]),
    ).toEqual([{ name: 'dev-write', from: ['developers'] }])
  })

  it('is empty without groups', () => {
    expect(inheritedPolicies(['dev-read'], [])).toEqual([])
  })
})

describe('customTtl', () => {
  it('converts minutes and hours to seconds', () => {
    expect(customTtl('90', 'minutes')).toEqual({ seconds: 5400 })
    expect(customTtl('2', 'hours')).toEqual({ seconds: 7200 })
    expect(customTtl(' 1 ', 'minutes')).toEqual({ seconds: 60 })
  })

  it('refuses what is not a whole number of them', () => {
    expect(customTtl('', 'minutes')).toEqual({ problem: 'Enter a number.' })
    expect(customTtl('1.5', 'hours')).toEqual({ problem: 'Whole minutes or hours.' })
    expect(customTtl('-5', 'minutes')).toEqual({ problem: 'Whole minutes or hours.' })
    expect(customTtl('0', 'hours')).toEqual({ problem: 'At least 1.' })
  })

  it('offers a lifetime above the server default, which the server refuses itself', () => {
    expect(customTtl('72', 'hours')).toEqual({ seconds: 259200 })
  })
})

describe('userMatches', () => {
  const user = { name: 'ana.oncall', entity_id: 'aaaa1111aaaa1111aaaa1111aaaa1111' }

  it('matches by username', () => {
    expect(userMatches(user, 'ops-oncall', 'ana')).toBe(true)
  })

  it('matches by the entity it signs in as, by name or ID', () => {
    expect(userMatches(user, 'ops-oncall', 'OPS')).toBe(true)
    expect(userMatches(user, 'ops-oncall', 'aaaa1111')).toBe(true)
  })

  it('does not match something neither holds', () => {
    expect(userMatches(user, 'ops-oncall', 'alice')).toBe(false)
  })
})
