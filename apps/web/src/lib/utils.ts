import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date, format = 'DD MMM YYYY'): string {
  return dayjs(date).format(format)
}

export function formatRelativeTime(date: string | Date): string {
  return dayjs(date).fromNow()
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
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
