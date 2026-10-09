import { validateTaxId, type ResolvedRegion } from '@rxflow/regional'

/**
 * react-hook-form rules for a tax-registration-number field (GSTIN / VAT no. / EIN / TRN …):
 * upper-cased and trimmed, format-checked against the pharmacy's country (free text when the
 * country has no fixed format).
 */
export function taxIdRules(region: ResolvedRegion) {
  return {
    validate: (v?: string) => (v ? validateTaxId(region, v) ?? true : true),
    setValueAs: (v: string) => (v ? v.toUpperCase().trim() : v),
  }
}
