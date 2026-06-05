'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import Papa from 'papaparse'
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertTriangle, X, Sparkles, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatCurrency } from '@/lib/utils'

// ── Field definitions ────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  { key: 'medicineName', label: 'Medicine Name', hints: ['product', 'item', 'name', 'description', 'drug'] },
  { key: 'batchNumber', label: 'Batch Number', hints: ['batch', 'lot'] },
  { key: 'expiryDate', label: 'Expiry Date', hints: ['expiry', 'exp', 'expdate'] },
  { key: 'quantity', label: 'Quantity', hints: ['qty', 'quantity', 'units', 'pack'] },
  { key: 'purchasePrice', label: 'Purchase Price', hints: ['rate', 'cost', 'ptr', 'pts', 'purchase'] },
  { key: 'mrp', label: 'MRP', hints: ['mrp', 'retail', 'maxprice'] },
] as const

const OPTIONAL_FIELDS = [
  { key: 'gstRate', label: 'GST Rate (%)', hints: ['gst', 'tax', 'rate'] },
  { key: 'discountPercent', label: 'Discount (%)', hints: ['disc', 'discount'] },
] as const

type FieldKey = (typeof REQUIRED_FIELDS)[number]['key'] | (typeof OPTIONAL_FIELDS)[number]['key']

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function autoMapColumn(headers: string[]): Record<FieldKey, string | null> {
  const map: Record<string, string | null> = {}
  const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]
  for (const f of allFields) {
    const match = headers.find((h) => {
      const nh = normalizeHeader(h)
      return f.hints.some((hint) => nh.includes(hint))
    })
    map[f.key] = match ?? null
  }
  return map as Record<FieldKey, string | null>
}

// ── Date parsing — supports DD/MM/YYYY, DD-MM-YYYY, MM/YY, etc. ──────────────

function parseExpiryDate(raw: string): Date | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  // MM/YY → last day of that month
  let m = trimmed.match(/^(\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const month = parseInt(m[1]!) - 1
    let year = parseInt(m[2]!)
    if (year < 100) year += 2000
    return new Date(Date.UTC(year, month + 1, 0)) // last day of month
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const day = parseInt(m[1]!)
    const month = parseInt(m[2]!) - 1
    let year = parseInt(m[3]!)
    if (year < 100) year += 2000
    return new Date(Date.UTC(year, month, day))
  }
  // Fallback: ISO-ish
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d
}

// ── Component ────────────────────────────────────────────────────────────────

interface CsvRow extends Record<string, string> {}
interface ResolvedRow {
  raw: CsvRow
  medicineId: string | null
  medicineName: string
  batchNumber: string
  expiryDate: string // ISO
  quantity: number
  purchasePrice: number
  mrp: number
  gstRate: number
  discountPercent: number
  candidates: Array<{ id: string; name: string; strength?: string; mrp?: number; score: number }>
  error?: string
}

