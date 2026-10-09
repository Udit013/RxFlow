/**
 * Regional configuration model.
 *
 * The core of RxFlow (orders, stock, invoices, ledgers) is country-agnostic. Everything that
 * differs by country — currency, formats, tax system, field labels and validation, what a drug
 * classification means, which registers the law requires — is described by a `RegionProfile`.
 * Adding a country means adding one profile file; no business-logic changes.
 */

/** ISO 3166-1 alpha-2 code, or 'INTL' for the generic international profile. */
export type CountryCode = string

/** Tax engines the invoice maths knows how to apply. */
export type TaxSystemId =
  | 'IN_GST' //   India — CGST+SGST within a state, IGST between states
  | 'VAT' //      single-component value-added tax (UK, EU, UAE, …)
  | 'SALES_TAX' // single-component sales tax collected at sale (US, …)
  | 'NONE' //     no consumption tax on invoices

/**
 * The five classification tiers stored on every medicine (`Medicine.schedule`). The stored codes
 * are historical (they come from India's Drugs and Cosmetics Rules), but each tier has a
 * country-neutral MEANING, and every profile labels the tiers in local regulatory terms:
 *
 *   OTC          → sold freely
 *   SCHEDULE_G   → pharmacy-only / supervised sale, no prescription
 *   SCHEDULE_H   → prescription-only
 *   SCHEDULE_H1  → prescription + recorded in a restricted-drugs register
 *   SCHEDULE_X   → controlled substance: prescription + strict register
 */
export type DrugScheduleCode = 'OTC' | 'SCHEDULE_G' | 'SCHEDULE_H' | 'SCHEDULE_H1' | 'SCHEDULE_X'
export const DRUG_SCHEDULE_CODES: DrugScheduleCode[] = ['OTC', 'SCHEDULE_G', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X']

export interface DrugScheduleRule {
  label: string
  description: string
  requiresPrescription: boolean
  /** Sales must be recorded in the controlled-drugs register. */
  requiresRegister: boolean
}

/** All payment methods the system can record (`PaymentMethod` enum). */
export type PaymentMethodCode = 'CASH' | 'CARD' | 'UPI' | 'NEFT' | 'RTGS' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT'
export const PAYMENT_METHOD_CODES: PaymentMethodCode[] = ['CASH', 'CARD', 'UPI', 'NEFT', 'RTGS', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT']

export interface FieldRule {
  label: string
  /** Optional format check; absent = free text. */
  pattern?: RegExp
  example?: string
  /** Shown under the field. */
  hint?: string
}

export interface RegionProfile {
  code: CountryCode
  name: string
  flag: string

  // ── Defaults a tenant can override ──────────────────────────────────────────
  currency: string //               ISO 4217
  locale: string //                 BCP 47, drives number/date formatting and UI language
  timezone: string //               IANA zone
  fiscalYearStartMonth: number //   1–12 (India: 4 = April)
  dateFormat: string //             dayjs pattern for dates in the UI and documents

  // ── Tax ─────────────────────────────────────────────────────────────────────
  tax: {
    system: TaxSystemId
    /** What tax is called on invoices: "GST", "VAT", "Sales tax". */
    label: string
    /** Rates offered in pickers (percent). */
    suggestedRates: number[]
    /** Rate used when a medicine has none recorded. */
    defaultRate: number
    /** Heading on the tax document. */
    invoiceTitle: string
    /** Statutory returns this country's reports screen offers (others get the generic tax summary). */
    returns: string[]
  }
  /** Round invoice grand totals to this increment (India: whole rupee; 0.01 = no extra rounding). */
  cashRounding: number

  // ── Labels and validation for identity fields ───────────────────────────────
  fields: {
    taxId: FieldRule //        GSTIN / VAT number / EIN / TRN
    region: FieldRule //       State / County / Emirate — also drives India's inter-state GST
    postalCode: FieldRule //   PIN code / ZIP code / Postcode
    license: FieldRule //      drug licence / pharmacy registration
    productCode: FieldRule //  HSN / HS / commodity code on invoice lines
  }
  phone: { dialCode: string; minDigits: number; maxDigits: number }

  // ── Medicines & regulation ──────────────────────────────────────────────────
  medicine: {
    genericNameLabel: string
    brandNameLabel: string
  }
  drugSchedules: Record<DrugScheduleCode, DrugScheduleRule>
  register: {
    /** Name of the controlled/restricted-drugs register. */
    name: string
    /** Minimum years records must be kept (informational). */
    retentionYears: number
  }

  // ── Money movement ──────────────────────────────────────────────────────────
  paymentMethods: PaymentMethodCode[]
  paymentLabels?: Partial<Record<PaymentMethodCode, string>>

  /** Country-specific tax-registration categories for customers/suppliers (India: composition scheme). */
  supportsCompositionScheme: boolean
  /** Distributor CSV formats bundled for this market (purchase import auto-detection). */
  csvImportPresets: boolean
}

/** A tenant's effective regional settings: its country's profile plus its own overrides. */
export interface ResolvedRegion extends RegionProfile {
  country: CountryCode
}

export interface TenantRegionSettings {
  country?: string | null
  currency?: string | null
  locale?: string | null
  timezone?: string | null
  fiscalYearStartMonth?: number | null
}
