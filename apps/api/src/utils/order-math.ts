/**
 * Pure order/commission arithmetic — no I/O, fully unit-testable.
 * Single source of truth for how line items roll up into an order and how
 * salesman commission is computed, shared by orders + purchases routes.
 */

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
  /** Taxable value after all discounts (stored as Invoice.total). */
  taxable: number
  otherCharges: number
  roundOff: number
  grandTotal: number
}

/**
 * GST invoice arithmetic for an order: per-line CGST+SGST (intra-state) or IGST (inter-state),
 * the order's bill-level special discount spread proportionally across lines (so each line's
 * GST is charged on its reduced value — matching `applySpecialDiscount`), and non-taxable
 * other charges (e.g. purchase transport) added before rounding to the rupee.
 */
export function computeInvoiceAmounts(
  items: OrderLineInput[],
  isInterState: boolean,
  special?: SpecialDiscount | null,
  otherCharges = 0,
): InvoiceAmounts {
  const base = calculateOrderTotals(items)
  const { specialDiscountAmount } = applySpecialDiscount(base, special)
  const taxableBefore = base.subtotal - base.discountAmount
  const scale = taxableBefore > 0 ? (taxableBefore - specialDiscountAmount) / taxableBefore : 1

  const lines = items.map((item) => {
    const lineTotal = item.quantity * item.unitPrice
    const lineDiscount = (lineTotal * item.discountPercent) / 100
    const taxableBeforeSpecial = lineTotal - lineDiscount
    const taxableAmount = taxableBeforeSpecial * scale
    const cgstRate = isInterState ? 0 : item.taxRate / 2
    const sgstRate = isInterState ? 0 : item.taxRate / 2
    const igstRate = isInterState ? item.taxRate : 0
    const cgstAmount = (taxableAmount * cgstRate) / 100
    const sgstAmount = (taxableAmount * sgstRate) / 100
    const igstAmount = (taxableAmount * igstRate) / 100
    return {
      discountAmount: lineDiscount + (taxableBeforeSpecial - taxableAmount),
      taxableAmount,
      cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount,
      total: taxableAmount + cgstAmount + sgstAmount + igstAmount,
    }
  })

  const sum = (f: (l: InvoiceLineAmounts) => number) => lines.reduce((acc, l) => acc + f(l), 0)
  const cgst = sum((l) => l.cgstAmount)
  const sgst = sum((l) => l.sgstAmount)
  const igst = sum((l) => l.igstAmount)
  const taxable = sum((l) => l.taxableAmount)
  const totalTax = cgst + sgst + igst
  const charges = Math.max(0, otherCharges)
  const raw = taxable + totalTax + charges
  const grandTotal = Math.round(raw)
  return {
    lines,
    subtotal: base.subtotal,
    discountAmount: sum((l) => l.discountAmount),
    cgst, sgst, igst, totalTax, taxable,
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
