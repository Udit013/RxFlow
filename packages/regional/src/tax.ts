/**
 * Tax engines. The invoice maths asks "how is a line taxed at rate R?" and gets back a list of
 * components; it never needs to know which country it is in.
 */
import type { TaxSystemId } from './types.js'

export interface TaxContext {
  /** Seller's region (state/province) — only India's GST looks at this. */
  sellerRegion?: string | null
  /** Buyer's region; unknown buyer = treated as local. */
  buyerRegion?: string | null
}

export interface TaxRateComponent {
  code: string //  'CGST' | 'SGST' | 'IGST' | 'VAT' | 'SALES_TAX'
  label: string
  rate: number //  percent
}

export interface TaxComponent extends TaxRateComponent {
  amount: number
}

const norm = (s?: string | null) => (s ?? '').toLowerCase().trim()

/** India: different, known states on both sides → IGST; otherwise CGST + SGST. */
export function isInterRegion(ctx: TaxContext): boolean {
  const seller = norm(ctx.sellerRegion)
  const buyer = norm(ctx.buyerRegion)
  return !!seller && !!buyer && seller !== buyer
}

/** Split a total rate into the components the given tax system charges. */
export function taxComponentsFor(system: TaxSystemId, label: string, rate: number, ctx: TaxContext = {}): TaxRateComponent[] {
  switch (system) {
    case 'IN_GST':
      return isInterRegion(ctx)
        ? [{ code: 'IGST', label: 'IGST', rate }]
        : [
            { code: 'CGST', label: 'CGST', rate: rate / 2 },
            { code: 'SGST', label: 'SGST', rate: rate / 2 },
          ]
    case 'VAT':
      return [{ code: 'VAT', label, rate }]
    case 'SALES_TAX':
      return [{ code: 'SALES_TAX', label, rate }]
    case 'NONE':
      return []
  }
}

export function applyTax(taxable: number, components: TaxRateComponent[]): TaxComponent[] {
  return components.map((c) => ({ ...c, amount: (taxable * c.rate) / 100 }))
}

export function totalTax(components: TaxComponent[]): number {
  return components.reduce((sum, c) => sum + c.amount, 0)
}

/** Pro-rate components (partial returns). */
export function scaleComponents(components: TaxComponent[], ratio: number): TaxComponent[] {
  return components.map((c) => ({ ...c, amount: c.amount * ratio }))
}

/** Merge per-line components into an invoice-level breakdown, grouped by code + rate. */
export function sumComponents(lines: TaxComponent[][]): TaxComponent[] {
  const byKey = new Map<string, TaxComponent>()
  for (const line of lines) {
    for (const c of line) {
      const key = `${c.code}@${c.rate}`
      const prev = byKey.get(key)
      if (prev) prev.amount += c.amount
      else byKey.set(key, { ...c })
    }
  }
  return [...byKey.values()]
}

/**
 * Values for the legacy CGST/SGST/IGST invoice columns. They stay populated for Indian invoices
 * (GSTR-1/3B read them); for every other tax system they are zero and the generic
 * `taxAmount` / `taxBreakdown` carry the tax.
 */
export function legacyGstColumns(components: TaxRateComponent[] | TaxComponent[]) {
  const pick = (code: string) => components.find((c) => c.code === code)
  const amt = (code: string) => {
    const c = pick(code) as TaxComponent | undefined
    return c && 'amount' in c ? c.amount : 0
  }
  return {
    cgstRate: pick('CGST')?.rate ?? 0,
    cgstAmount: amt('CGST'),
    sgstRate: pick('SGST')?.rate ?? 0,
    sgstAmount: amt('SGST'),
    igstRate: pick('IGST')?.rate ?? 0,
    igstAmount: amt('IGST'),
  }
}

/**
 * Rebuild a breakdown for invoice lines created before generic tax storage existed (only Indian
 * GST columns were stored then).
 */
export function componentsFromLegacy(item: {
  cgstRate?: number | null; cgstAmount?: number | null
  sgstRate?: number | null; sgstAmount?: number | null
  igstRate?: number | null; igstAmount?: number | null
}): TaxComponent[] {
  const out: TaxComponent[] = []
  if (item.igstAmount) out.push({ code: 'IGST', label: 'IGST', rate: item.igstRate ?? 0, amount: item.igstAmount })
  if (item.cgstAmount) out.push({ code: 'CGST', label: 'CGST', rate: item.cgstRate ?? 0, amount: item.cgstAmount })
  if (item.sgstAmount) out.push({ code: 'SGST', label: 'SGST', rate: item.sgstRate ?? 0, amount: item.sgstAmount })
  return out
}

/** Round to a cash increment (1 = whole units, 0.05, 0.01 = cents). Avoids float noise. */
export function roundToIncrement(amount: number, increment: number): number {
  if (!increment || increment <= 0) return amount
  return Number((Math.round(amount / increment) * increment).toFixed(6))
}
