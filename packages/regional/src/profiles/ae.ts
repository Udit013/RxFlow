import type { RegionProfile } from '../types.js'

/**
 * United Arab Emirates. VAT is 5%, with many medicines zero-rated, so the default rate is 0%.
 * There are no postal codes; the emirate stands in for region.
 */
export const AE: RegionProfile = {
  code: 'AE',
  name: 'United Arab Emirates',
  flag: '🇦🇪',
  currency: 'AED',
  locale: 'en-AE',
  timezone: 'Asia/Dubai',
  fiscalYearStartMonth: 1,
  dateFormat: 'DD MMM YYYY',
  tax: {
    system: 'VAT',
    label: 'VAT',
    suggestedRates: [0, 5],
    defaultRate: 0,
    invoiceTitle: 'Tax Invoice',
    returns: [],
  },
  cashRounding: 0.01,
  fields: {
    taxId: { label: 'TRN', pattern: /^\d{15}$/, example: '100123456700003' },
    region: { label: 'Emirate' },
    postalCode: { label: 'P.O. Box' },
    license: { label: 'Pharmacy licence (DHA / DoH / MOHAP)' },
    productCode: { label: 'HS code' },
  },
  phone: { dialCode: '+971', minDigits: 8, maxDigits: 9 },
  medicine: { genericNameLabel: 'Generic name', brandNameLabel: 'Brand name' },
  drugSchedules: {
    OTC: { label: 'OTC', description: 'Over the counter', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_G: { label: 'Pharmacy only', description: 'Sold under pharmacist supervision', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_H: { label: 'Prescription only', description: 'Prescription required', requiresPrescription: true, requiresRegister: false },
    SCHEDULE_H1: { label: 'Semi-controlled', description: 'Semi-controlled medicine — recorded', requiresPrescription: true, requiresRegister: true },
    SCHEDULE_X: { label: 'Controlled', description: 'Narcotic / controlled medicine', requiresPrescription: true, requiresRegister: true },
  },
  register: { name: 'Controlled & semi-controlled medicines register', retentionYears: 5 },
  paymentMethods: ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'],
  supportsCompositionScheme: false,
  csvImportPresets: false,
}
