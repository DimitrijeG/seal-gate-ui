import { describe, expect, it } from 'vitest'
import type { Status } from '../api/client'
import { navItems, startPath } from './navigation'

const fresh: Status = { initialized: false, sealed: true, progress: 0 }
const sealed: Status = { initialized: true, sealed: true, shares: 5, threshold: 3, progress: 0 }
const unsealed: Status = { ...sealed, sealed: false }

const labels = (status: Status | null, signedIn: boolean) => navItems(status, signedIn).map((i) => i.label)

describe('navItems', () => {
  it('offers nothing while the status is unknown', () => {
    expect(labels(null, false)).toEqual([])
  })

  it('offers only Initialize before init', () => {
    expect(labels(fresh, false)).toEqual(['Initialize'])
    expect(labels(fresh, true)).toEqual(['Initialize'])
  })

  it('offers only Unseal while sealed or signed out', () => {
    expect(labels(sealed, true)).toEqual(['Unseal'])
    expect(labels(unsealed, false)).toEqual(['Unseal'])
  })

  it('offers the working screens once unsealed and signed in', () => {
    expect(labels(unsealed, true)).toEqual(['Unseal', 'Secrets', 'Identity', 'Policies'])
  })

  it('leaves out a working screen the token surely cannot use', () => {
    const items = navItems(unsealed, true, (to) => to !== '/policies').map((i) => i.label)
    expect(items).toEqual(['Unseal', 'Secrets', 'Identity'])
  })
})

describe('startPath', () => {
  it('waits for the status', () => {
    expect(startPath(null, true)).toBeNull()
  })

  it('opens on the first step still needed', () => {
    expect(startPath(fresh, false)).toBe('/init')
    expect(startPath(sealed, true)).toBe('/unseal')
    expect(startPath(unsealed, false)).toBe('/login')
    expect(startPath(unsealed, true)).toBe('/secrets')
  })
})
