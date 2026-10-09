import type { DrugScheduleCode, PaymentMethodCode, RegionProfile } from './types.js'
import { DRUG_SCHEDULE_CODES } from './types.js'

export interface MoneyFormat { currency: string; locale: string }

export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

export function formatMoney(amount: number, f: MoneyFormat): string {
  const digits = currencyFractionDigits(f.currency)
  try {
    return new Intl.NumberFormat(f.locale, {
      style: 'currency', currency: f.currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(Number.isFinite(amount) ? amount : 0)
  } catch {
    return `${f.currency} ${amount.toFixed(digits)}`
  }
}

export function formatPlainNumber(value: number, locale: string, maximumFractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)
  } catch {
    return String(value)
  }
}

/** "₹", "$", "£", "AED" … as the locale writes it. */
export function currencySymbol(f: MoneyFormat): string {
  try {
    const part = new Intl.NumberFormat(f.locale, { style: 'currency', currency: f.currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')
    return part?.value ?? f.currency
  } catch {
    return f.currency
  }
}

const DEFAULT_PAYMENT_LABELS: Record<PaymentMethodCode, string> = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI', NEFT: 'NEFT', RTGS: 'RTGS',
  BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', CREDIT: 'Credit',
}

export function paymentMethodLabel(r: RegionProfile, code: string): string {
  return r.paymentLabels?.[code as PaymentMethodCode] ?? DEFAULT_PAYMENT_LABELS[code as PaymentMethodCode] ?? code
}

export function scheduleLabel(r: RegionProfile, code: string | null | undefined): string {
  if (!code) return ''
  return r.drugSchedules[code as DrugScheduleCode]?.label ?? code
}

/** Classification tiers whose sales go in this country's controlled-drugs register. */
export function registerSchedules(r: RegionProfile): DrugScheduleCode[] {
  return DRUG_SCHEDULE_CODES.filter((c) => r.drugSchedules[c].requiresRegister)
}

export function prescriptionSchedules(r: RegionProfile): DrugScheduleCode[] {
  return DRUG_SCHEDULE_CODES.filter((c) => r.drugSchedules[c].requiresPrescription)
}
