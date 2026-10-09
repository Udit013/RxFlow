/**
 * Financial-year helpers. The real logic lives in @rxflow/regional (fiscal years differ by
 * country and are evaluated in the tenant's timezone); these wrappers keep the original API,
 * whose defaults — April start, UTC — are India's convention.
 */
import { getFiscalYear, getFiscalYearBounds as fiscalBounds } from '@rxflow/regional'

export function getFinancialYear(date: Date = new Date(), startMonth = 4, timeZone = 'UTC') {
  return getFiscalYear(date, startMonth, timeZone)
}

export function getFinancialYearBounds(date: Date = new Date(), startMonth = 4, timeZone = 'UTC') {
  return fiscalBounds(date, startMonth, timeZone)
}

/**
 * Format: `<PREFIX>/<FY>/<seq>`
 * e.g. `INV/2025-26/00042`, `PO/2025-26/00007`, `CN/2025-26/00003`
 */
export function formatFyNumber(prefix: string, fyLabel: string, seq: number, pad = 5): string {
  return `${prefix}/${fyLabel}/${String(seq).padStart(pad, '0')}`
}
