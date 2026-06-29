'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import Papa from 'papaparse'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Sparkles, Save, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatCurrency } from '@/lib/utils'
import { PARSERS, autoDetect, parseWith, looksLikeHtfFormat } from '@/lib/purchase-import/registry'
import type { NormalizedLine } from '@/lib/purchase-import/types'

interface MatchCandidate { id: string; name: string; strength?: string; manufacturer?: string; mrp?: number; hsn?: string; gstRate?: number; score: number }

interface PreviewRow extends NormalizedLine {
  _id: string
  action: 'map' | 'create' | 'skip'
  medicineId: string | null
  candidates: MatchCandidate[]
  duplicate: boolean
}

interface Supplier { id: string; name: string; companyName: string }

function guessDosageForm(text: string): string {
  const t = text.toUpperCase()
  if (/\b(SYP|SYRUP|SUSP|ML\b|DROP|ELIXIR)/.test(t)) return 'SYRUP'
  if (/\bINJ|VIAL|AMP/.test(t)) return 'INJECTION'
  if (/\bGEL/.test(t)) return 'GEL'
  if (/\bCREAM/.test(t)) return 'CREAM'
  if (/\bOINT/.test(t)) return 'OINTMENT'
  if (/\bDROP/.test(t)) return 'DROPS'
  if (/\bCAP/.test(t)) return 'CAPSULE'
  return 'TABLET'
}

function rowErrors(r: PreviewRow): string[] {
  const e: string[] = []
  if (!r.productName) e.push('Missing product name')
  if (!r.batchNumber) e.push('Missing batch')
  if (!r.expiryDate) e.push('Missing/invalid expiry')
  if (!(r.quantity > 0)) e.push('Quantity must be > 0')
  if (!(r.purchaseRate && r.purchaseRate > 0)) e.push('Purchase rate must be > 0')
  if (!(r.mrp && r.mrp > 0)) e.push('MRP must be > 0')
  if (r.action === 'map' && !r.medicineId) e.push('No product mapped')
  return e
}

