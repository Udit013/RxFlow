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