export function CsvImportFlow() {
  const router = useRouter()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [supplier, setSupplier] = useState<{ id: string; name: string; companyName: string; csvPreset?: Record<string, string | null> | null } | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [rawRows, setRawRows] = useState<CsvRow[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({} as any)
  const [resolved, setResolved] = useState<ResolvedRow[]>([])
  const [isMatching, setIsMatching] = useState(false)
  const [presetApplied, setPresetApplied] = useState(false)

  useEffect(() => {
    const u = authService.getStoredUser()
    const primary = u?.stores?.find((s) => s.isPrimary) ?? u?.stores?.[0]
    if (primary) setStoreId(primary.id)
  }, [])

  // Supplier search
  const supRes = useQuery({
    queryKey: ['imp-sup', supplierSearch],
    queryFn: () => api.get('/suppliers', { params: { search: supplierSearch, limit: 5 } }).then((r) => r.data),
    enabled: supplierSearch.length >= 2 && !supplier,
  })

  async function pickSupplier(s: any) {
    // Fetch full record so we get csvPreset
    try {
      const full = await api.get(`/suppliers/${s.id}`)
      setSupplier(full.data.data)
    } catch {
      setSupplier(s)
    }
    setSupplierSearch('')
  }

  // When CSV uploaded AND supplier has a preset, apply it
  useEffect(() => {
    if (rawRows.length === 0 || !supplier?.csvPreset || presetApplied) return
    const preset = supplier.csvPreset
    // Verify all preset columns actually exist in this CSV
    const next: Record<string, string | null> = {}
    for (const f of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      const saved = preset[f.key]
      next[f.key] = saved && csvHeaders.includes(saved) ? saved : mapping[f.key as FieldKey] ?? null
    }
    setMapping(next as any)
    setPresetApplied(true)
    toast.success(`Loaded saved mapping for ${supplier.name}`)
  }, [rawRows, csvHeaders, supplier, presetApplied, mapping])

  const savePreset = useMutation({
    mutationFn: () => api.patch(`/suppliers/${supplier!.id}/csv-preset`, { mapping }),
    onSuccess: () => {
      toast.success(`Saved mapping for ${supplier!.name}`)
      setSupplier((s) => s ? { ...s, csvPreset: mapping as any } : s)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const clearPreset = useMutation({
    mutationFn: () => api.delete(`/suppliers/${supplier!.id}/csv-preset`),
    onSuccess: () => {
      toast.success('Saved mapping cleared')
      setSupplier((s) => s ? { ...s, csvPreset: null } : s)
    },
  })

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as CsvRow[]).filter((r) => Object.values(r).some((v) => String(v).trim() !== ''))
        if (rows.length === 0) {
          toast.error('CSV is empty')
          return
        }
        const headers = Object.keys(rows[0])
        setRawRows(rows)
        setCsvHeaders(headers)
        setMapping(autoMapColumn(headers))
        setStep(2)
      },
      error: (e) => toast.error(`CSV parse failed: ${e.message}`),
    })
  }

  async function runMatch() {
    // Validate mapping
    const missing = REQUIRED_FIELDS.filter((f) => !mapping[f.key])
    if (missing.length > 0) {
      toast.error(`Map these columns: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    setIsMatching(true)
    try {
      // Build rows with mapped values
      const names = rawRows.map((r) => r[mapping.medicineName!] ?? '')
      const matchRes = await api.post('/purchases/match-medicines', { names })
      const matches = matchRes.data.data as Array<{ input: string; candidates: any[] }>

      const out: ResolvedRow[] = rawRows.map((r, i) => {
        const med = (r[mapping.medicineName!] ?? '').trim()
        const batch = (r[mapping.batchNumber!] ?? '').trim()
        const expRaw = r[mapping.expiryDate!] ?? ''
        const exp = parseExpiryDate(expRaw)
        const qty = Number(r[mapping.quantity!] ?? 0)
        const buy = Number(r[mapping.purchasePrice!] ?? 0)
        const mrp = Number(r[mapping.mrp!] ?? 0)
        const gst = mapping.gstRate ? Number(r[mapping.gstRate] ?? 12) : 12
        const disc = mapping.discountPercent ? Number(r[mapping.discountPercent] ?? 0) : 0

        const cand = matches[i]?.candidates ?? []
        const topMatch = cand[0]
        const isHighConfidence = topMatch && topMatch.score >= 0.85

        let error: string | undefined
        if (!med) error = 'Medicine name missing'
        else if (!batch) error = 'Batch number missing'
        else if (!exp) error = `Bad expiry date "${expRaw}"`
        else if (qty <= 0) error = 'Quantity must be positive'
        else if (buy <= 0) error = 'Purchase price must be positive'
        else if (mrp <= 0) error = 'MRP must be positive'

        return {
          raw: r,
          medicineId: isHighConfidence ? topMatch.id : null,
          medicineName: med,
          batchNumber: batch,
          expiryDate: exp ? exp.toISOString() : '',
          quantity: qty,
          purchasePrice: buy,
          mrp,
          gstRate: gst,
          discountPercent: disc,
          candidates: cand,
          error,
        }
      })

      setResolved(out)
      setStep(3)
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Match failed')
    } finally {
      setIsMatching(false)
    }
  }

  const importMut = useMutation({
    mutationFn: () => {
      if (!supplier || !storeId) throw new Error('Pick supplier first')
      const validRows = resolved.filter((r) => r.medicineId && !r.error)
      return api.post('/purchases/bulk-import', {
        supplierId: supplier.id,
        storeId,
        notes: `Imported from CSV — ${validRows.length} items`,
        rows: validRows.map((r) => ({
          medicineId: r.medicineId,
          batchNumber: r.batchNumber,
          expiryDate: r.expiryDate,
          quantity: r.quantity,
          purchasePrice: r.purchasePrice,
          mrp: r.mrp,
          sellingPrice: r.mrp,
          gstRate: r.gstRate,
          discountPercent: r.discountPercent,
        })),
      })
    },
    onSuccess: (res) => {
      toast.success(`Imported ${res.data.data.batchCount} batch(es) · ${res.data.data.orderNumber}`)
      router.push(`/dashboard/orders/${res.data.data.orderId}`)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.message ?? 'Import failed'),
  })

  const validCount = useMemo(() => resolved.filter((r) => r.medicineId && !r.error).length, [resolved])
  const errorCount = useMemo(() => resolved.filter((r) => r.error).length, [resolved])
  const unmatchedCount = useMemo(() => resolved.filter((r) => !r.medicineId && !r.error).length, [resolved])

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Import Purchase from CSV</h1>
          <p className="text-sm text-slate-500">Bulk-add stock from a supplier's invoice CSV/Excel</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 text-sm">
        {[
          { n: 1, label: 'Pick supplier + upload' },
          { n: 2, label: 'Map columns' },
          { n: 3, label: 'Verify + import' },
        ].map(({ n, label }) => (
          <div key={n} className={cn('flex items-center gap-2', step === n ? 'text-brand-700 font-semibold' : step > n ? 'text-green-600' : 'text-slate-400')}>
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs', step === n ? 'bg-brand-600 text-white' : step > n ? 'bg-green-600 text-white' : 'bg-slate-200')}>
              {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
            </div>
            <span>{label}</span>
            {n < 3 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-2" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold mb-3">1. Supplier</h3>
            {supplier ? (
              <div className="flex items-center justify-between p-3 bg-brand-50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{supplier.name}</p>
                    {supplier.csvPreset && <span className="badge-success text-[10px]">Saved mapping</span>}
                  </div>
                  <p className="text-xs text-slate-500">{supplier.companyName}</p>
                </div>
                <button onClick={() => { setSupplier(null); setSupplierSearch(''); setPresetApplied(false) }} className="text-xs text-slate-500 hover:text-red-600">Change</button>
              </div>
            ) : (
              <>
                <input className="input" placeholder="Search supplier..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
                {supRes.data?.data?.length > 0 && (
                  <ul className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                    {supRes.data.data.map((s: any) => (
                      <li key={s.id} onClick={() => pickSupplier(s)} className="p-3 hover:bg-slate-50 cursor-pointer">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.companyName}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold mb-3">2. Upload supplier CSV</h3>
            <label className={cn(
              'border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors',
              !supplier && 'opacity-50 pointer-events-none'
            )}>
              <Upload className="w-8 h-8 text-slate-400" />
              <p className="font-medium text-slate-700">Drop CSV here or click to browse</p>
              <p className="text-xs text-slate-500">Common formats: distributor invoice exports, Marg purchase imports</p>
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer hover:text-slate-700">Expected columns (any order, any name — you'll map them)</summary>
              <ul className="mt-2 ml-4 list-disc">
                <li>Medicine / Product Name (required)</li>
                <li>Batch Number (required)</li>
                <li>Expiry Date — supports MM/YY, DD/MM/YYYY (required)</li>
                <li>Quantity (required)</li>
                <li>Purchase Rate / PTR / Cost (required)</li>
                <li>MRP (required)</li>
                <li>GST % (optional, defaults to 12%)</li>
                <li>Discount % (optional)</li>
              </ul>
            </details>
          </div>
        </div>
      )}

      {/* Step 2 — map columns */}
      {step === 2 && (
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold mb-1">Map your CSV columns</h3>
            <p className="text-xs text-slate-500">{rawRows.length} rows detected · auto-mapped where possible</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((f) => {
              const isRequired = (REQUIRED_FIELDS as readonly any[]).includes(f as any)
              return (
                <div key={f.key}>
                  <label className="label">
                    {f.label} {isRequired ? <span className="text-red-600">*</span> : <span className="text-slate-400 text-xs">(optional)</span>}
                  </label>
                  <select
                    className="input"
                    value={mapping[f.key as FieldKey] ?? ''}
                    onChange={(e) => setMapping((p) => ({ ...p, [f.key]: e.target.value || null }))}
                  >
                    <option value="">— Not mapped —</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-2">Preview (first 5 rows)</p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {csvHeaders.map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-slate-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {csvHeaders.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-slate-600">{r[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <button onClick={() => { setStep(1); setRawRows([]); setPresetApplied(false) }} className="btn-secondary">Back</button>
            <div className="flex items-center gap-2">
              {supplier?.csvPreset && (
                <button onClick={() => clearPreset.mutate()} disabled={clearPreset.isPending} className="btn-secondary text-xs" title="Remove saved mapping for this supplier">
                  <Trash2 className="w-3.5 h-3.5" /> Clear saved mapping
                </button>
              )}
              <button onClick={() => savePreset.mutate()} disabled={savePreset.isPending} className="btn-secondary text-xs" title="Save this mapping so it auto-applies for future imports from this supplier">
                <Save className="w-3.5 h-3.5" /> {supplier?.csvPreset ? 'Update saved mapping' : 'Save mapping for next time'}
              </button>
              <button onClick={runMatch} disabled={isMatching} className="btn-primary">
                <Sparkles className="w-4 h-4" /> {isMatching ? 'Matching...' : 'Match & verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — verify + import */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="metric-card">
              <p className="text-xs text-slate-500 uppercase">Total</p>
              <p className="text-lg font-bold">{resolved.length}</p>
            </div>
            <div className="metric-card">
              <p className="text-xs text-slate-500 uppercase">Ready to import</p>
              <p className="text-lg font-bold text-green-600">{validCount}</p>
            </div>
            <div className="metric-card">
              <p className="text-xs text-slate-500 uppercase">Needs medicine match</p>
              <p className="text-lg font-bold text-amber-600">{unmatchedCount}</p>
            </div>
            <div className="metric-card">
              <p className="text-xs text-slate-500 uppercase">Errors</p>
              <p className="text-lg font-bold text-red-600">{errorCount}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="px-3 py-2 text-left">CSV Name → Match</th>
                    <th className="px-3 py-2 text-left">Batch / Exp</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Buy</th>
                    <th className="px-3 py-2 text-right">MRP</th>
                    <th className="px-3 py-2 text-center">GST</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolved.map((r, i) => (
                    <tr key={i} className={cn(r.error && 'bg-red-50', !r.medicineId && !r.error && 'bg-amber-50')}>
                      <td className="px-3 py-2">
                        <p className="text-xs text-slate-500">CSV: {r.medicineName}</p>
                        {r.medicineId ? (
                          <p className="font-medium text-sm">
                            ✓ {r.candidates.find((c) => c.id === r.medicineId)?.name ?? 'Matched'}
                          </p>
                        ) : (
                          <select
                            className="text-xs border border-amber-300 rounded px-2 py-1 mt-1"
                            value=""
                            onChange={(e) => {
                              const id = e.target.value || null
                              setResolved((p) => p.map((row, idx) => idx === i ? { ...row, medicineId: id } : row))
                            }}
                          >
                            <option value="">— Pick match —</option>
                            {r.candidates.map((c) => (
                              <option key={c.id} value={c.id}>{c.name} ({c.strength}) · score {c.score}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-xs">{r.batchNumber}</p>
                        <p className="text-xs text-slate-500">{r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('en-IN') : '—'}</p>
                      </td>
                      <td className="px-3 py-2 text-center">{r.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(r.purchasePrice)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(r.mrp)}</td>
                      <td className="px-3 py-2 text-center text-xs">{r.gstRate}%</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.quantity * r.purchasePrice * (1 + r.gstRate / 100))}</td>
                      <td className="px-3 py-2 text-center">
                        {r.error ? <span className="badge-danger" title={r.error}>Error</span> :
                         !r.medicineId ? <span className="badge-warning">Unmatched</span> :
                         <span className="badge-success">Ready</span>}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setResolved((p) => p.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-red-600"
                          title="Remove row"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {errorCount > 0 && (
            <div className="card p-3 bg-red-50 border-red-200 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
              <p>{errorCount} row(s) have errors. Fix them in the CSV and re-upload, or remove them with the × button. They won't be imported.</p>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-secondary">Back to mapping</button>
            <button
              onClick={() => importMut.mutate()}
              disabled={validCount === 0 || importMut.isPending}
              className="btn-primary"
            >
              {importMut.isPending ? 'Importing...' : `Import ${validCount} row(s) as purchase`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
