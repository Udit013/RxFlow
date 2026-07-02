import { describe, it, expect } from 'vitest'
import { calculateOrderTotals, computeCommission } from './order-math.js'

describe('calculateOrderTotals', () => {
  it('computes a single line: qty × price − discount + GST', () => {
    // 10 × ₹100 = 1000, −5% = 950 taxable, +12% GST = 1064
    const t = calculateOrderTotals([{ quantity: 10, unitPrice: 100, discountPercent: 5, taxRate: 12 }])
    expect(t.subtotal).toBe(1000)
    expect(t.discountAmount).toBe(50)
    expect(t.taxAmount).toBeCloseTo(114)
    expect(t.total).toBeCloseTo(1064)
  })

  it('sums multiple lines with different GST rates', () => {
    const t = calculateOrderTotals([
      { quantity: 2, unitPrice: 121.98, discountPercent: 5, taxRate: 14 }, // real Torrent invoice line
      { quantity: 1, unitPrice: 321.9, discountPercent: 0, taxRate: 5 },
    ])
    expect(t.subtotal).toBeCloseTo(2 * 121.98 + 321.9)
    expect(t.discountAmount).toBeCloseTo(2 * 121.98 * 0.05)
    // per-line tax: (243.96 − 12.198) × 0.14 + 321.9 × 0.05
    expect(t.taxAmount).toBeCloseTo(231.762 * 0.14 + 321.9 * 0.05)
    expect(t.total).toBeCloseTo(t.subtotal - t.discountAmount + t.taxAmount)
  })

  it('handles zero discount and zero tax', () => {
    const t = calculateOrderTotals([{ quantity: 3, unitPrice: 50, discountPercent: 0, taxRate: 0 }])
    expect(t).toEqual({ subtotal: 150, discountAmount: 0, taxAmount: 0, total: 150 })
  })

  it('returns all-zero totals for an empty order', () => {
    expect(calculateOrderTotals([])).toEqual({ subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 })
  })
})

describe('computeCommission', () => {
  it('is charged on net value (subtotal − discount), excluding tax', () => {
    // 2% of (1000 − 50) = 19
    expect(computeCommission({ subtotal: 1000, discountAmount: 50 }, 2)).toBeCloseTo(19)
  })

  it('supports fractional percentages like 0.5%', () => {
    expect(computeCommission({ subtotal: 2000, discountAmount: 0 }, 0.5)).toBeCloseTo(10)
  })

  it('adds the flat per-order bonus on top', () => {
    expect(computeCommission({ subtotal: 1000, discountAmount: 0 }, 2, 25)).toBeCloseTo(45)
  })

  it('is zero for a 0% commission with no bonus (direct bill semantics)', () => {
    expect(computeCommission({ subtotal: 5000, discountAmount: 100 }, 0)).toBe(0)
  })
})
