'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Plus, X, Search, ArrowLeft, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AnimatedSection, PageHeader, SectionCard, EmptyState, SkeletonRow } from '@/components/ui'

export default function PurchaseReturnsPage() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-returns'],
    queryFn: () => api.get('/invoices', { params: { type: 'DEBIT_NOTE', limit: 100 } }).then((r) => r.data),
  })
  const returns: any[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <AnimatedSection immediate>
        <PageHeader
          icon={RotateCcw}
          eyebrow="Purchases"
          title="Purchase Returns"
          description="Return goods to suppliers — adjusts stock, supplier payable, and issues a debit note"
          actions={<button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Return</button>}
        />
      </AnimatedSection>

      <AnimatedSection>
        <SectionCard flush>
          <table className="data-table">
            <thead>
              <tr>
                <th>Debit Note</th>
                <th>Against</th>
                <th>Supplier</th>
                <th>Date</th>
                <th className="text-center">Items</th>
                <th className="text-right">Return Value</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRow columns={6} rows={5} />
              ) : returns.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={RotateCcw}
                    title="No purchase returns yet"
                    description="Return damaged, expired, or excess stock to a supplier."
                    action={<button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Return</button>}
                  />
                </td></tr>
              ) : returns.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/dashboard/invoices/${r.id}`} className="font-mono text-brand-600 hover:underline">{r.invoiceNumber}</Link></td>
                  <td className="font-mono text-2xs text-surface-500">{r.originalInvoice?.invoiceNumber ?? '—'}</td>
                  <td>{r.supplier?.name ?? r.supplier?.companyName ?? '—'}</td>
                  <td className="text-surface-600">{formatDate(r.createdAt)}</td>
                  <td className="text-center">{r.items?.length ?? r._count?.items ?? '—'}</td>
                  <td className="text-right font-semibold text-amber-700">-{formatCurrency(r.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </AnimatedSection>

      {showNew && (
        <NewReturnFlow
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            queryClient.invalidateQueries({ queryKey: ['purchase-returns'] })
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
          }}
        />
      )}
    </div>
  )
}

function NewReturnFlow({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [supplier, setSupplier] = useState<any | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [invoice, setInvoice] = useState<any | null>(null)
  const [reason, setReason] = useState('Return to supplier')
  const [lines, setLines] = useState<{ invoiceItemId: string; quantity: number }[]>([])

  // Step 1: suppliers
  const supRes = useQuery({
    queryKey: ['ret-sup', supplierSearch],
    queryFn: () => api.get('/suppliers', { params: { search: supplierSearch, limit: 6 } }).then((r) => r.data),
    enabled: step === 1 && supplierSearch.length >= 2,
  })

  // Step 2: that supplier's purchase invoices
  const invRes = useQuery({
    queryKey: ['ret-inv', supplier?.id],
    queryFn: () => api.get('/invoices', { params: { type: 'PURCHASE', supplierId: supplier.id, limit: 30 } }).then((r) => r.data),
    enabled: step === 2 && !!supplier,
  })

  // Step 3: full invoice detail (items)
  const detailRes = useQuery({
    queryKey: ['ret-inv-detail', invoice?.id],
    queryFn: () => api.get(`/invoices/${invoice.id}`).then((r) => r.data),
    enabled: step === 3 && !!invoice,
  })
  const fullInvoice = detailRes.data?.data

  const submit = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/purchase-return`, {
      reason,
      items: lines.filter((l) => l.quantity > 0),
    }),
    onSuccess: () => { toast.success('Returned to supplier · stock & payable updated'); onCreated() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const items = fullInvoice?.items ?? []
  const totalReturn = lines.reduce((sum, l, i) => {
    const it = items[i]
    if (!it || l.quantity <= 0) return sum
    return sum + (it.total * (l.quantity / it.quantity))
  }, 0)
  const anyLines = lines.some((l) => l.quantity > 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-surface-900">New Purchase Return</h2>
            <p className="text-2xs text-surface-500">
              {step === 1 ? 'Step 1 · Choose supplier' : step === 2 ? `Step 2 · Choose invoice — ${supplier?.name}` : `Step 3 · Select items — ${invoice?.invoiceNumber}`}
            </p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="space-y-3">
              <div className="card !p-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-surface-400 ml-1" />
                <input className="flex-1 text-sm bg-transparent outline-none" placeholder="Search supplier…" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} autoFocus />
              </div>
              <ul className="divide-y divide-surface-100 border border-surface-200 rounded-lg overflow-hidden">
                {(supRes.data?.data ?? []).map((s: any) => (
                  <li key={s.id}>
                    <button onClick={() => { setSupplier(s); setStep(2) }} className="w-full text-left px-3 py-2.5 hover:bg-surface-50 flex items-center justify-between">
                      <div><p className="text-[13px] font-medium">{s.name}</p><p className="text-2xs text-surface-500">{s.companyName}</p></div>
                      <ArrowRight className="w-4 h-4 text-surface-300" />
                    </button>
                  </li>
                ))}
                {supplierSearch.length >= 2 && (supRes.data?.data?.length ?? 0) === 0 && !supRes.isFetching && (
                  <li className="px-3 py-4 text-center text-xs text-surface-400">No suppliers found</li>
                )}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <button onClick={() => setStep(1)} className="text-xs text-surface-500 hover:text-surface-900 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Change supplier</button>
              {invRes.isLoading ? <p className="text-sm text-surface-400 py-6 text-center">Loading invoices…</p> : (invRes.data?.data?.length ?? 0) === 0 ? (
                <EmptyState icon={RotateCcw} title="No purchase invoices" description="This supplier has no purchase invoices to return against." size="compact" />
              ) : (
                <ul className="divide-y divide-surface-100 border border-surface-200 rounded-lg overflow-hidden">
                  {(invRes.data?.data ?? []).map((inv: any) => (
                    <li key={inv.id}>
                      <button onClick={() => { setInvoice(inv); setStep(3); setLines([]) }} className="w-full text-left px-3 py-2.5 hover:bg-surface-50 flex items-center justify-between">
                        <div><p className="text-[13px] font-mono font-medium">{inv.invoiceNumber}</p><p className="text-2xs text-surface-500">{formatDate(inv.createdAt)}</p></div>
                        <span className="text-[13px] font-semibold">{formatCurrency(inv.grandTotal)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <button onClick={() => setStep(2)} className="text-xs text-surface-500 hover:text-surface-900 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Change invoice</button>
              <div>
                <label className="label">Reason</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, near expiry, wrong item, excess…" />
              </div>
              {detailRes.isLoading ? <p className="text-sm text-surface-400 py-6 text-center">Loading items…</p> : (
                <table className="w-full text-sm border border-surface-200 rounded-lg overflow-hidden">
                  <thead className="bg-surface-50 text-2xs uppercase text-surface-500">
                    <tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Bought</th><th className="text-center px-3 py-2">Return</th><th className="text-right px-3 py-2">Value</th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {items.map((it: any, idx: number) => {
                      if (!lines[idx]) { /* lazily init lines */ }
                      const line = lines[idx] ?? { invoiceItemId: it.id, quantity: 0 }
                      const value = line.quantity > 0 ? it.total * (line.quantity / it.quantity) : 0
                      return (
                        <tr key={it.id}>
                          <td className="px-3 py-2"><p className="font-medium text-[13px]">{it.medicineName}</p><p className="text-2xs text-surface-500">Batch {it.batchNumber} · @{formatCurrency(it.unitPrice)}</p></td>
                          <td className="px-3 py-2 text-right">{it.quantity}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="number" min="0" max={it.quantity} className="w-16 text-center border border-surface-300 rounded px-2 py-1 text-sm"
                              value={line.quantity}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(it.quantity, parseInt(e.target.value) || 0))
                                setLines((p) => {
                                  const next = [...p]
                                  for (let j = 0; j < items.length; j++) if (!next[j]) next[j] = { invoiceItemId: items[j].id, quantity: 0 }
                                  next[idx] = { invoiceItemId: it.id, quantity: v }
                                  return next
                                })
                              }} />
                          </td>
                          <td className="px-3 py-2 text-right text-surface-700">{formatCurrency(value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-surface-50">
                    <tr><td colSpan={3} className="px-3 py-2 text-right font-semibold">Total return</td><td className="px-3 py-2 text-right font-bold text-amber-700">{formatCurrency(totalReturn)}</td></tr>
                  </tfoot>
                </table>
              )}
              <p className="text-2xs text-surface-500">Returned units leave your stock (must be physically present). Supplier payable + total purchases reduce by the return value.</p>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-200">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                <button onClick={() => submit.mutate()} disabled={!anyLines || submit.isPending} className="btn-primary">
                  {submit.isPending ? 'Processing…' : `Return to Supplier (${formatCurrency(totalReturn)})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
