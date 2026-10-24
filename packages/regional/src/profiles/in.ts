import type { RegionProfile } from '../types.ts'

/** India — RxFlow's primary market. Mirrors the behaviour the app had before localisation. */
export const IN: RegionProfile = {
  code: 'IN',
  name: 'India',
  flag: '🇮🇳',
  currency: 'INR',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  fiscalYearStartMonth: 4, // April–March
  dateFormat: 'DD MMM YYYY',
  tax: {
    system: 'IN_GST',
    label: 'GST',
    suggestedRates: [0, 5, 12, 18, 28],
    defaultRate: 12,
    invoiceTitle: 'Tax Invoice',
    returns: ['GSTR1', 'GSTR3B'],
  },
  cashRounding: 1, // invoices round to the whole rupee (round-off line)
  fields: {
    taxId: {
      label: 'GSTIN',
      pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      example: '27AAACR5055K1ZV',
    },
    region: { label: 'State', hint: 'Decides CGST+SGST (same state) vs IGST (different states)' },
    postalCode: { label: 'PIN code', pattern: /^[1-9][0-9]{5}$/, example: '400001' },
    license: { label: 'Drug licence number', example: 'MH-MZ1-123456' },
    productCode: { label: 'HSN code', example: '30049099' },
  },
  phone: { dialCode: '+91', minDigits: 10, maxDigits: 10 },
  medicine: { genericNameLabel: 'Generic (salt) name', brandNameLabel: 'Brand name' },
  drugSchedules: {
    OTC: { label: 'OTC', description: 'Over the counter', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_G: { label: 'Schedule G', description: 'Use under medical supervision', requiresPrescription: false, requiresRegister: false },
    SCHEDULE_H: { label: 'Schedule H', description: 'Prescription-only', requiresPrescription: true, requiresRegister: false },
    SCHEDULE_H1: { label: 'Schedule H1', description: 'Prescription-only, recorded in the H1 register', requiresPrescription: true, requiresRegister: true },
    SCHEDULE_X: { label: 'Schedule X', description: 'Narcotic / psychotropic, strict register', requiresPrescription: true, requiresRegister: true },
  },
  register: { name: 'Schedule H1 register', retentionYears: 3 },
  paymentMethods: ['CASH', 'UPI', 'CARD', 'NEFT', 'RTGS', 'CHEQUE', 'CREDIT'],
  supportsCompositionScheme: true,
  csvImportPresets: true,
}
