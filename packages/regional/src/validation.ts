import type { FieldRule, RegionProfile } from './types.ts'

/** null when valid (or empty — emptiness is the caller's concern), else a readable message. */
export function validateField(rule: FieldRule, value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!v || !rule.pattern) return null
  return rule.pattern.test(v) ? null : `Invalid ${rule.label}${rule.example ? ` (e.g. ${rule.example})` : ''}`
}

export const validateTaxId = (r: RegionProfile, v: string | null | undefined) => validateField(r.fields.taxId, v?.toUpperCase())
export const validatePostalCode = (r: RegionProfile, v: string | null | undefined) => validateField(r.fields.postalCode, v)

export function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/**
 * Country-neutral phone check used by the API: 6–15 digits (the E.164 maximum), allowing +,
 * spaces, dashes, dots and brackets. Country-specific length is a UI hint, not a hard rule —
 * pharmacies also record international customers.
 */
export function isPlausiblePhone(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  if (!/^\+?[0-9\s\-().]+$/.test(v)) return false
  const n = phoneDigits(v).length
  return n >= 6 && n <= 15
}

/** UI hint: does the number look right for this country? */
export function phoneHint(r: RegionProfile, value: string | null | undefined): string | null {
  let digits = phoneDigits(value)
  const dial = phoneDigits(r.phone.dialCode)
  if (dial && (value ?? '').trim().startsWith('+') && digits.startsWith(dial)) digits = digits.slice(dial.length)
  if (!digits) return null
  if (digits.length < r.phone.minDigits || digits.length > r.phone.maxDigits) {
    const want = r.phone.minDigits === r.phone.maxDigits ? `${r.phone.minDigits}` : `${r.phone.minDigits}–${r.phone.maxDigits}`
    return `${r.name} numbers usually have ${want} digits`
  }
  return null
}
