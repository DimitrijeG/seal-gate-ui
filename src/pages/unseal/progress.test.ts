import { describe, expect, it } from 'vitest'
import { secondsAgo, unsealProgress } from './progress'

describe('unsealProgress', () => {
  it('counts shares toward the threshold while sealed', () => {
    expect(unsealProgress({ initialized: true, sealed: true, shares: 5, threshold: 3, progress: 1 })).toEqual({
      text: '1 of 3 shares submitted',
      filled: 1,
      threshold: 3,
      unsealed: false,
    })
  })

  it('fills the bar once unsealed', () => {
    expect(unsealProgress({ initialized: true, sealed: false, shares: 5, threshold: 3, progress: 0 })).toEqual({
      text: 'Threshold met: key rebuilt',
      filled: 3,
      threshold: 3,
      unsealed: true,
    })
  })
})

describe('secondsAgo', () => {
  it('rounds down to whole seconds and never goes negative', () => {
    expect(secondsAgo(1000, 3999)).toBe(2)
    expect(secondsAgo(5000, 4000)).toBe(0)
  })
})
