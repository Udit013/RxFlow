import type { RegionProfile } from '../types.js'

/**
 * United States. Sales tax is set per store's state/locality, and prescription drugs are exempt
 * in most states — hence a 0% default. Controlled-substance tiers follow DEA schedules.
 */
export const US: RegionProfile = {
  code: 'US',
  name: 'United States',
  flag: '🇺🇸',
  currency: 'USD',
  locale: 'en-US',
  timezone: 'America/New_York',
  fiscalYearStartMonth: 1,
  dateFormat: 'MMM D, YYYY',
  tax: {
    system: 'SALES_TAX',
    label: 'Sales tax',
    suggestedRates: [0, 4, 5, 6, 6.25, 7, 8, 9.5],
    defaultRate: 0,
    invoiceTitle: 'Invoice',
    returns: [],
  },
  cashRounding: 0.01,
  fields: {
    taxId: { label: 'EIN', pattern: /^\d{2}-?\d{7}$/, example: '12-3456789' },
    region: { label: 'State' },
    postalCode: { label: 'ZIP code', pattern: /^\d{5}(-\d{4})?$/, example: '10001' },
    license: { label: 'Pharmacy license / DEA no.' },
    productCode: { label: 'NDC / product code' },
  },
  phone: { dialCode: '+1', minDigits: 10, maxDigits: 10 },
  medicine: { genericNameLabel: 'Generic name', brandNameLabel: 'Brand name' },
  drugSchedules: {
    OTC: { label: 'OTC', description: 'Over the counter', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_G: { label: 'Behind the counter', description: 'Pharmacist-supervised sale (e.g. pseudoephedrine)', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_H: { label: 'Rx only', description: 'Prescription required', requiresPrescription: true, requiresRegister: false },
    SCHEDULE_H1: { label: 'C-III – C-V', description: 'DEA Schedule III–V controlled substance', requiresPrescription: true, requiresRegister: true },
    SCHEDULE_X: { label: 'C-II', description: 'DEA Schedule II controlled substance', requiresPrescription: true, requiresRegister: true },
  },
  register: { name: 'Controlled substance dispensing log', retentionYears: 2 },
  paymentMethods: ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'],
  paymentLabels: { CHEQUE: 'Check', BANK_TRANSFER: 'ACH / bank transfer' },
  supportsCompositionScheme: false,
  csvImportPresets: false,
}
