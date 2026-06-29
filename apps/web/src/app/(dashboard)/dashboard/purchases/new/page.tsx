'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Trash2, Search, PackagePlus, Save, Edit3, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatCurrency } from '@/lib/utils'
import { CsvImportFlow } from '@/components/purchases/csv-import-flow'
import { SmartCsvImport } from '@/components/purchases/smart-csv-import'

interface POLine {
  medicineId: string
  medicineName: string
  strength: string
  batchNumber: string
  expiryDate: string
  quantity: number
  purchasePrice: number
  mrp: number
  gstRate: number
  discountPercent: number
}

interface Supplier { id: string; name: string; companyName: string }
interface SalesRep { id: string; name: string; defaultCommissionPercent: number }
interface Medicine { id: string; name: string; strength: string; dosageForm: string; mrp: number; gstRate: number; manufacturerName: string }

export default function NewPurchasePage() {
  const router = useRouter()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [medQuery, setMedQuery] = useState('')
  const [lines, setLines] = useState<POLine[]>([])
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [csvMode, setCsvMode] = useState<'smart' | 'generic'>('smart')
  const [transportCharge, setTransportCharge] = useState<number>(0)
  const [salesman, setSalesman] = useState<SalesRep | null>(null)
  const [commissionPercent, setCommissionPercent] = useState<number>(0)

  const salesRepResults = useQuery({
    queryKey: ['po-salesreps'],
    queryFn: () => api.get('/sales-reps', { params: { active: 'true', limit: 50 } }).then((r) => r.data),
  })
  const salesReps: SalesRep[] = salesRepResults.data?.data ?? []

  useEffect(() => {
    const user = authService.getStoredUser()
    const primary = user?.stores?.find((s) => s.isPrimary) ?? user?.stores?.[0]
    if (primary) setStoreId(primary.id)
  }, [])

  const supplierResults = useQuery({
    queryKey: ['po-supplier-search', supplierSearch],
    queryFn: () => api.get('/suppliers', { params: { search: supplierSearch, limit: 5 } }).then((r) => r.data),
    enabled: supplierSearch.length >= 2 && !supplier,
  })

  const medicineResults = useQuery({
    queryKey: ['po-med-search', medQuery],
    queryFn: () => api.get('/medicines', { params: { search: medQuery, limit: 8 } }).then((r) => r.data),
    enabled: medQuery.length >= 2,
  })

  function addLine(m: Medicine) {
    setLines((prev) => [
      ...prev,
      {
        medicineId: m.id,
        medicineName: m.name,
        strength: m.strength,
        batchNumber: '',
        expiryDate: '',
        quantity: 1,
        purchasePrice: Number((m.mrp * 0.8).toFixed(2)),
        mrp: m.mrp,
        gstRate: m.gstRate ?? 12,
        discountPercent: 0,
      },
    ])
    setMedQuery('')
  }

  function updateLine(idx: number, patch: Partial<POLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const lineNet = (l: POLine) => l.quantity * l.purchasePrice * (1 - l.discountPercent / 100)
  const subtotal = lines.reduce((s, l) => s + lineNet(l), 0)
  const tax = lines.reduce((s, l) => s + (lineNet(l) * l.gstRate) / 100, 0)
  const commissionAmount = salesman ? subtotal * commissionPercent / 100 : 0
  const total = subtotal + tax + (transportCharge || 0)

  const submit = useMutation({
    mutationFn: async () => {
      if (!supplier) throw new Error('Pick a supplier')
      if (!storeId) throw new Error('No store assigned')
      if (lines.length === 0) throw new Error('Add at least one line')
      for (const l of lines) {
        if (!l.batchNumber || !l.expiryDate) throw new Error(`Batch number and expiry required for ${l.medicineName}`)
      }

      // 1. Create PURCHASE order
      const orderRes = await api.post('/orders', {
        type: 'PURCHASE',
        storeId,
        supplierId: supplier.id,
        paymentMethod: 'CREDIT',
        transportCharge: transportCharge || undefined,
        salesRepId: salesman?.id,
        commissionPercent: salesman ? commissionPercent : undefined,
        items: lines.map((l) => ({
          medicineId: l.medicineId,
          quantity: l.quantity,
          unitPrice: l.purchasePrice,
          discountPercent: l.discountPercent,
          taxRate: l.gstRate,
        })),
      })
      const orderId = orderRes.data.data.id

      // 2. Create batches for each line — adds to inventory
      let batchFailures = 0
      for (const l of lines) {
        try {
          await api.post('/inventory/batches', {
            medicineId: l.medicineId,
            batchNumber: l.batchNumber,
            expiryDate: new Date(l.expiryDate).toISOString(),
            quantity: l.quantity,
            purchasePrice: l.purchasePrice,
            discountPercent: l.discountPercent,
            mrp: l.mrp,
            sellingPrice: l.mrp,
            supplierId: supplier.id,
            purchaseOrderId: orderId,
          })
        } catch {
          batchFailures++
        }
      }

      return { orderId, batchFailures }
    },
    onSuccess: ({ orderId, batchFailures }) => {
      if (batchFailures > 0) {
        toast.warning(`PO created but ${batchFailures} batch(es) failed to add to inventory`)
      } else {
        toast.success('Purchase order created and stock added')
      }
      router.push(`/dashboard/orders/${orderId}`)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.message ?? 'Failed'),
  })

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><PackagePlus className="w-5 h-5" /> New Purchase</h1>
          <p className="text-sm text-slate-500">Add stock to inventory — manually, or by importing a supplier CSV</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        <button
          onClick={() => setMode('manual')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            mode === 'manual' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          )}
        >
          <Edit3 className="w-3.5 h-3.5" /> Manual entry
        </button>
        <button
          onClick={() => setMode('csv')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            mode === 'csv' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          )}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Import from CSV
        </button>
      </div>

      {mode === 'csv' ? (
        csvMode === 'smart'
          ? <SmartCsvImport onUseGenericMapper={() => setCsvMode('generic')} />
          : <CsvImportFlow />
      ) : (
        <ManualFlow {...{ supplier, setSupplier, supplierSearch, setSupplierSearch, medQuery, setMedQuery, lines, setLines, supplierResults, medicineResults, addLine, updateLine, removeLine, subtotal, tax, total, submit, router, transportCharge, setTransportCharge, salesman, setSalesman, commissionPercent, setCommissionPercent, commissionAmount, salesReps }} />
      )}
    </div>
  )
}

