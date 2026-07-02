import { describe, it, expect } from 'vitest'
import { getFinancialYear, getFinancialYearBounds, formatFyNumber } from './financial-year.js'

describe('getFinancialYear', () => {
  it('maps April onward to the FY starting that calendar year', () => {
    expect(getFinancialYear(new Date('2026-04-01')).label).toBe('2026-27')
    expect(getFinancialYear(new Date('2026-12-31')).label).toBe('2026-27')
  })

  it('maps Jan–Mar to the FY that started the previous calendar year', () => {
    expect(getFinancialYear(new Date('2026-01-15')).label).toBe('2025-26')
    expect(getFinancialYear(new Date('2026-03-31')).label).toBe('2025-26')
  })

  it('flips exactly at the Mar→Apr boundary (UTC)', () => {
    expect(getFinancialYear(new Date('2026-03-31T23:59:59Z')).startYear).toBe(2025)
    expect(getFinancialYear(new Date('2026-04-01T00:00:00Z')).startYear).toBe(2026)
  })

  it('produces the 2-digit end-year label', () => {
    expect(getFinancialYear(new Date('2029-06-01')).label).toBe('2029-30')
  })
})

describe('getFinancialYearBounds', () => {
  it('returns Apr 1 (inclusive) to next Apr 1 (exclusive) in UTC', () => {
    const { from, to } = getFinancialYearBounds(new Date('2026-06-29'))
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2027-04-01T00:00:00.000Z')
  })

  it('a Jan date falls inside the bounds of the FY that started last year', () => {
    const jan = new Date('2026-01-15')
    const { from, to } = getFinancialYearBounds(jan)
    expect(jan >= from && jan < to).toBe(true)
    expect(from.getUTCFullYear()).toBe(2025)
  })
})

describe('formatFyNumber', () => {
  it('zero-pads the sequence to 5 by default', () => {
    expect(formatFyNumber('INV', '2025-26', 42)).toBe('INV/2025-26/00042')
  })

  it('respects a custom pad width and does not truncate overflow', () => {
    expect(formatFyNumber('PO', '2025-26', 7, 3)).toBe('PO/2025-26/007')
    expect(formatFyNumber('PO', '2025-26', 123456, 5)).toBe('PO/2025-26/123456')
  })
})
