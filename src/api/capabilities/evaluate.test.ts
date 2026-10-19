import { describe, expect, it } from 'vitest'
import { type Rule, allows, allowsAnythingUnder, listablePrefixes, matches, readablePaths } from './evaluate'

describe('listablePrefixes', () => {
  it('finds the folders a token may list', () => {
    const rules: Rule[] = [
      { path: 'secrets/dev/*', capabilities: ['read', 'list'] },
      { path: 'secrets/db/postgres/', capabilities: ['list'] },
      { path: 'secrets/ops/*', capabilities: ['read'] },
      { path: 'system/policies', capabilities: ['list'] },
    ]
    expect(listablePrefixes(rules, 'secrets/')).toEqual(['secrets/db/postgres/', 'secrets/dev/'])
  })

  it('finds the whole area when everything is listable', () => {
    expect(listablePrefixes([{ path: '*', capabilities: ['list'] }], 'secrets/')).toEqual([])
    expect(listablePrefixes([{ path: 'secrets/*', capabilities: ['list'] }], 'secrets/')).toEqual(['secrets/'])
  })

  it('leaves out a prefix a deny covers', () => {
    const rules: Rule[] = [
      { path: 'secrets/dev/*', capabilities: ['list'] },
      { path: 'secrets/dev/*', capabilities: ['deny'] },
    ]
    expect(listablePrefixes(rules, 'secrets/')).toEqual([])
  })

  it('leaves out a prefix inside another', () => {
    const rules: Rule[] = [
      { path: 'secrets/dev/*', capabilities: ['list'] },
      { path: 'secrets/dev/api/*', capabilities: ['list'] },
    ]
    expect(listablePrefixes(rules, 'secrets/')).toEqual(['secrets/dev/'])
  })
})

describe('readablePaths', () => {
  it('finds single secrets the rules name and let the token read', () => {
    const rules: Rule[] = [
      { path: 'secrets/token', capabilities: ['read', 'list'] },
      { path: 'secrets/ops/key', capabilities: ['read'] },
      { path: 'secrets/dev/*', capabilities: ['read'] },
      { path: 'secrets/db/', capabilities: ['read'] },
      { path: 'system/seal', capabilities: ['read'] },
    ]
    expect(readablePaths(rules, 'secrets/')).toEqual(['secrets/ops/key', 'secrets/token'])
  })

  it('leaves out one it may not read', () => {
    const rules: Rule[] = [
      { path: 'secrets/token', capabilities: ['list'] },
      { path: 'secrets/key', capabilities: ['read'] },
      { path: 'secrets/*', capabilities: ['deny'] },
    ]
    expect(readablePaths(rules, 'secrets/')).toEqual([])
  })
})

describe('matches', () => {
  it('matches a path exactly', () => {
    expect(matches('secrets/dev/key', 'secrets/dev/key')).toBe(true)
    expect(matches('secrets/dev/key', 'secrets/dev/key2')).toBe(false)
    expect(matches('secrets/dev', 'secrets/dev/key')).toBe(false)
  })

  it('matches a starred pattern as a plain prefix', () => {
    expect(matches('secrets/dev/*', 'secrets/dev/key')).toBe(true)
    expect(matches('secrets/dev/*', 'secrets/dev/')).toBe(true)
    expect(matches('secrets/dev/*', 'secrets/dev')).toBe(false)
    expect(matches('secrets/dev*', 'secrets/devx/key')).toBe(true)
    expect(matches('*', 'system/seal')).toBe(true)
  })
})

describe('allows', () => {
  // The rules of design/Policies.dc.html's dev-read example.
  const devRead: Rule[] = [
    { path: 'secrets/dev/*', capabilities: ['read', 'list'] },
    { path: 'secrets/shared/config/*', capabilities: ['read', 'list'] },
    { path: 'secrets/dev/feature-flags', capabilities: ['read', 'update'] },
    { path: 'secrets/db/postgres/*', capabilities: ['list'] },
    { path: 'secrets/dev/admin-key', capabilities: ['deny'] },
  ]

  it('allows what a matching rule grants', () => {
    expect(allows(devRead, 'secrets/dev/feature-flags', 'read')).toBe(true)
    expect(allows(devRead, 'secrets/dev/feature-flags', 'update')).toBe(true)
    expect(allows(devRead, 'secrets/db/postgres/', 'list')).toBe(true)
  })

  it('refuses what no rule grants', () => {
    expect(allows(devRead, 'secrets/dev/other', 'update')).toBe(false)
    expect(allows(devRead, 'secrets/db/postgres/billing-user', 'read')).toBe(false)
    expect(allows(devRead, 'system/seal', 'update')).toBe(false)
    expect(allows([], 'secrets/x', 'read')).toBe(false)
  })

  it('lets a matching deny refuse every capability', () => {
    expect(allows(devRead, 'secrets/dev/admin-key', 'read')).toBe(false)
    expect(allows([{ path: '*', capabilities: ['read', 'deny'] }], 'secrets/x', 'read')).toBe(false)
  })

  it('never treats deny as a capability that is granted', () => {
    expect(allows([{ path: '*', capabilities: ['deny'] }], 'secrets/x', 'deny')).toBe(false)
  })
})

describe('allowsAnythingUnder', () => {
  it('sees grants below, at or above the prefix', () => {
    expect(allowsAnythingUnder([{ path: 'secrets/dev/*', capabilities: ['read'] }], 'secrets/')).toBe(true)
    expect(allowsAnythingUnder([{ path: 'secrets/dev/key', capabilities: ['read'] }], 'secrets/')).toBe(true)
    expect(allowsAnythingUnder([{ path: '*', capabilities: ['list'] }], 'secrets/')).toBe(true)
  })

  it('sees nothing when grants are elsewhere, or a deny covers the prefix', () => {
    expect(allowsAnythingUnder([{ path: 'system/policies', capabilities: ['list'] }], 'secrets/')).toBe(false)
    expect(
      allowsAnythingUnder(
        [
          { path: 'secrets/dev/*', capabilities: ['read'] },
          { path: 'secrets/*', capabilities: ['deny'] },
        ],
        'secrets/',
      ),
    ).toBe(false)
  })

  it('can ask about one capability', () => {
    const rules: Rule[] = [{ path: 'secrets/dev/*', capabilities: ['read', 'list'] }]
    expect(allowsAnythingUnder(rules, 'secrets/', 'read')).toBe(true)
    expect(allowsAnythingUnder(rules, 'secrets/', 'create')).toBe(false)
  })

  it('does not let a narrower deny hide the whole area', () => {
    expect(
      allowsAnythingUnder(
        [
          { path: 'secrets/*', capabilities: ['read'] },
          { path: 'secrets/dev/*', capabilities: ['deny'] },
        ],
        'secrets/',
      ),
    ).toBe(true)
  })
})
