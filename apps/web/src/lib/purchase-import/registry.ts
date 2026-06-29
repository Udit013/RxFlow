// ── Supplier parser registry + auto-detection ────────────────────────────────
// Adding a new distributor = add one config object below. The import pipeline
// never changes. Column indices were derived from real sample invoices and
// validated against each file's footer totals.

import type { NormalizedInvoice, SupplierParser } from './types'
import { createMargParser } from './marg-parser'

export const PARSERS: SupplierParser[] = [
  createMargParser({
    id: 'marg-bluestar',
    label: 'Blue Star / MARG (rate@10)',
    description: 'H/T/F · rate col 11, qty col 16',
    columns: { name: 5, pack: 6, manufacturer: 7, batch: 8, expiry: 9, rate: 10, mrp: 13, quantity: 15, cgstRate: 22, hsn: 30, productCode: 4 },
    header: { invoiceNumber: 2, invoiceDate: 3, supplierName: 10 },
  }),
  createMargParser({
    id: 'marg-torrent',
    label: 'Torrent / SR style (rate@13)',
    description: 'H/T/F · rate col 14, qty col 21, GST col 23',
    columns: { name: 5, pack: 6, manufacturer: 7, batch: 8, expiry: 9, rate: 13, mrp: 16, quantity: 20, discountPercent: 12, gstRate: 22, hsn: 28, productCode: 3 },
    header: { invoiceNumber: 2, invoiceDate: 3 },
  }),
  createMargParser({
    id: 'marg-chandi',
    label: 'Chandi Medical style (rate@13, HSN@27)',
    description: 'H/T/F · rate col 14, qty col 21, HSN col 28',
    columns: { name: 5, pack: 6, manufacturer: 7, batch: 8, expiry: 9, rate: 13, mrp: 16, quantity: 20, discountPercent: 12, gstRate: 22, hsn: 27, productCode: 3 },
    header: { invoiceNumber: 2, invoiceDate: 3 },
  }),
  createMargParser({
    id: 'margerp-manada',
    label: 'MARGERP / Manada style (rate@14)',
    description: 'H/T/F MARGERP · rate col 15, qty col 21, HSN col 38',
    columns: { name: 5, pack: 6, manufacturer: 2, batch: 8, expiry: 9, rate: 14, mrp: 16, quantity: 20, discountPercent: 22, hsn: 38, productCode: 3 },
    header: { invoiceNumber: 2, invoiceDate: 3 },
  }),
  createMargParser({
    id: 'margerp-lifeline',
    label: 'MARGERP / Life Line style (rate@11)',
    description: 'H/T/F MARGERP · rate col 12, qty col 16, disc% col 18',
    columns: { name: 5, pack: 6, manufacturer: 2, batch: 8, expiry: 9, rate: 11, mrp: 12, quantity: 15, free: 16, discountPercent: 17, cgstRate: 22, hsn: 30, productCode: 3 },
    header: { invoiceNumber: 2, invoiceDate: 3 },
  }),
]

export interface DetectionResult {
  parser: SupplierParser
  confidence: number
}

/** Rank all parsers by how confidently they can read these rows. */
export function detectParsers(rows: string[][]): DetectionResult[] {
  return PARSERS
    .map((parser) => ({ parser, confidence: parser.detect(rows) }))
    .sort((a, b) => b.confidence - a.confidence)
}

/** Best parser if confident enough, else null (caller prompts manual select). */
export function autoDetect(rows: string[][]): DetectionResult | null {
  const ranked = detectParsers(rows)
  const top = ranked[0]
  return top && top.confidence >= 0.6 ? top : null
}

export function parseWith(parserId: string, rows: string[][]): NormalizedInvoice | null {
  const parser = PARSERS.find((p) => p.id === parserId)
  return parser ? parser.parse(rows) : null
}

/** Is this an H/T/F-style file at all? (vs a normal headered CSV) */
export function looksLikeHtfFormat(rows: string[][]): boolean {
  const firstCells = rows.slice(0, 30).map((r) => (r[0] ?? '').trim().toUpperCase())
  const hasT = firstCells.includes('T')
  const hasHorF = firstCells.includes('H') || firstCells.includes('F')
  return hasT && hasHorF
}