export function SmartCsvImport({ onUseGenericMapper }: { onUseGenericMapper?: () => void }) {
  const router = useRouter()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [parserId, setParserId] = useState<string | null>(null)
  const [detectedId, setDetectedId] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [matching, setMatching] = useState(false)
  const [summary, setSummary] = useState<{ imported: number; skipped: number; failed: number } | null>(null)
  const [addCommission, setAddCommission] = useState(false)
  const [salesRepId, setSalesRepId] = useState('')
  const [commissionPercent, setCommissionPercent] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const u = authService.getStoredUser()
    const primary = u?.stores?.find((s) => s.isPrimary) ?? u?.stores?.[0]
    if (primary) setStoreId(primary.id)
  }, [])

  const supplierResults = useQuery({
    queryKey: ['smartimp-sup', supplierSearch],
    queryFn: () => api.get('/suppliers', { params: { search: supplierSearch, limit: 5 } }).then((r) => r.data),
    enabled: supplierSearch.length >= 2 && !supplier,
  })

  const salesRepsQuery = useQuery({
    queryKey: ['smartimp-reps'],
    queryFn: () => api.get('/sales-reps', { params: { active: 'true', limit: 50 } }).then((r) => r.data),
  })
  const salesReps: { id: string; name: string; defaultCommissionPercent: number }[] = salesRepsQuery.data?.data ?? []

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data as string[][]
        if (!looksLikeHtfFormat(parsed)) {
          toast.warning('This file doesn\'t look like a distributor H/T/F invoice. Try the generic column-mapping importer.')
        }
        setRawRows(parsed)
        const det = autoDetect(parsed)
        const chosen = det?.parser.id ?? PARSERS[0]!.id
        setDetectedId(det?.parser.id ?? null)
        setParserId(chosen)
        buildRows(chosen, parsed)
      },
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  async function buildRows(pid: string, raw: string[][]) {
    const inv = parseWith(pid, raw)
    if (!inv) return
    // Flag duplicate (same name+batch) within the file
    const seen = new Set<string>()
    const base: PreviewRow[] = inv.lines.map((l, i) => {
      const key = `${l.productName}|${l.batchNumber}`.toLowerCase()
      const duplicate = seen.has(key)
      seen.add(key)
      return { ...l, _id: `r${i}`, action: 'create', medicineId: null, candidates: [], duplicate }
    })
    setRows(base)
    // Fuzzy-match product names against the master catalog
    setMatching(true)
    try {
      const names = Array.from(new Set(base.map((r) => r.productName).filter(Boolean)))
      const res = await api.post('/purchases/match-medicines', { names })
      const byName = new Map<string, MatchCandidate[]>(
        (res.data.data as { input: string; candidates: MatchCandidate[] }[]).map((d) => [d.input, d.candidates])
      )
      setRows((prev) => prev.map((r) => {
        const cands = byName.get(r.productName) ?? []
        const best = cands[0]
        if (best && best.score >= 0.6) {
          return { ...r, candidates: cands, medicineId: best.id, action: 'map', gstRate: r.gstRate ?? best.gstRate }
        }
        return { ...r, candidates: cands, action: 'create' }
      }))
    } catch {
      toast.error('Product matching failed — you can still map manually')
    } finally {
      setMatching(false)
    }
  }

  function update(id: string, patch: Partial<PreviewRow>) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)))
  }

  function reparse(pid: string) {
    setParserId(pid)
    if (rawRows.length) buildRows(pid, rawRows)
  }

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.action !== 'skip')
    const errored = active.filter((r) => rowErrors(r).length > 0).length
    const value = active.reduce((s, r) => s + (r.quantity || 0) * (r.purchaseRate || 0), 0)
    return { active: active.length, errored, value }
  }, [rows])

  const importMut = useMutation({
    mutationFn: async () => {
      if (!supplier) throw new Error('Pick a supplier first')
      if (!storeId) throw new Error('No store assigned')
      const toImport = rows.filter((r) => r.action !== 'skip' && rowErrors(r).length === 0)
      if (toImport.length === 0) throw new Error('No valid rows to import')

      let failed = 0
      const resolved: any[] = []
      for (const r of toImport) {
        let medicineId = r.medicineId
        if (r.action === 'create' || !medicineId) {
          try {
            const created = await api.post('/medicines', {
              name: r.productName,
              genericName: r.productName,
              brandName: r.productName,
              manufacturerName: r.manufacturer || 'Unknown',
              dosageForm: guessDosageForm(`${r.productName} ${r.pack ?? ''}`),
              strength: 'NA',
              packSize: r.pack || '1',
              mrp: r.mrp || 0,
              hsn: r.hsn || '30049099',
              gstRate: r.gstRate ?? 12,
            })
            medicineId = created.data.data.id
          } catch {
            failed++
            continue
          }
        }
        resolved.push({
          medicineId,
          batchNumber: r.batchNumber,
          expiryDate: r.expiryDate,
          quantity: Math.max(1, Math.round(r.quantity)),
          purchasePrice: r.purchaseRate,
          mrp: r.mrp,
          sellingPrice: r.mrp,
          gstRate: r.gstRate ?? 12,
          discountPercent: r.discountPercent ?? 0,
        })
      }

      if (resolved.length === 0) throw new Error('All rows failed to resolve a product')
      const res = await api.post('/purchases/bulk-import', {
        supplierId: supplier.id,
        storeId,
        notes: fileName ? `Imported from ${fileName}` : undefined,
        salesRepId: addCommission && salesRepId ? salesRepId : undefined,
        commissionPercent: addCommission && salesRepId ? commissionPercent : undefined,
        rows: resolved,
      })
      return {
        orderId: res.data.data.orderId,
        imported: res.data.data.batchCount as number,
        skipped: rows.filter((r) => r.action === 'skip').length,
        failed,
      }
    },
    onSuccess: (r) => {
      setSummary({ imported: r.imported, skipped: r.skipped, failed: r.failed })
      toast.success(`Imported ${r.imported} item(s)`)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.message ?? 'Import failed'),
  })

  // ── Render ────────────────────────────────────────────────────────────────
  if (summary) {
    return (
      <div className="card p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 text-secondary-600 mx-auto" />
        <h3 className="font-semibold text-lg">Import complete</h3>
        <div className="flex items-center justify-center gap-6 text-sm">
          <div><p className="text-2xl font-bold text-secondary-600">{summary.imported}</p><p className="text-surface-500">Imported</p></div>
          <div><p className="text-2xl font-bold text-surface-500">{summary.skipped}</p><p className="text-surface-500">Skipped</p></div>
          <div><p className="text-2xl font-bold text-accent-600">{summary.failed}</p><p className="text-surface-500">Failed</p></div>
        </div>
        <div className="flex justify-center gap-2 pt-2">
          <button onClick={() => { setSummary(null); setRows([]); setFileName(null); setRawRows([]) }} className="btn-secondary">Import another</button>
          <button onClick={() => router.push('/dashboard/orders')} className="btn-primary">View orders</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Supplier + upload */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-surface-900">1. Supplier &amp; file</h3>
          {onUseGenericMapper && (
            <button onClick={onUseGenericMapper} className="text-xs text-brand-600 hover:underline">Use column-mapping importer instead →</button>
          )}
        </div>
        {supplier ? (
          <div className="flex items-center justify-between p-3 bg-brand-50 rounded-lg mb-3">
            <div><p className="font-medium">{supplier.name}</p><p className="text-xs text-surface-500">{supplier.companyName}</p></div>
            <button onClick={() => { setSupplier(null); setSupplierSearch('') }} className="text-xs text-surface-500 hover:text-red-600">Change</button>
          </div>
        ) : (
          <div className="mb-3">
            <input className="input" placeholder="Search supplier…" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
            {(supplierResults.data?.data?.length ?? 0) > 0 && (
              <ul className="mt-1 border border-surface-200 rounded-lg overflow-hidden">
                {supplierResults.data.data.map((s: Supplier) => (
                  <li key={s.id} onClick={() => setSupplier(s)} className="p-2.5 hover:bg-surface-50 cursor-pointer">
                    <p className="text-sm font-medium">{s.name}</p><p className="text-xs text-surface-500">{s.companyName}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <input ref={fileRef} type="file" accept=".csv,.CSV,.txt" onChange={handleFile} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!supplier}
          className={cn('w-full border-2 border-dashed border-surface-300 rounded-lg py-6 flex flex-col items-center gap-1.5 hover:border-brand-400 hover:bg-brand-50/40 transition-colors', !supplier && 'opacity-50 pointer-events-none')}
        >
          <Upload className="w-6 h-6 text-surface-400" />
          <span className="text-sm font-medium text-surface-700">{fileName ?? 'Upload distributor invoice CSV'}</span>
          <span className="text-2xs text-surface-400">Auto-detects MARG-style H/T/F formats from any supplier</span>
        </button>
      </div>

      {/* Format + preview */}
      {rows.length > 0 && (
        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-surface-900 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> 2. Review &amp; import</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" />
                {detectedId ? 'Detected:' : 'Format:'}
              </span>
              <select className="input w-64" value={parserId ?? ''} onChange={(e) => reparse(e.target.value)}>
                {PARSERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}{p.id === detectedId ? '  ✓ auto' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-surface-600">
            <span><strong className="text-surface-900">{totals.active}</strong> rows</span>
            <span><strong className={totals.errored ? 'text-accent-600' : 'text-secondary-600'}>{totals.errored}</strong> with issues</span>
            <span>Purchase value <strong className="text-surface-900">{formatCurrency(totals.value)}</strong></span>
            {matching && <span className="text-brand-600">Matching products…</span>}
          </div>

          <div className="overflow-x-auto border border-surface-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-surface-50 text-2xs uppercase text-surface-500">
                <tr>
                  <th className="text-left px-2 py-2">Product (CSV)</th>
                  <th className="text-left px-2 py-2 min-w-[180px]">Maps to</th>
                  <th className="text-left px-2 py-2">Batch</th>
                  <th className="text-left px-2 py-2">Expiry</th>
                  <th className="text-center px-2 py-2">Qty</th>
                  <th className="text-right px-2 py-2">Rate</th>
                  <th className="text-right px-2 py-2">MRP</th>
                  <th className="text-center px-2 py-2">GST</th>
                  <th className="text-left px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((r) => {
                  const errs = rowErrors(r)
                  const bad = r.action !== 'skip' && errs.length > 0
                  return (
                    <tr key={r._id} className={cn(r.action === 'skip' && 'opacity-40', bad && 'bg-accent-50/40')}>
                      <td className="px-2 py-1.5">
                        <p className="font-medium text-surface-800">{r.productName || <span className="text-accent-600">—</span>}</p>
                        <p className="text-2xs text-surface-400">{r.pack} · {r.manufacturer}</p>
                        {r.duplicate && <span className="badge-warning text-[9px]">duplicate</span>}
                        {bad && <p className="text-[10px] text-accent-600">{errs[0]}</p>}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.action === 'create' ? (
                          <span className="text-secondary-700 flex items-center gap-1"><Sparkles className="w-3 h-3" /> New product</span>
                        ) : (
                          <select
                            className="input !py-1 text-xs"
                            value={r.medicineId ?? ''}
                            onChange={(e) => update(r._id, { medicineId: e.target.value || null })}
                          >
                            <option value="">— pick —</option>
                            {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} {c.strength ?? ''} ({Math.round(c.score * 100)}%)</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-1.5"><input className="w-20 border border-surface-200 rounded px-1.5 py-1" value={r.batchNumber ?? ''} onChange={(e) => update(r._id, { batchNumber: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input type="date" className="w-32 border border-surface-200 rounded px-1.5 py-1" value={r.expiryDate ?? ''} onChange={(e) => update(r._id, { expiryDate: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-center"><input type="number" className="w-14 text-center border border-surface-200 rounded px-1.5 py-1" value={r.quantity} onChange={(e) => update(r._id, { quantity: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" className="w-20 text-right border border-surface-200 rounded px-1.5 py-1" value={r.purchaseRate ?? ''} onChange={(e) => update(r._id, { purchaseRate: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" className="w-20 text-right border border-surface-200 rounded px-1.5 py-1" value={r.mrp ?? ''} onChange={(e) => update(r._id, { mrp: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="px-2 py-1.5 text-center"><input type="number" step="0.5" className="w-12 text-center border border-surface-200 rounded px-1.5 py-1" value={r.gstRate ?? ''} onChange={(e) => update(r._id, { gstRate: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="px-2 py-1.5">
                        <select className="input !py-1 text-xs w-24" value={r.action} onChange={(e) => update(r._id, { action: e.target.value as PreviewRow['action'] })}>
                          <option value="map">Map</option>
                          <option value="create">Create</option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totals.errored > 0 && (
            <p className="text-xs text-accent-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {totals.errored} row(s) have issues — fix them or set to Skip. Only valid rows import.</p>
          )}

          {/* Optional salesman commission for this bill */}
          <div className="border border-surface-200 rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={addCommission} onChange={(e) => setAddCommission(e.target.checked)} />
              Add salesman&apos;s commission for this bill?
            </label>
            {addCommission && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="label">Salesman</label>
                  <select className="input" value={salesRepId} onChange={(e) => { setSalesRepId(e.target.value); const r = salesReps.find((s) => s.id === e.target.value); setCommissionPercent(r?.defaultCommissionPercent ?? 0) }}>
                    <option value="">— select —</option>
                    {salesReps.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.defaultCommissionPercent}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Commission %</label>
                  <input type="number" min="0" max="100" step="0.5" className="input" value={commissionPercent} onChange={(e) => setCommissionPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} disabled={!salesRepId} />
                  {salesRepId && <p className="help-text mt-1">≈ {formatCurrency(totals.value * commissionPercent / 100)} on this purchase</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => importMut.mutate()} disabled={importMut.isPending || totals.active === 0} className="btn-primary">
              <Save className="w-4 h-4" /> {importMut.isPending ? 'Importing…' : `Import ${rows.filter((r) => r.action !== 'skip' && rowErrors(r).length === 0).length} item(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
