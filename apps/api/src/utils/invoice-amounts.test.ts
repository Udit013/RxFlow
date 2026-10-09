import { describe, it, expect } from 'vitest'
import { computeInvoiceAmounts, calculateOrderTotals, applySpecialDiscount } from './order-math.js'

const INDIA_INTRA = { system: 'IN_GST' as const, label: 'GST', cashRounding: 1 }
const INDIA_INTER = { ...INDIA_INTRA, context: { sellerRegion: 'Maharashtra', buyerRegion: 'Gujarat' } }

const items = [
  { quantity: 10, unitPrice: 100, discountPercent: 0, taxRate: 12 }, // 1000 taxable
  { quantity: 5, unitPrice: 200, discountPercent: 10, taxRate: 5 }, // 900 taxable
]

describe('computeInvoiceAmounts', () => {
  it('splits GST into CGST+SGST intra-state and IGST inter-state', () => {
    const intra = computeInvoiceAmounts(items, INDIA_INTRA)
    expect(intra.cgst).toBeCloseTo(60 + 22.5)
    expect(intra.sgst).toBeCloseTo(60 + 22.5)
    expect(intra.igst).toBe(0)
    const inter = computeInvoiceAmounts(items, INDIA_INTER)
    expect(inter.igst).toBeCloseTo(165)
    expect(inter.cgst + inter.sgst).toBe(0)
  })

  it('carries a special discount so the invoice matches the order total', () => {
    const special = { type: 'PERCENT' as const, value: 10 }
    const inv = computeInvoiceAmounts(items, INDIA_INTRA, special)
    const order = applySpecialDiscount(calculateOrderTotals(items), special)
    expect(inv.taxable).toBeCloseTo(1900 * 0.9)
    expect(inv.taxable + inv.totalTax).toBeCloseTo(order.total)
    // line + special discount both reported as discount
    expect(inv.discountAmount).toBeCloseTo(100 + 190)
  })

  it('caps an amount discount at the taxable value', () => {
    const inv = computeInvoiceAmounts(items, INDIA_INTRA, { type: 'AMOUNT', value: 99999 })
    expect(inv.taxable).toBeCloseTo(0)
    expect(inv.grandTotal).toBe(0)
  })

  it('adds non-taxable other charges and rounds to the rupee', () => {
    const inv = computeInvoiceAmounts(items, INDIA_INTRA, null, 49.6)
    const raw = 1900 + 165 + 49.6
    expect(inv.otherCharges).toBe(49.6)
    expect(inv.grandTotal).toBe(Math.round(raw))
    expect(inv.grandTotal - inv.roundOff).toBeCloseTo(raw)
  })

  it('applies a single-component VAT and keeps the GST columns empty', () => {
    const inv = computeInvoiceAmounts(items, { system: 'VAT', label: 'VAT', cashRounding: 0.01 })
    expect(inv.totalTax).toBeCloseTo(1000 * 0.12 + 900 * 0.05)
    expect(inv.cgst + inv.sgst + inv.igst).toBe(0)
    expect(inv.taxBreakdown.map((c) => [c.code, c.rate])).toEqual([['VAT', 12], ['VAT', 5]])
    expect(inv.lines[0]!.taxBreakdown[0]!.label).toBe('VAT')
  })

  it('rounds to cents, not whole units, outside India', () => {
    const odd = [{ quantity: 3, unitPrice: 3.33, discountPercent: 0, taxRate: 8.875 }]
    const inv = computeInvoiceAmounts(odd, { system: 'SALES_TAX', label: 'Sales tax', cashRounding: 0.01 })
    expect(inv.grandTotal).toBe(10.88) // 9.99 + 0.8866 = 10.8766
    expect(Math.abs(inv.roundOff)).toBeLessThan(0.01)
  })

  it('charges nothing under a no-tax system', () => {
    const inv = computeInvoiceAmounts(items, { system: 'NONE', label: 'Tax', cashRounding: 0.01 })
    expect(inv.totalTax).toBe(0)
    expect(inv.grandTotal).toBe(1900)
  })
})
