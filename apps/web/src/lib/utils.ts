import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { formatMoney, formatPlainNumber, currencySymbol } from '@rxflow/regional'
import { getActiveRegion } from './region'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * react-hook-form register options for an OPTIONAL number field.
 * Unlike `valueAsNumber` (which yields NaN → serializes to null and breaks
 * server-side `.optional()` validation), this maps an empty input to `undefined`
 * so the field is genuinely optional and the form submits when left blank.
 */
export const optionalNumber = {
  setValueAs: (v: unknown): number | undefined => {
    if (v === '' || v === null || v === undefined) return undefined
    const n = Number(v)
    return Number.isNaN(n) ? undefined : n
  },
}

/**
 * Money in the pharmacy's currency and locale (₹12,34,567.50 · $1,234,567.50 · £… · AED …).
 * Pass `currency` only to show an amount in a different currency than the tenant's.
 */
export function formatCurrency(amount: number, currency?: string): string {
  const region = getActiveRegion()
  return formatMoney(amount, { currency: currency ?? region.currency, locale: region.locale })
}

/** The tenant currency's symbol as its locale writes it — for field labels like "Price (₹)". */
export function moneySymbol(): string {
  const region = getActiveRegion()
  return currencySymbol({ currency: region.currency, locale: region.locale })
}

/** Dates in the pharmacy's convention (DD MMM YYYY, MMM D, YYYY …) unless a format is given. */
export function formatDate(date: string | Date, format?: string): string {
  return dayjs(date).format(format ?? getActiveRegion().dateFormat)
}

export function formatRelativeTime(date: string | Date): string {
  return dayjs(date).fromNow()
}

export function formatNumber(num: number): string {
  return formatPlainNumber(num, getActiveRegion().locale)
}

export function getDaysUntilExpiry(expiryDate: string | Date): number {
  return dayjs(expiryDate).diff(dayjs(), 'day')
}

export function getExpiryStatus(expiryDate: string | Date): 'expired' | 'critical' | 'warning' | 'ok' {
  const days = getDaysUntilExpiry(expiryDate)
  if (days < 0) return 'expired'
  if (days <= 30) return 'critical'
  if (days <= 90) return 'warning'
  return 'ok'
}

export function getStockStatus(available: number, reorderLevel: number): 'negative' | 'out' | 'low' | 'ok' {
  if (available < 0) return 'negative'
  if (available <= 0) return 'out'
  if (available <= reorderLevel) return 'low'
  return 'ok'
}

export function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str
}

export function generateOrderNumber(): string {
  return `ORD-${Date.now().toString().slice(-8)}`
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}
