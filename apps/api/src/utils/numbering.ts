/**
 * Financial-year document numbering (INV/2025-26/00042 …) with collision safety.
 *
 * Numbers were previously `count(rows this FY) + 1`. That breaks in two ways:
 *  1. Concurrency — two requests read the same count and pick the same number.
 *  2. Deletion — deleting any row (e.g. a parked sale) lowers the count, so the next
 *     number re-uses one that still exists and EVERY later create fails on the
 *     unique (tenantId, number) constraint until another row is added.
 * Taking max(highest existing sequence, count) fixes (2); `withUniqueRetry` absorbs (1).
 */
import { prisma } from '@rxflow/db'
import { getFinancialYear, formatFyNumber } from './financial-year.js'
import { getTenantRegion } from './regional.js'

type NumberedModel = 'order' | 'invoice' | 'stockTransfer' | 'stockTake'

const NUMBER_FIELD: Record<NumberedModel, string> = {
  order: 'orderNumber',
  invoice: 'invoiceNumber',
  stockTransfer: 'code',
  stockTake: 'code',
}

/** Pure: next sequence given the row count and the lexically-highest existing number. */
export function computeNextSeq(count: number, latestNumber: string | null | undefined, stem: string): number {
  const parsed = latestNumber?.startsWith(stem) ? Number.parseInt(latestNumber.slice(stem.length), 10) : 0
  return Math.max(Number.isFinite(parsed) ? parsed : 0, count) + 1
}

export async function nextFyNumber(
  model: NumberedModel,
  tenantId: string,
  prefix: string,
  date: Date = new Date(),
): Promise<string> {
  // The tenant's fiscal year (India: April–March → "2025-26"; calendar-year countries → "2026"),
  // evaluated in the tenant's timezone so numbering flips at local midnight.
  const region = await getTenantRegion(tenantId)
  const fy = getFinancialYear(date, region.fiscalYearStartMonth, region.timezone)
  const stem = `${prefix}/${fy.label}/`
  const field = NUMBER_FIELD[model]
  // Dynamic delegate access — every model above has tenantId + a string number field.
  const delegate = (prisma as unknown as Record<string, {
    findFirst: (args: unknown) => Promise<Record<string, string> | null>
    count: (args: unknown) => Promise<number>
  }>)[model]!
  const where = { tenantId, [field]: { startsWith: stem } }
  const [latest, count] = await Promise.all([
    delegate.findFirst({ where, orderBy: { [field]: 'desc' }, select: { [field]: true } }),
    delegate.count({ where }),
  ])
  return formatFyNumber(prefix, fy.label, computeNextSeq(count, latest?.[field], stem))
}

/**
 * Re-run `fn` when it fails on a unique-constraint violation (Prisma P2002) — i.e. a
 * concurrent request claimed the same document number. `fn` must generate its number
 * inside, so each attempt gets a fresh one.
 */
export async function withUniqueRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002' || attempt >= attempts) throw e
    }
  }
}
