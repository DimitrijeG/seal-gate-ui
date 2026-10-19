import { describe as group, expect, it } from 'vitest'
import { type Row, checked, describe, reshape, rowProblem, toPath, toRow } from './areas'

const row = (path: string, capabilities: Row['capabilities'] = ['read']) => toRow({ path, capabilities })

group('toRow', () => {
  it('reads each kind of path into its area and scope', () => {
    const cases: [string, Partial<Row>][] = [
      ['*', { area: 'everything', scope: 'all' }],
      ['system/seal', { area: 'seal', scope: 'all' }],
      ['secrets/*', { area: 'secrets', scope: 'all', target: '' }],
      ['secrets/dev/*', { area: 'secrets', scope: 'folder', target: 'dev' }],
      ['secrets/dev/api/*', { area: 'secrets', scope: 'folder', target: 'dev/api' }],
      ['secrets/token', { area: 'secrets', scope: 'one', target: 'token' }],
      ['secrets/dev/key', { area: 'secrets', scope: 'one', target: 'dev/key' }],
      ['system/entities', { area: 'entities', scope: 'collection' }],
      ['system/entities/*', { area: 'entities', scope: 'all' }],
      ['system/entities/ab12', { area: 'entities', scope: 'one', target: 'ab12' }],
      ['system/entities/ab12/tokens', { area: 'entities', scope: 'tokens', target: 'ab12' }],
      ['system/groups/*', { area: 'groups', scope: 'all' }],
      ['system/users/dana', { area: 'users', scope: 'one', target: 'dana' }],
      ['system/policies', { area: 'policies', scope: 'collection' }],
    ]
    for (const [path, want] of cases) expect(row(path), path).toMatchObject(want)
  })

  it('keeps any other path as custom', () => {
    for (const path of ['secrets/dev*', 'secrets/dev/', 'secrets/', 'system/*', 'system/entitiesx', 'system/policies/a/b', 'other/x']) {
      expect(row(path), path).toMatchObject({ area: 'custom', target: path })
    }
  })

  it('writes back exactly the path it read', () => {
    for (const path of [
      '*',
      'system/seal',
      'secrets/*',
      'secrets/dev/*',
      'secrets/a/b/c',
      'system/entities',
      'system/entities/*',
      'system/entities/x/tokens',
      'system/users/dana',
      'secrets/dev*',
      'system/*',
    ]) {
      expect(toPath(row(path)), path).toBe(path)
    }
  })
})

group('toPath', () => {
  it('drops a trailing slash from a folder', () => {
    expect(toPath({ area: 'secrets', scope: 'folder', target: 'dev/', capabilities: [] })).toBe('secrets/dev/*')
  })
})

group('reshape', () => {
  it('starts a new area at its first scope, without a target', () => {
    expect(reshape(row('secrets/dev/key'), 'policies')).toMatchObject({ area: 'policies', scope: 'all', target: '' })
  })

  it('keeps the target when the new scope also needs one', () => {
    expect(reshape(row('secrets/dev/key'), 'secrets', 'folder')).toMatchObject({ scope: 'folder', target: 'dev/key' })
  })

  it('turns a row into its path when it becomes custom', () => {
    expect(reshape(row('secrets/dev/*'), 'custom')).toMatchObject({ area: 'custom', target: 'secrets/dev/*' })
  })

  it('drops capabilities the new place never checks', () => {
    const before = row('secrets/*', ['read', 'list', 'rotate', 'deny'])
    expect(reshape(before, 'policies', 'collection').capabilities).toEqual(['list', 'deny'])
  })
})

group('checked', () => {
  it('offers only what seal-gate checks there', () => {
    expect(checked('seal', 'all')).toEqual(['update', 'deny'])
    expect(checked('policies', 'collection')).toEqual(['list', 'deny'])
    expect(checked('entities', 'tokens')).toEqual(['create', 'deny'])
    expect(checked('entities', 'one')).not.toContain('create')
  })
})

group('rowProblem', () => {
  it('asks for the target a scope needs', () => {
    expect(rowProblem({ area: 'secrets', scope: 'folder', target: ' ', capabilities: ['read'] })).toBe('Enter a folder.')
    expect(rowProblem({ area: 'users', scope: 'one', target: '', capabilities: ['read'] })).toBe('Enter a username.')
  })

  it('refuses a name with a slash where one segment is meant', () => {
    expect(rowProblem({ area: 'groups', scope: 'one', target: 'a/b', capabilities: ['read'] })).toBe(
      'The group ID is one segment, without / or *.',
    )
  })

  it('refuses a star in a secret path', () => {
    expect(rowProblem({ area: 'secrets', scope: 'one', target: 'dev*', capabilities: ['read'] })).toBe(
      'No * in a secret path: pick a scope instead.',
    )
  })

  it('asks for a capability', () => {
    expect(rowProblem({ area: 'seal', scope: 'all', target: '', capabilities: [] })).toBe('Tick at least one capability.')
  })

  it('accepts a complete row', () => {
    expect(rowProblem(row('secrets/dev/*', ['read', 'list']))).toBeNull()
  })
})

group('describe', () => {
  it('says what the rule lets the token do, on what', () => {
    expect(describe(row('secrets/dev/*', ['read', 'list']))).toBe('Read and list every secret in dev/.')
    expect(describe(row('secrets/token', ['read']))).toBe('Read the secret token.')
    expect(describe(row('system/policies', ['list']))).toBe('List policies.')
    expect(describe(row('system/entities', ['create', 'list']))).toBe('Create and list entities.')
    expect(describe(row('system/entities/*', ['read', 'create']))).toBe('Read and issue tokens for every entity.')
    expect(describe(row('system/entities/ab/tokens', ['create']))).toBe('Issue tokens for entity ab.')
    expect(describe(row('system/seal', ['update']))).toBe('Seal the instance.')
  })

  it('says a deny refuses everything', () => {
    expect(describe(row('secrets/dev/admin-key', ['deny']))).toBe(
      'Refuses everything on the secret dev/admin-key, whatever other rules grant.',
    )
  })

  it('says an empty rule grants nothing', () => {
    expect(describe(row('secrets/*', []))).toBe('Grants nothing yet.')
  })
})
