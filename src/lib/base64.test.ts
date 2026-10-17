import { describe, expect, it } from 'vitest'
import { encodeText, isBase64 } from './base64'

describe('encodeText', () => {
  it('encodes text as UTF-8 base64', () => {
    expect(encodeText('')).toBe('')
    expect(encodeText('hunter2')).toBe('aHVudGVyMg==')
    expect(encodeText('šđčćž')).toBe('xaHEkcSNxIfFvg==')
  })

  it('encodes a value too large to spread at once', () => {
    const big = 'a'.repeat(65536)
    expect(atob(encodeText(big))).toBe(big)
  })
})

describe('isBase64', () => {
  it('accepts standard base64, padded or a whole number of quads', () => {
    expect(isBase64('AQID')).toBe(true)
    expect(isBase64('AQI=')).toBe(true)
    expect(isBase64('AQ==')).toBe(true)
    expect(isBase64('iBIdHJ+72s+wtm6JNmwEnalBIKYeaVA62iI0LCrCHskB')).toBe(true)
  })

  it('ignores whitespace around a paste', () => {
    expect(isBase64('  AQID\n')).toBe(true)
  })

  it('refuses empty, unpadded, URL-safe and stray characters', () => {
    expect(isBase64('')).toBe(false)
    expect(isBase64('   ')).toBe(false)
    expect(isBase64('AQ')).toBe(false)
    expect(isBase64('AQ-_')).toBe(false)
    expect(isBase64('AQ ID')).toBe(false)
    expect(isBase64('AQ=I')).toBe(false)
  })
})
