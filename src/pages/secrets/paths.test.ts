import { describe, expect, it } from 'vitest'
import { baseName, decodedLength, folderView, formatDuration, parseLocation, pathProblem } from './paths'

describe('pathProblem', () => {
  it('accepts valid paths', () => {
    expect(pathProblem('db/password')).toBeNull()
    expect(pathProblem('a.b_c-D/9')).toBeNull()
    expect(pathProblem('x'.repeat(256))).toBeNull()
  })

  it('refuses what seal-gate refuses', () => {
    expect(pathProblem('')).toBe('Enter a path.')
    expect(pathProblem('/db')).toBe('No leading or trailing slash.')
    expect(pathProblem('db/')).toBe('No leading or trailing slash.')
    expect(pathProblem('db//x')).toBe('No empty segment between slashes.')
    expect(pathProblem('db/../x')).toBe('No . or .. segment.')
    expect(pathProblem('db/a b')).toBe('Only A–Z a–z 0–9 . _ - and / between segments.')
    expect(pathProblem('x'.repeat(257))).toBe('At most 256 bytes.')
  })
})

describe('parseLocation', () => {
  it('reads a folder or a selected secret', () => {
    expect(parseLocation('')).toEqual({ folder: '', selected: null })
    expect(parseLocation('db/postgres/')).toEqual({ folder: 'db/postgres/', selected: null })
    expect(parseLocation('db/postgres/app')).toEqual({ folder: 'db/postgres/', selected: 'db/postgres/app' })
    expect(parseLocation('top')).toEqual({ folder: '', selected: 'top' })
  })
})

describe('folderView', () => {
  const paths = ['api/key', 'db/postgres/app', 'db/postgres/replicas/one', 'db/redis', 'top']

  it('splits the top into folders with counts and secrets', () => {
    expect(folderView(paths, '')).toEqual({
      folders: [
        { name: 'api/', count: 1 },
        { name: 'db/', count: 3 },
      ],
      secrets: ['top'],
    })
  })

  it('looks inside a folder', () => {
    expect(folderView(paths, 'db/')).toEqual({ folders: [{ name: 'postgres/', count: 2 }], secrets: ['db/redis'] })
    expect(folderView(paths, 'db/postgres/')).toEqual({
      folders: [{ name: 'replicas/', count: 1 }],
      secrets: ['db/postgres/app'],
    })
  })

  it('is empty for a folder nothing is under', () => {
    expect(folderView(paths, 'nope/')).toEqual({ folders: [], secrets: [] })
  })
})

describe('baseName', () => {
  it('returns the last segment', () => {
    expect(baseName('db/postgres/app')).toBe('app')
    expect(baseName('top')).toBe('top')
  })
})

describe('formatDuration', () => {
  it('uses the largest unit that divides evenly', () => {
    expect(formatDuration(604800)).toBe('7 days')
    expect(formatDuration(86400)).toBe('1 day')
    expect(formatDuration(3600)).toBe('1 hour')
    expect(formatDuration(5400)).toBe('90 minutes')
    expect(formatDuration(61)).toBe('61 seconds')
  })
})

describe('decodedLength', () => {
  it('counts decoded bytes', () => {
    expect(decodedLength('')).toBe(0)
    expect(decodedLength('AQ==')).toBe(1)
    expect(decodedLength('AQI=')).toBe(2)
    expect(decodedLength('AQID')).toBe(3)
    expect(decodedLength('A'.repeat(44))).toBe(33)
  })
})
