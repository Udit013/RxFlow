import { describe, it, expect } from 'vitest'
import {
  taxComponentsFor, applyTax, legacyGstColumns, sumComponents, scaleComponents, componentsFromLegacy, roundToIncrement,
  startOfZonedDay, addZonedDays, zonedMonthRange, getFiscalYear, getFiscalYearBounds,
  resolveRegion, regionDefaults, getRegionProfile, listRegionProfiles,
  validateTaxId, validatePostalCode, isPlausiblePhone, phoneHint,
  formatMoney, currencySymbol, paymentMethodLabel, scheduleLabel, registerSchedules,
  IN, US, GB, AE,
} from './index.js'

describe('tax engines', () => {
  it('India: CGST+SGST within a state, IGST across states, local when buyer unknown', () => {
    expect(taxComponentsFor('IN_GST', 'GST', 12, { sellerRegion: 'Maharashtra', buyerRegion: ' maharashtra ' }).map((c) => [c.code, c.rate]))
      .toEqual([['CGST', 6], ['SGST', 6]])
    expect(taxComponentsFor('IN_GST', 'GST', 12, { sellerRegion: 'Maharashtra', buyerRegion: 'Gujarat' }).map((c) => [c.code, c.rate]))
      .toEqual([['IGST', 12]])
    expect(taxComponentsFor('IN_GST', 'GST', 12, { sellerRegion: 'Maharashtra' })).toHaveLength(2)
  })

  it('VAT and sales tax are single components carrying the local label; NONE is empty', () => {
    expect(taxComponentsFor('VAT', 'VAT', 20)).toEqual([{ code: 'VAT', label: 'VAT', rate: 20 }])
    expect(taxComponentsFor('SALES_TAX', 'Sales tax', 8)).toEqual([{ code: 'SALES_TAX', label: 'Sales tax', rate: 8 }])
    expect(taxComponentsFor('NONE', 'Tax', 10)).toEqual([])
  })

  it('maps components onto the legacy GST columns only for Indian codes', () => {
    const gst = applyTax(1000, taxComponentsFor('IN_GST', 'GST', 12))
    expect(legacyGstColumns(gst)).toMatchObject({ cgstRate: 6, cgstAmount: 60, sgstAmount: 60, igstAmount: 0 })
    const vat = applyTax(1000, taxComponentsFor('VAT', 'VAT', 20))
    expect(legacyGstColumns(vat)).toMatchObject({ cgstAmount: 0, sgstAmount: 0, igstAmount: 0 })
  })

  it('aggregates by code+rate, pro-rates, and rebuilds breakdowns for legacy lines', () => {
    const a = applyTax(100, taxComponentsFor('VAT', 'VAT', 20))
    const b = applyTax(50, taxComponentsFor('VAT', 'VAT', 20))
    const c = applyTax(80, taxComponentsFor('VAT', 'VAT', 5))
    expect(sumComponents([a, b, c])).toEqual([
      { code: 'VAT', label: 'VAT', rate: 20, amount: 30 },
      { code: 'VAT', label: 'VAT', rate: 5, amount: 4 },
    ])
    expect(scaleComponents(a, 0.5)[0]!.amount).toBe(10)
    expect(componentsFromLegacy({ cgstRate: 6, cgstAmount: 6, sgstRate: 6, sgstAmount: 6, igstAmount: 0 }).map((x) => x.code)).toEqual(['CGST', 'SGST'])
  })

  it('rounds to cash increments without float noise', () => {
    expect(roundToIncrement(1063.6, 1)).toBe(1064)
    expect(roundToIncrement(10.234, 0.05)).toBe(10.25)
    expect(roundToIncrement(10.239, 0.01)).toBe(10.24)
  })
})

