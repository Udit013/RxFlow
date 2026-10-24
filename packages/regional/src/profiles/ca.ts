import type { RegionProfile } from '../types.ts'

/**
 * Canada. GST/HST is a value-added tax: prescription drugs are zero-rated, most OTC products
 * carry 5% GST or the provincial HST (13–15%); BC, SK, MB and QC add a separate provincial tax,
 * so their combined rates are listed too. Tiers follow NAPRA schedules and the CDSA.
 */
export const CA: RegionProfile = {
  code: 'CA',
  name: 'Canada',
  flag: '🇨🇦',
  currency: 'CAD',
  locale: 'en-CA',
  timezone: 'America/Toronto',
  fiscalYearStartMonth: 1,
  dateFormat: 'MMM D, YYYY',
  tax: {
    system: 'VAT',
    label: 'GST/HST',
    suggestedRates: [0, 5, 11, 12, 13, 14, 14.975, 15],
    defaultRate: 0,
    invoiceTitle: 'Invoice',
    returns: [],
  },
  cashRounding: 0.05,
  fields: {
    taxId: { label: 'Business Number (GST/HST)', pattern: /^\d{9}(\s?RT\s?\d{4})?$/i, example: '123456789RT0001' },
    region: { label: 'Province / territory' },
    postalCode: { label: 'Postal code', pattern: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, example: 'M5V 3L9' },
    license: { label: 'Pharmacy licence no.' },
    productCode: { label: 'DIN / product code' },
  },
  phone: { dialCode: '+1', minDigits: 10, maxDigits: 10 },
  medicine: { genericNameLabel: 'Generic name', brandNameLabel: 'Brand name' },
  drugSchedules: {
    OTC: { label: 'Unscheduled', description: 'May be sold without pharmacist involvement', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_G: { label: 'Sch. II / III', description: 'Pharmacy-only — sold with pharmacist involvement (NAPRA Schedules II–III)', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_H: { label: 'Rx', description: 'Prescription Drug List (NAPRA Schedule I)', requiresPrescription: true, requiresRegister: false },
    SCHEDULE_H1: { label: 'Controlled', description: 'Controlled or targeted substance (e.g. benzodiazepines — CDSA Schedules III–V)', requiresPrescription: true, requiresRegister: true },
    SCHEDULE_X: { label: 'Narcotic', description: 'Narcotic / controlled drug (CDSA Schedules I–II)', requiresPrescription: true, requiresRegister: true },
  },
  register: { name: 'Narcotic and controlled drug register', retentionYears: 2 },
  paymentMethods: ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'],
  paymentLabels: { BANK_TRANSFER: 'EFT / Interac e-Transfer' },
  supportsCompositionScheme: false,
  csvImportPresets: false,
}
