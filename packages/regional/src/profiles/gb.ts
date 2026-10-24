import type { RegionProfile } from '../types.ts'

/**
 * United Kingdom. NHS-dispensed prescription medicines are zero-rated for VAT; most
 * over-the-counter sales carry the standard 20% rate. Tiers map to GSL / P / POM / CD.
 */
export const GB: RegionProfile = {
  code: 'GB',
  name: 'United Kingdom',
  flag: '🇬🇧',
  currency: 'GBP',
  locale: 'en-GB',
  timezone: 'Europe/London',
  fiscalYearStartMonth: 4,
  dateFormat: 'DD MMM YYYY',
  tax: {
    system: 'VAT',
    label: 'VAT',
    suggestedRates: [0, 5, 20],
    defaultRate: 0,
    invoiceTitle: 'VAT Invoice',
    returns: [],
  },
  cashRounding: 0.01,
  fields: {
    taxId: { label: 'VAT number', pattern: /^(GB)?\d{9}(\d{3})?$/, example: 'GB123456789' },
    region: { label: 'County' },
    postalCode: { label: 'Postcode', pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, example: 'SW1A 1AA' },
    license: { label: 'GPhC registration no.' },
    productCode: { label: 'Commodity code' },
  },
  phone: { dialCode: '+44', minDigits: 10, maxDigits: 11 },
  medicine: { genericNameLabel: 'Generic name (INN)', brandNameLabel: 'Brand name' },
  drugSchedules: {
    OTC: { label: 'GSL', description: 'General sale list', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_G: { label: 'P', description: 'Pharmacy medicine — sold under pharmacist supervision', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_H: { label: 'POM', description: 'Prescription-only medicine', requiresPrescription: true, requiresRegister: false },
    SCHEDULE_H1: { label: 'CD (Sch. 3–5)', description: 'Controlled drug, Schedules 3–5', requiresPrescription: true, requiresRegister: true },
    SCHEDULE_X: { label: 'CD (Sch. 2)', description: 'Controlled drug, Schedule 2', requiresPrescription: true, requiresRegister: true },
  },
  register: { name: 'Controlled drugs register', retentionYears: 2 },
  paymentMethods: ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'],
  supportsCompositionScheme: false,
  csvImportPresets: false,
}
