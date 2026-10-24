import type { RegionProfile } from '../types.ts'

/**
 * Generic international profile for countries without a dedicated one yet. Neutral labels, a
 * single-component tax, no format checks — every value a tenant can override in Settings.
 */
export const INTL: RegionProfile = {
  code: 'INTL',
  name: 'Other country',
  flag: '🌐',
  currency: 'USD',
  locale: 'en-US',
  timezone: 'UTC',
  fiscalYearStartMonth: 1,
  dateFormat: 'DD MMM YYYY',
  tax: {
    system: 'VAT',
    label: 'Tax',
    suggestedRates: [0, 5, 10, 15, 20],
    defaultRate: 0,
    invoiceTitle: 'Invoice',
    returns: [],
  },
  cashRounding: 0.01,
  fields: {
    taxId: { label: 'Tax ID' },
    region: { label: 'State / province' },
    postalCode: { label: 'Postal code' },
    license: { label: 'Pharmacy licence number' },
    productCode: { label: 'HS code' },
  },
  phone: { dialCode: '', minDigits: 6, maxDigits: 15 },
  medicine: { genericNameLabel: 'Generic name', brandNameLabel: 'Brand name' },
  drugSchedules: {
    OTC: { label: 'OTC', description: 'Over the counter', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_G: { label: 'Pharmacy only', description: 'Sold under pharmacist supervision', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_H: { label: 'Prescription only', description: 'Prescription required', requiresPrescription: true, requiresRegister: false },
    SCHEDULE_H1: { label: 'Restricted', description: 'Prescription required and recorded', requiresPrescription: true, requiresRegister: true },
    SCHEDULE_X: { label: 'Controlled', description: 'Controlled substance', requiresPrescription: true, requiresRegister: true },
  },
  register: { name: 'Controlled drugs register', retentionYears: 2 },
  paymentMethods: ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'],
  supportsCompositionScheme: false,
  csvImportPresets: false,
}