describe('timezone-aware calendar', () => {
  it("an Indian day starts at 18:30 UTC the previous evening, not at UTC midnight", () => {
    const at = new Date('2026-06-15T02:00:00Z') // 07:30 IST on the 15th
    expect(startOfZonedDay(at, 'Asia/Kolkata').toISOString()).toBe('2026-06-14T18:30:00.000Z')
    expect(addZonedDays(at, 1, 'Asia/Kolkata').toISOString()).toBe('2026-06-15T18:30:00.000Z')
  })

  it('handles daylight-saving months', () => {
    // London: March 2026 starts in GMT, April in BST (UTC+1)
    expect(zonedMonthRange(2026, 3, 'Europe/London')).toEqual({
      from: new Date('2026-03-01T00:00:00Z'),
      to: new Date('2026-03-31T23:00:00Z'),
    })
    // New York day after the spring-forward change (8 Mar 2026) starts at 04:00 UTC
    expect(startOfZonedDay(new Date('2026-03-09T15:00:00Z'), 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z')
  })

  it('labels fiscal years by start month and timezone', () => {
    expect(getFiscalYear(new Date('2026-03-31T12:00:00Z'), 4, 'UTC').label).toBe('2025-26')
    expect(getFiscalYear(new Date('2026-04-01T00:00:00Z'), 4, 'UTC').label).toBe('2026-27')
    // 1 Apr 00:30 IST is still 31 Mar in UTC — the tenant's zone decides
    expect(getFiscalYear(new Date('2026-03-31T19:00:00Z'), 4, 'Asia/Kolkata').label).toBe('2026-27')
    expect(getFiscalYear(new Date('2026-07-01T00:00:00Z'), 1, 'UTC').label).toBe('2026')
    expect(getFiscalYearBounds(new Date('2026-07-01T00:00:00Z'), 4, 'Asia/Kolkata').from.toISOString()).toBe('2026-03-31T18:30:00.000Z')
  })
})

describe('registry', () => {
  it('existing tenants without settings resolve to India', () => {
    const r = resolveRegion({})
    expect(r.country).toBe('IN')
    expect([r.currency, r.locale, r.timezone, r.fiscalYearStartMonth]).toEqual(['INR', 'en-IN', 'Asia/Kolkata', 4])
  })

  it('layers valid overrides and ignores invalid ones', () => {
    const r = resolveRegion({ country: 'GB', currency: 'EUR', timezone: 'Not/AZone', fiscalYearStartMonth: 13 })
    expect(r.tax.system).toBe('VAT')
    expect(r.currency).toBe('EUR')
    expect(r.timezone).toBe('Europe/London')
    expect(r.fiscalYearStartMonth).toBe(4)
  })

  it('unknown countries fall back to the international profile', () => {
    expect(getRegionProfile('ZZ').code).toBe('INTL')
    expect(regionDefaults('zz').country).toBe('INTL')
    expect(regionDefaults('us')).toMatchObject({ country: 'US', currency: 'USD', fiscalYearStartMonth: 1 })
    expect(listRegionProfiles().at(-1)!.code).toBe('INTL')
  })
})

describe('validation', () => {
  it('validates tax IDs and postal codes per country', () => {
    expect(validateTaxId(IN, '27AAACR5055K1ZV')).toBeNull()
    expect(validateTaxId(IN, 'GB123456789')).toMatch(/GSTIN/)
    expect(validateTaxId(GB, 'gb123456789')).toBeNull()
    expect(validateTaxId(AE, '100123456700003')).toBeNull()
    expect(validatePostalCode(US, '10001-1234')).toBeNull()
    expect(validatePostalCode(IN, '10001')).toMatch(/PIN code/)
    expect(validatePostalCode(AE, 'anything')).toBeNull() // no format rule
  })

  it('accepts plausible international phone numbers', () => {
    expect(isPlausiblePhone('+44 20 7946 0958')).toBe(true)
    expect(isPlausiblePhone('98765 43210')).toBe(true)
    expect(isPlausiblePhone('12345')).toBe(false)
    expect(isPlausiblePhone('call me')).toBe(false)
    expect(phoneHint(IN, '+91 98765 43210')).toBeNull()
    expect(phoneHint(IN, '12345678')).toMatch(/10 digits/)
  })
})

describe('formatting and labels', () => {
  it('formats money in the tenant currency and locale', () => {
    expect(formatMoney(1234567.5, { currency: 'INR', locale: 'en-IN' })).toBe('₹12,34,567.50')
    expect(formatMoney(1234567.5, { currency: 'USD', locale: 'en-US' })).toBe('$1,234,567.50')
    expect(formatMoney(1500, { currency: 'JPY', locale: 'ja-JP' })).toMatch(/1,500$/)
    expect(currencySymbol({ currency: 'GBP', locale: 'en-GB' })).toBe('£')
  })

  it('labels payment methods and drug tiers in local terms', () => {
    expect(paymentMethodLabel(US, 'CHEQUE')).toBe('Check')
    expect(paymentMethodLabel(IN, 'UPI')).toBe('UPI')
    expect(scheduleLabel(GB, 'SCHEDULE_H')).toBe('POM')
    expect(scheduleLabel(IN, 'SCHEDULE_H1')).toBe('Schedule H1')
    expect(registerSchedules(IN)).toEqual(['SCHEDULE_H1', 'SCHEDULE_X'])
  })
})

describe('Canada profile', () => {
  it('is registered with zero-rated prescriptions and Canadian formats', async () => {
    const { getRegionProfile } = await import('./registry.js')
    const ca = getRegionProfile('CA')
    expect(ca.code).toBe('CA')
    expect(ca.tax.defaultRate).toBe(0)
    expect(ca.fields.postalCode.pattern!.test('M5V 3L9')).toBe(true)
    expect(ca.fields.taxId.pattern!.test('123456789RT0001')).toBe(true)
    expect(ca.drugSchedules.SCHEDULE_H.requiresPrescription).toBe(true)
    expect(ca.drugSchedules.SCHEDULE_X.requiresRegister).toBe(true)
  })
})
