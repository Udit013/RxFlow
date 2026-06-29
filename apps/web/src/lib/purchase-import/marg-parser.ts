// ── MARG-style H/T/F parser factory ──────────────────────────────────────────
// Indian pharmacy distributors overwhelmingly export from MARG ERP (and clones)
// as headerless, positional CSVs with one Header (H), many Transaction (T) and a
// Footer (F) row. The column ORDER differs per distributor, so each supplier is
// expressed as a small column-map config — adding a distributor = adding a config.

import type { NormalizedInvoice, NormalizedLine, SupplierParser } from './types'

/** Indices are 0-based positions within a T (transaction) row. */
export interface MargColumnMap {
  name: number
  pack?: number
  manufacturer?: number
  batch?: number
  expiry?: number
  quantity?: number
  free?: number
  rate?: number
  mrp?: number
  discountPercent?: number
  gstRate?: number
  /** When only CGST rate is present, the GST rate is this value × 2. */
  cgstRate?: number
  hsn?: number
  productCode?: number
}

export interface MargHeaderMap {
  invoiceNumber?: number // index in H row
  invoiceDate?: number
  supplierName?: number
}

export interface MargParserConfig {
  id: string
  label: string
  description?: string
  columns: MargColumnMap
  header?: MargHeaderMap
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const str = (v: string | undefined): string | undefined => {
  const s = (v ?? '').trim()
  return s.length ? s : undefined
}

/** Parse the date formats seen across distributors: ddmmyyyy, dd/mm/yyyy, mm/yy. */
export function parseFlexibleDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const t = String(raw).trim()
  if (!t || /^0+$/.test(t)) return undefined
  // 8-digit ddmmyyyy (e.g. 28022028) or yyyymmdd
  let m = t.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) {
    const [, a, b, y] = m
    const day = parseInt(a!), month = parseInt(b!)
    // ddmmyyyy if first pair looks like a day
    if (month >= 1 && month <= 12) return iso(parseInt(y!), month, day)
  }
  // dd/mm/yyyy or dd-mm-yyyy
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    let y = parseInt(m[3]!); if (y < 100) y += 2000
    return iso(y, parseInt(m[2]!), parseInt(m[1]!))
  }
  // mm/yy → last day of month
  m = t.match(/^(\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    let y = parseInt(m[2]!); if (y < 100) y += 2000
    return isoLastDay(y, parseInt(m[1]!))
  }
  const d = new Date(t)
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

function iso(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return undefined
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}
function isoLastDay(year: number, month: number): string | undefined {
  if (month < 1 || month > 12) return undefined
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function buildLine(cols: MargColumnMap, row: string[]): NormalizedLine {
  const gstRate = cols.gstRate !== undefined ? num(row[cols.gstRate])
    : cols.cgstRate !== undefined ? (num(row[cols.cgstRate]) ?? 0) * 2
    : undefined
  return {
    productName: str(cols.name !== undefined ? row[cols.name] : undefined) ?? '',
    pack: cols.pack !== undefined ? str(row[cols.pack]) : undefined,
    manufacturer: cols.manufacturer !== undefined ? str(row[cols.manufacturer]) : undefined,
    batchNumber: cols.batch !== undefined ? str(row[cols.batch]) : undefined,
    expiryDate: cols.expiry !== undefined ? parseFlexibleDate(row[cols.expiry]) : undefined,
    quantity: cols.quantity !== undefined ? (num(row[cols.quantity]) ?? 0) : 0,
    freeQuantity: cols.free !== undefined ? num(row[cols.free]) : undefined,
    purchaseRate: cols.rate !== undefined ? num(row[cols.rate]) : undefined,
    mrp: cols.mrp !== undefined ? num(row[cols.mrp]) : undefined,
    discountPercent: cols.discountPercent !== undefined ? num(row[cols.discountPercent]) : undefined,
    gstRate,
    hsn: cols.hsn !== undefined ? str(row[cols.hsn]) : undefined,
    productCode: cols.productCode !== undefined ? str(row[cols.productCode]) : undefined,
    _raw: row,
  }
}

/** A T-row line is "valid" for detection if its core fields make sense. */
function lineLooksValid(l: NormalizedLine): boolean {
  const hasName = /[a-z]/i.test(l.productName)
  const expiryOk = !l.expiryDate || (() => {
    const y = Number(l.expiryDate.slice(0, 4)); return y >= 2023 && y <= 2037
  })()
  const qtyOk = l.quantity > 0 && l.quantity < 1_000_00
  const rateOk = l.purchaseRate === undefined || (l.purchaseRate > 0 && l.purchaseRate < 1_000_000)
  return hasName && expiryOk && qtyOk && rateOk
}

export function createMargParser(cfg: MargParserConfig): SupplierParser {
  const tRows = (rows: string[][]) => rows.filter((r) => (r[0] ?? '').trim().toUpperCase() === 'T')
  const hRow = (rows: string[][]) => rows.find((r) => (r[0] ?? '').trim().toUpperCase() === 'H')

  return {
    id: cfg.id,
    label: cfg.label,
    description: cfg.description,
    detect: (rows) => {
      const ts = tRows(rows)
      if (ts.length === 0) return 0
      const lines = ts.map((r) => buildLine(cfg.columns, r))
      const valid = lines.filter(lineLooksValid).length
      const base = valid / lines.length
      // Tiebreak for near-identical layouts: reward a column map whose HSN
      // column actually contains a plausible HSN (4–8 digit code, not a barcode).
      const hsnPlausible = lines.filter((l) => l.hsn && /^\d{4,8}$/.test(l.hsn)).length / lines.length
      return base + 0.05 * hsnPlausible
    },
    parse: (rows) => {
      const h = hRow(rows)
      const lines = tRows(rows).map((r) => buildLine(cfg.columns, r))
      const inv: NormalizedInvoice = {
        parserId: cfg.id,
        parserLabel: cfg.label,
        lines,
        invoiceNumber: h && cfg.header?.invoiceNumber !== undefined ? str(h[cfg.header.invoiceNumber]) : undefined,
        invoiceDate: h && cfg.header?.invoiceDate !== undefined ? parseFlexibleDate(h[cfg.header.invoiceDate]) : undefined,
        supplierName: h && cfg.header?.supplierName !== undefined ? str(h[cfg.header.supplierName]) : undefined,
      }
      return inv
    },
  }
}
