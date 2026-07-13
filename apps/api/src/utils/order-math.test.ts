import { describe, it, expect } from 'vitest'
import { calculateOrderTotals, computeCommission, applySpecialDiscount } from './order-math.js'

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

describe('applySpecialDiscount', () => {
  const base = calculateOrderTotals([{ quantity: 10, unitPrice: 100, discountPercent: 0, taxRate: 12 }])
  // base: subtotal 1000, tax 120, total 1120

  it('PERCENT: reduces taxable base and scales GST proportionally', () => {
    const t = applySpecialDiscount(base, { type: 'PERCENT', value: 10 })
    expect(t.specialDiscountAmount).toBeCloseTo(100)
    expect(t.discountAmount).toBeCloseTo(100)
    expect(t.taxAmount).toBeCloseTo(108) // 12% of 900
    expect(t.total).toBeCloseTo(1008)
  })

  it('AMOUNT: fixed rupee discount, GST on the reduced base', () => {
    const t = applySpecialDiscount(base, { type: 'AMOUNT', value: 250 })
    expect(t.specialDiscountAmount).toBe(250)
    expect(t.taxAmount).toBeCloseTo(90) // 12% of 750
    expect(t.total).toBeCloseTo(840)
  })

  it('caps a fixed discount at the taxable base (never negative totals)', () => {
    const t = applySpecialDiscount(base, { type: 'AMOUNT', value: 5000 })
    expect(t.specialDiscountAmount).toBe(1000)
    expect(t.total).toBe(0)
  })

  it('stacks on top of line discounts', () => {
    const withLine = calculateOrderTotals([{ quantity: 10, unitPrice: 100, discountPercent: 5, taxRate: 12 }])
    // taxable 950, tax 114
    const t = applySpecialDiscount(withLine, { type: 'PERCENT', value: 10 })
    expect(t.specialDiscountAmount).toBeCloseTo(95)
    expect(t.taxAmount).toBeCloseTo(102.6) // 12% of 855
    expect(t.total).toBeCloseTo(957.6)
  })

  it('no-ops for null/zero discounts', () => {
    expect(applySpecialDiscount(base, null).total).toBeCloseTo(1120)
    expect(applySpecialDiscount(base, { type: 'PERCENT', value: 0 }).specialDiscountAmount).toBe(0)
  })
})
