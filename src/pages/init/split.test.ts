import { describe, expect, it } from 'vitest'
import { checkSplit, diagramBoxes } from './split'

describe('checkSplit', () => {
  it('accepts the design defaults and the limits', () => {
    expect(checkSplit('5', '3')).toEqual({ ok: true, shares: 5, threshold: 3 })
    expect(checkSplit('2', '2')).toEqual({ ok: true, shares: 2, threshold: 2 })
    expect(checkSplit('255', '255')).toEqual({ ok: true, shares: 255, threshold: 255 })
  })

  it('refuses counts outside 2 to 255', () => {
    expect(checkSplit('1', '1')).toEqual({
      ok: false,
      errors: { shares: 'A whole number from 2 to 255.', threshold: 'A whole number from 2 to 255.' },
    })
    expect(checkSplit('256', '3')).toEqual({ ok: false, errors: { shares: 'A whole number from 2 to 255.' } })
  })

  it('refuses anything but a whole number', () => {
    for (const text of ['', ' ', '3.5', '-3', '1e1', 'five']) {
      expect(checkSplit(text, '2')).toEqual({ ok: false, errors: { shares: 'A whole number from 2 to 255.' } })
    }
  })

  it('refuses a threshold above the share count', () => {
    expect(checkSplit('3', '4')).toEqual({ ok: false, errors: { threshold: 'At most the share count, 3.' } })
  })

  it('does not compare against shares that are themselves invalid', () => {
    expect(checkSplit('x', '4')).toEqual({ ok: false, errors: { shares: 'A whole number from 2 to 255.' } })
  })
})

describe('diagramBoxes', () => {
  it('draws every share up to eight', () => {
    expect(diagramBoxes(5)).toEqual([1, 2, 3, 4, 5])
    expect(diagramBoxes(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('elides the middle of a larger split', () => {
    expect(diagramBoxes(255)).toEqual([1, 2, 3, 4, 5, 6, null, 255])
  })
})
