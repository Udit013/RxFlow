import { describe, it, expect } from 'vitest'
import { computeInvoiceAmounts, calculateOrderTotals, applySpecialDiscount } from './order-math.js'

const items = [
  { quantity: 10, unitPrice: 100, discountPercent: 0, taxRate: 12 }, // 1000 taxable
  { quantity: 5, unitPrice: 200, discountPercent: 10, taxRate: 5 }, // 900 taxable
]

describe('computeInvoiceAmounts', () => {
  it('splits GST into CGST+SGST intra-state and IGST inter-state', () => {
    const intra = computeInvoiceAmounts(items, false)
    expect(intra.cgst).toBeCloseTo(60 + 22.5)
    expect(intra.sgst).toBeCloseTo(60 + 22.5)
    expect(intra.igst).toBe(0)
    const inter = computeInvoiceAmounts(items, true)
    expect(inter.igst).toBeCloseTo(165)
    expect(inter.cgst + inter.sgst).toBe(0)
  })

  it('carries a special discount so the invoice matches the order total', () => {
    const special = { type: 'PERCENT' as const, value: 10 }
    const inv = computeInvoiceAmounts(items, false, special)
    const order = applySpecialDiscount(calculateOrderTotals(items), special)
    expect(inv.taxable).toBeCloseTo(1900 * 0.9)
    expect(inv.taxable + inv.totalTax).toBeCloseTo(order.total)
    // line + special discount both reported as discount
    expect(inv.discountAmount).toBeCloseTo(100 + 190)
  })

  it('caps an amount discount at the taxable value', () => {
    const inv = computeInvoiceAmounts(items, false, { type: 'AMOUNT', value: 99999 })
    expect(inv.taxable).toBeCloseTo(0)
    expect(inv.grandTotal).toBe(0)
  })

  it('adds non-taxable other charges and rounds to the rupee', () => {
    const inv = computeInvoiceAmounts(items, false, null, 49.6)
    const raw = 1900 + 165 + 49.6
    expect(inv.otherCharges).toBe(49.6)
    expect(inv.grandTotal).toBe(Math.round(raw))
    expect(inv.grandTotal - inv.roundOff).toBeCloseTo(raw)
  })
})
