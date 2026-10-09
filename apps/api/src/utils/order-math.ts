/**
 * Pure order/commission arithmetic — no I/O, fully unit-testable, country-agnostic (tax systems
 * come from @rxflow/regional).
 * Single source of truth for how line items roll up into an order and how
 * salesman commission is computed, shared by orders + purchases routes.
 */

import {
  applyTax, taxComponentsFor, legacyGstColumns, sumComponents, roundToIncrement,
  totalTax as totalTaxOf, type TaxComponent, type TaxContext, type TaxSystemId,
} from '@rxflow/regional'

export interface OrderLineInput {
  quantity: number
  unitPrice: number
  discountPercent: number
  taxRate: number
}

export interface OrderTotals {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
}

export function calculateOrderTotals(items: OrderLineInput[]): OrderTotals {
  return items.reduce<OrderTotals>(
    (acc, item) => {
      const lineTotal = item.quantity * item.unitPrice
      const discountAmount = (lineTotal * item.discountPercent) / 100
      const taxableAmount = lineTotal - discountAmount
      const taxAmount = (taxableAmount * item.taxRate) / 100

      acc.subtotal += lineTotal
      acc.discountAmount += discountAmount
      acc.taxAmount += taxAmount
      acc.total += taxableAmount + taxAmount
      return acc
    },
    { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 }
  )
}

export interface SpecialDiscount {
  type: 'PERCENT' | 'AMOUNT'
  value: number
}

/**
 * Apply a bill-level "special discount" on top of line discounts.
 * GST is charged on the reduced taxable base, so tax scales down
 * proportionally — the effective per-line GST rates are preserved.
 */
export function applySpecialDiscount(totals: OrderTotals, special?: SpecialDiscount | null): OrderTotals & { specialDiscountAmount: number } {
  const taxableBefore = totals.subtotal - totals.discountAmount
  if (!special || special.value <= 0 || taxableBefore <= 0) {
    return { ...totals, specialDiscountAmount: 0 }
  }
  const raw = special.type === 'PERCENT'
    ? (taxableBefore * special.value) / 100
    : special.value
  const specialDiscountAmount = Math.min(raw, taxableBefore)
  const scale = (taxableBefore - specialDiscountAmount) / taxableBefore
  const taxAmount = totals.taxAmount * scale
  return {
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount + specialDiscountAmount,
    taxAmount,
    total: taxableBefore - specialDiscountAmount + taxAmount,
    specialDiscountAmount,
  }
}

export interface InvoiceLineAmounts {
  discountAmount: number
  taxableAmount: number
  /** Country-agnostic tax: total and components. */
  taxAmount: number
  taxBreakdown: TaxComponent[]
  /** Legacy Indian-GST columns (zero for other tax systems). */
  cgstRate: number
  cgstAmount: number
  sgstRate: number
  sgstAmount: number
  igstRate: number
  igstAmount: number
  total: number
}

export interface InvoiceAmounts {
  lines: InvoiceLineAmounts[]
  subtotal: number
  discountAmount: number
  cgst: number
  sgst: number
  igst: number
  totalTax: number
  /** Invoice-level components grouped by code + rate. */
  taxBreakdown: TaxComponent[]
  /** Taxable value after all discounts (stored as Invoice.total). */
  taxable: number
  otherCharges: number
  roundOff: number
  grandTotal: number
}

export interface InvoiceTaxSetup {
  system: TaxSystemId
  /** Local name of the tax ("GST", "VAT", "Sales tax"). */
  label: string
  /** Seller/buyer regions — only India's GST looks at them. */
  context?: TaxContext
  /** Round the grand total to this increment (India: 1 = whole rupee; 0.01 = cents). */
  cashRounding?: number
}

/**
 * Tax-invoice arithmetic for an order, for any country: each line's tax is split into the
 * components its tax system charges (CGST+SGST / IGST, VAT, sales tax, none), the order's
 * bill-level special discount is spread proportionally across lines (so tax is charged on each
 * line's reduced value — matching `applySpecialDiscount`), and non-taxable other charges (e.g.
 * purchase transport) are added before rounding to the country's cash increment.
 */
export function computeInvoiceAmounts(
  items: OrderLineInput[],
  tax: InvoiceTaxSetup,
  special?: SpecialDiscount | null,
  otherCharges = 0,
): InvoiceAmounts {
  const base = calculateOrderTotals(items)
  const { specialDiscountAmount } = applySpecialDiscount(base, special)
  const taxableBefore = base.subtotal - base.discountAmount
  const scale = taxableBefore > 0 ? (taxableBefore - specialDiscountAmount) / taxableBefore : 1

  const lines = items.map((item): InvoiceLineAmounts => {
    const lineTotal = item.quantity * item.unitPrice
    const lineDiscount = (lineTotal * item.discountPercent) / 100
    const taxableBeforeSpecial = lineTotal - lineDiscount
    const taxableAmount = taxableBeforeSpecial * scale
    const taxBreakdown = applyTax(taxableAmount, taxComponentsFor(tax.system, tax.label, item.taxRate, tax.context))
    const taxAmount = totalTaxOf(taxBreakdown)
    return {
      discountAmount: lineDiscount + (taxableBeforeSpecial - taxableAmount),
      taxableAmount,
      taxAmount,
      taxBreakdown,
      ...legacyGstColumns(taxBreakdown),
      total: taxableAmount + taxAmount,
    }
  })

  const sum = (f: (l: InvoiceLineAmounts) => number) => lines.reduce((acc, l) => acc + f(l), 0)
  const taxable = sum((l) => l.taxableAmount)
  const totalTax = sum((l) => l.taxAmount)
  const charges = Math.max(0, otherCharges)
  const raw = taxable + totalTax + charges
  const grandTotal = roundToIncrement(raw, tax.cashRounding ?? 0.01)
  return {
    lines,
    subtotal: base.subtotal,
    discountAmount: sum((l) => l.discountAmount),
    cgst: sum((l) => l.cgstAmount),
    sgst: sum((l) => l.sgstAmount),
    igst: sum((l) => l.igstAmount),
    totalTax,
    taxBreakdown: sumComponents(lines.map((l) => l.taxBreakdown)),
    taxable,
    otherCharges: charges,
    roundOff: grandTotal - raw,
    grandTotal,
  }
}

/**
 * Salesman commission on the net value (subtotal − discount), excluding tax
 * and transport, plus an optional flat per-order bonus.
 */
export function computeCommission(
  totals: Pick<OrderTotals, 'subtotal' | 'discountAmount'>,
  commissionPercent: number,
  flatBonusAmount = 0
): number {
  const base = totals.subtotal - totals.discountAmount
  return (base * commissionPercent) / 100 + flatBonusAmount
}
