import { componentsFromLegacy, type TaxComponent } from '@rxflow/regional'

/**
 * Tax components of invoices and their lines, for display. New documents carry a
 * country-agnostic `taxBreakdown`; older (Indian) ones only have CGST/SGST/IGST columns, which
 * are converted so every document renders the same way.
 */
interface LegacyLine {
  taxBreakdown?: unknown
  cgstRate?: number | null; cgstAmount?: number | null
  sgstRate?: number | null; sgstAmount?: number | null
  igstRate?: number | null; igstAmount?: number | null
}

export function lineTaxComponents(line: LegacyLine): TaxComponent[] {
  return Array.isArray(line.taxBreakdown) ? (line.taxBreakdown as TaxComponent[]) : componentsFromLegacy(line)
}

/** Distinct component codes across lines, in first-seen order — one table column each. */
export function taxColumns(lines: LegacyLine[]): { code: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const l of lines) for (const c of lineTaxComponents(l)) if (!seen.has(c.code)) seen.set(c.code, c.label)
  return [...seen].map(([code, label]) => ({ code, label }))
}

export function lineTaxFor(line: LegacyLine, code: string): number {
  return lineTaxComponents(line).filter((c) => c.code === code).reduce((s, c) => s + c.amount, 0)
}

/** Invoice-level totals per component, labelled with the rate when it is a single rate. */
export function invoiceTaxRows(inv: LegacyLine & { cgst?: number; sgst?: number; igst?: number; items?: LegacyLine[] }): { label: string; amount: number }[] {
  let comps: TaxComponent[]
  if (Array.isArray(inv.taxBreakdown)) comps = inv.taxBreakdown as TaxComponent[]
  else if (inv.items?.length) comps = inv.items.flatMap(lineTaxComponents)
  else {
    comps = [
      { code: 'CGST', label: 'CGST', rate: 0, amount: inv.cgst ?? 0 },
      { code: 'SGST', label: 'SGST', rate: 0, amount: inv.sgst ?? 0 },
      { code: 'IGST', label: 'IGST', rate: 0, amount: inv.igst ?? 0 },
    ].filter((c) => c.amount)
  }
  const byCode = new Map<string, { label: string; amount: number; rates: Set<number> }>()
  for (const c of comps) {
    const row = byCode.get(c.code) ?? { label: c.label, amount: 0, rates: new Set<number>() }
    row.amount += c.amount
    if (c.rate) row.rates.add(c.rate)
    byCode.set(c.code, row)
  }
  return [...byCode.values()].map((r) => ({
    label: r.rates.size === 1 ? `${r.label} @ ${[...r.rates][0]}%` : r.label,
    amount: r.amount,
  }))
}
