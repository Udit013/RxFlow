/**
 * Indian financial year helpers.
 * FY runs Apr 1 → Mar 31. FY 2025-26 = Apr 1, 2025 → Mar 31, 2026.
 */

export function getFinancialYear(date: Date = new Date()): { startYear: number; endYear: number; label: string } {
  const month = date.getMonth() // 0-indexed: 0=Jan, 3=Apr
  const year = date.getFullYear()
  // If month is Jan-Mar (0,1,2), FY started in previous calendar year
  const startYear = month < 3 ? year - 1 : year
  const endYear = startYear + 1
  return {
    startYear,
    endYear,
    label: `${startYear}-${String(endYear).slice(-2)}`,
  }
}

export function getFinancialYearBounds(date: Date = new Date()): { from: Date; to: Date } {
  const { startYear } = getFinancialYear(date)
  return {
    from: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)), // Apr 1 00:00
    to: new Date(Date.UTC(startYear + 1, 3, 1, 0, 0, 0)), // Apr 1 next year (exclusive)
  }
}

/**
 * Format: `<PREFIX>/<FY>/<seq>`
 * e.g. `INV/2025-26/00042`, `PO/2025-26/00007`, `CN/2025-26/00003`
 */
export function formatFyNumber(prefix: string, fyLabel: string, seq: number, pad = 5): string {
  return `${prefix}/${fyLabel}/${String(seq).padStart(pad, '0')}`
}
