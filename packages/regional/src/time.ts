/**
 * Timezone-aware calendar boundaries without a date library: "today", "this month" and the
 * fiscal year are computed in the TENANT's timezone, not the server's (Render runs on UTC, which
 * used to make an Indian pharmacy's "today" start at 05:30 IST).
 */

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false
  try {
    formatterFor(timeZone)
    return true
  } catch {
    return false
  }
}

/** Wall-clock parts of an instant in a timezone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {}
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year!, month: parts.month!, day: parts.day!,
    hour: parts.hour === 24 ? 0 : parts.hour!, minute: parts.minute!, second: parts.second!,
  }
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The instant at which the given wall-clock time occurs in `timeZone` (month is 1–12). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  let result = guess - offsetMs(new Date(guess), timeZone)
  // Re-check across a DST transition between the guess and the result.
  const second2 = offsetMs(new Date(result), timeZone)
  if (guess - second2 !== result) result = guess - second2
  return new Date(result)
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone)
}

/** Start of the day `days` days after the day containing `date` (negative = earlier). */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 0, 0, 0, timeZone)
}

/** Calendar date of an instant in `timeZone`, as "YYYY-MM-DD". */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** The last `days` calendar dates up to and including today in `timeZone`, oldest first. */
export function lastZonedDateKeys(now: Date, days: number, timeZone: string): string[] {
  const p = zonedParts(now, timeZone)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day - (days - 1 - i)))
    return d.toISOString().slice(0, 10)
  })
}

/** [from, to) of a calendar month in the given timezone (month 1–12). */
export function zonedMonthRange(year: number, month: number, timeZone: string): { from: Date; to: Date } {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  return {
    from: zonedTimeToUtc(year, month, 1, 0, 0, 0, timeZone),
    to: zonedTimeToUtc(next.y, next.m, 1, 0, 0, 0, timeZone),
  }
}

export function currentZonedMonthRange(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone)
  return zonedMonthRange(p.year, p.month, timeZone)
}

export interface FiscalYear { startYear: number; endYear: number; label: string }

/**
 * Fiscal year containing `date`. startMonth 4 (India, UK) → label "2025-26";
 * startMonth 1 (calendar-year countries) → label "2026".
 */
export function getFiscalYear(date: Date = new Date(), startMonth = 4, timeZone = 'UTC'): FiscalYear {
  const p = zonedParts(date, timeZone)
  const startYear = p.month >= startMonth ? p.year : p.year - 1
  if (startMonth === 1) return { startYear, endYear: startYear, label: String(startYear) }
  const endYear = startYear + 1
  return { startYear, endYear, label: `${startYear}-${String(endYear).slice(-2)}` }
}

export function getFiscalYearBounds(date: Date = new Date(), startMonth = 4, timeZone = 'UTC'): { from: Date; to: Date } {
  const { startYear } = getFiscalYear(date, startMonth, timeZone)
  return {
    from: zonedTimeToUtc(startYear, startMonth, 1, 0, 0, 0, timeZone),
    to: zonedTimeToUtc(startYear + 1, startMonth, 1, 0, 0, 0, timeZone),
  }
}