function ManualFlow(props: any) {
  const { supplier, setSupplier, supplierSearch, setSupplierSearch, medQuery, setMedQuery, lines, supplierResults, medicineResults, addLine, updateLine, removeLine, subtotal, tax, total, submit, router, transportCharge, setTransportCharge, salesman, setSalesman, commissionPercent, setCommissionPercent, commissionAmount, salesReps } = props
  return (
    <>
      {/* Supplier */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-3">1. Supplier</h3>
        {supplier ? (
          <div className="flex items-center justify-between p-3 bg-brand-50 rounded-lg">
            <div>
              <p className="font-medium">{supplier.name}</p>
              <p className="text-xs text-slate-500">{supplier.companyName}</p>
            </div>
            <button onClick={() => { setSupplier(null); setSupplierSearch('') }} className="text-xs text-slate-500 hover:text-red-600">Change</button>
          </div>
        ) : (
          <>
            <input className="input" placeholder="Search supplier by name..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
            {supplierResults.data?.data?.length > 0 && (
              <ul className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                {supplierResults.data.data.map((s: Supplier) => (
                  <li key={s.id} onClick={() => setSupplier(s)} className="p-3 hover:bg-slate-50 cursor-pointer">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.companyName}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Add Items */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-3">2. Add Items</h3>
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input className="flex-1 input" placeholder="Search medicine to add..." value={medQuery} onChange={(e) => setMedQuery(e.target.value)} />
        </div>
        {medQuery.length >= 2 && medicineResults.data?.data?.length > 0 && (
          <ul className="border border-slate-200 rounded-lg overflow-hidden mb-3 max-h-48 overflow-y-auto">
            {medicineResults.data.data.map((m: Medicine) => (
              <li key={m.id} onClick={() => addLine(m)} className="p-2 hover:bg-brand-50 cursor-pointer flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.strength} • {m.manufacturerName}</p>
                </div>
                <div className="text-xs text-slate-500">MRP {formatCurrency(m.mrp)}</div>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="text-left px-2 py-2">Medicine</th>
                <th className="text-left px-2 py-2">Batch *</th>
                <th className="text-left px-2 py-2">Expiry *</th>
                <th className="text-center px-2 py-2">Qty</th>
                <th className="text-right px-2 py-2">Buy ₹</th>
                <th className="text-center px-2 py-2">Disc %</th>
                <th className="text-right px-2 py-2">MRP</th>
                <th className="text-center px-2 py-2">GST</th>
                <th className="text-right px-2 py-2">Line</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l: POLine, i: number) => (
                <tr key={i}>
                  <td className="px-2 py-2">
                    <p className="font-medium text-xs">{l.medicineName}</p>
                    <p className="text-xs text-slate-500">{l.strength}</p>
                  </td>
                  <td className="px-2 py-2">
                    <input className="w-24 border border-slate-200 rounded px-2 py-1 text-xs" value={l.batchNumber} onChange={(e) => updateLine(i, { batchNumber: e.target.value })} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="date" className="w-32 border border-slate-200 rounded px-2 py-1 text-xs" value={l.expiryDate} onChange={(e) => updateLine(i, { expiryDate: e.target.value })} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="1" className="w-16 text-center border border-slate-200 rounded px-2 py-1 text-xs" value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" step="0.01" className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-xs" value={l.purchasePrice} onChange={(e) => updateLine(i, { purchasePrice: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="number" step="0.5" min="0" max="100" className="w-14 text-center border border-slate-200 rounded px-2 py-1 text-xs" value={l.discountPercent} onChange={(e) => updateLine(i, { discountPercent: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" step="0.01" className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-xs" value={l.mrp} onChange={(e) => updateLine(i, { mrp: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="number" step="0.5" className="w-14 text-center border border-slate-200 rounded px-2 py-1 text-xs" value={l.gstRate} onChange={(e) => updateLine(i, { gstRate: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-medium">
                    {formatCurrency(l.quantity * l.purchasePrice * (1 - l.discountPercent / 100) * (1 + l.gstRate / 100))}
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm">
              <tr><td colSpan={8} className="px-3 py-2 text-right text-slate-600">Subtotal (after discount)</td><td className="px-2 py-2 text-right">{formatCurrency(subtotal)}</td><td/></tr>
              <tr><td colSpan={8} className="px-3 py-2 text-right text-slate-600">GST</td><td className="px-2 py-2 text-right">{formatCurrency(tax)}</td><td/></tr>
              {transportCharge > 0 && <tr><td colSpan={8} className="px-3 py-2 text-right text-slate-600">Transport</td><td className="px-2 py-2 text-right">{formatCurrency(transportCharge)}</td><td/></tr>}
              <tr className="border-t"><td colSpan={8} className="px-3 py-2 text-right font-bold">Total</td><td className="px-2 py-2 text-right font-bold">{formatCurrency(total)}</td><td/></tr>
              {salesman && commissionAmount > 0 && <tr><td colSpan={8} className="px-3 py-1 text-right text-xs text-accent-700">Salesman commission ({commissionPercent}%)</td><td className="px-2 py-1 text-right text-xs text-accent-700">{formatCurrency(commissionAmount)}</td><td/></tr>}
            </tfoot>
          </table>
        )}

        {lines.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-6">Search and add medicines above</p>
        )}
      </div>

      {/* Costs & Commission */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-1">3. Costs &amp; Commission <span className="text-xs font-normal text-surface-400">(optional)</span></h3>
        <p className="text-xs text-surface-500 mb-3">Transport is added to the bill. Commission is only recorded if a salesman is selected.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Transportation / Delivery charge (₹)</label>
            <input type="number" min="0" step="1" className="input" value={transportCharge} onChange={(e) => setTransportCharge(parseFloat(e.target.value) || 0)} placeholder="0" />
          </div>
          <div>
            <label className="label">Purchase salesman</label>
            <select
              className="input"
              value={salesman?.id ?? ''}
              onChange={(e) => {
                const r = salesReps.find((s: SalesRep) => s.id === e.target.value) ?? null
                setSalesman(r)
                setCommissionPercent(r?.defaultCommissionPercent ?? 0)
              }}
            >
              <option value="">— None (direct, no commission) —</option>
              {salesReps.map((r: SalesRep) => <option key={r.id} value={r.id}>{r.name} ({r.defaultCommissionPercent}%)</option>)}
            </select>
          </div>
          <div>
            <label className="label">Commission %</label>
            <input type="number" min="0" max="100" step="0.5" disabled={!salesman} className="input disabled:bg-surface-50 disabled:text-surface-400" value={commissionPercent} onChange={(e) => setCommissionPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} />
            {salesman && <p className="help-text mt-1">≈ {formatCurrency(commissionAmount)} on this purchase</p>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/dashboard/orders')}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !supplier || lines.length === 0}
          className={cn('btn-primary', (!supplier || lines.length === 0) && 'opacity-50')}
        >
          <Save className="w-4 h-4" />
          {submit.isPending ? 'Saving...' : `Save Purchase (${formatCurrency(total)})`}
        </button>
      </div>
    </>
  )
}
