// ── Shared internal purchase-import model ────────────────────────────────────
// Every supplier CSV format is normalized into this single shape before import,
// so the rest of the pipeline (preview, validation, matching, import) is format-
// agnostic. To support a new distributor, add a parser that produces this — no
// changes to the import core are needed.

export interface NormalizedLine {
  /** Distributor's product description, e.g. "METOCARD XL 100 10'S" */
  productName: string
  pack?: string
  manufacturer?: string
  batchNumber?: string
  /** ISO date string (yyyy-mm-dd) once parsed */
  expiryDate?: string
  quantity: number
  freeQuantity?: number
  /** Purchase rate / PTR per unit */
  purchaseRate?: number
  mrp?: number
  discountPercent?: number
  gstRate?: number
  hsn?: string
  productCode?: string
  /** Raw source columns, kept for debugging / manual correction */
  _raw?: string[]
}

export interface NormalizedInvoice {
  supplierName?: string
  invoiceNumber?: string
  /** ISO date string */
  invoiceDate?: string
  lines: NormalizedLine[]
  parserId: string
  parserLabel: string
}

export interface SupplierParser {
  id: string
  label: string
  /** Short note shown in the format picker */
  description?: string
  /** Confidence in [0,1] that this parser can read the given rows. */
  detect: (rows: string[][]) => number
  parse: (rows: string[][]) => NormalizedInvoice
}
