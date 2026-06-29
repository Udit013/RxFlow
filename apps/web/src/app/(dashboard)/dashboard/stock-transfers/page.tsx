'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeftRight, Plus, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatDate, formatCurrency } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'badge-neutral',
  IN_TRANSIT: 'badge-info',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
}

export default function StockTransfersPage() {
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: () => api.get('/stock-transfers', { params: { limit: 50 } }).then((r) => r.data),
  })
  const transfers: any[] = data?.data ?? []

  const stores = authService.getStoredUser()?.stores ?? []
  const canTransfer = stores.length >= 2

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><ArrowLeftRight className="w-5 h-5" /> Stock Transfers</h1>
          <p className="text-sm text-slate-500">Move stock between your stores with a full audit trail</p>
        </div>
        <button
          onClick={() => canTransfer ? setShowNew(true) : toast.error('Need at least 2 stores to transfer')}
          className="btn-primary"
          disabled={!canTransfer}
          title={canTransfer ? '' : 'Add a second store from Settings first'}
        >
          <Plus className="w-4 h-4" /> New Transfer
        </button>
      </div>

      <details className="card p-4 group" open>
        <summary className="cursor-pointer font-medium text-surface-800 flex items-center gap-2 list-none">
          <ArrowLeftRight className="w-4 h-4 text-brand-600" />
          What is a Stock Transfer, and when do I use it?
          <span className="ml-auto text-xs text-surface-400 group-open:hidden">show</span>
          <span className="ml-auto text-xs text-surface-400 hidden group-open:inline">hide</span>
        </summary>
        <div className="mt-3 text-sm text-surface-600 space-y-3">
          <p><strong className="text-surface-800">What it is:</strong> moving existing stock from one of your stores/branches to another. It does not change your total stock — it just relocates it. Use it when you have multiple stores and one branch needs units that another branch has spare.</p>
          <div>
            <strong className="text-surface-800">When to use it</strong>
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              <li>A branch is low/out of a medicine that another branch has surplus of.</li>
              <li>Consolidating near-expiry stock to a high-traffic store to sell it faster.</li>
              <li>Rebalancing after a bulk purchase delivered to one location.</li>
            </ul>
            <p className="mt-1 text-2xs text-surface-500">Not for: receiving new stock from a supplier (use <Link href="/dashboard/purchases/new" className="text-brand-600 hover:underline">New Purchase</Link>) or writing off damaged stock (use Inventory → write-off).</p>
          </div>
          <div>
            <strong className="text-surface-800">Steps</strong>
            <ol className="list-decimal ml-5 mt-1 space-y-0.5">
              <li>Click <strong>New Transfer</strong>.</li>
              <li>Choose the <strong>source</strong> store (sending) and <strong>destination</strong> store (receiving).</li>
              <li>Add the medicines and quantities to move.</li>
              <li>Confirm — the transfer is logged with a full audit trail.</li>
            </ol>
          </div>
          <p><strong className="text-surface-800">How inventory updates:</strong> on confirmation the quantity is <strong>deducted</strong> from the source store and <strong>added</strong> to the destination store, batch-by-batch (expiry and batch numbers are preserved). Both stores' stock levels update immediately; your company-wide total is unchanged.</p>
        </div>
      </details>

      {!canTransfer && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-900">
          You currently have one store. Stock transfers require at least two stores. Add another store from{' '}
          <Link href="/dashboard/stores" className="underline">Stores</Link>.
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">From → To</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Lines</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Units</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : transfers.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No transfers yet
              </td></tr>
            ) : (
              transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{t.code}</td>
                  <td className="px-4 py-3 text-sm">
                    <strong>{t.fromStore?.name ?? '?'}</strong> → <strong>{t.toStore?.name ?? '?'}</strong>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-center">{t.lineCount}</td>
                  <td className="px-4 py-3 text-center">{t.totalUnits}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={STATUS_STYLES[t.status] ?? 'badge-neutral'}>{t.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/stock-transfers/${t.id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && canTransfer && (
        <NewTransferModal onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/dashboard/stock-transfers/${id}`)} />
      )}
    </div>
  )
}

interface TransferLine {
  medicineId: string
  medicineName: string
  strength: string
  fromBatchId?: string
  batchOptions: Array<{ id: string; batchNumber: string; expiryDate: string; quantity: number }>
  available: number
  quantity: number
}

function NewTransferModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const stores = authService.getStoredUser()?.stores ?? []
  const [fromStoreId, setFromStoreId] = useState(stores[0]?.id ?? '')
  const [toStoreId, setToStoreId] = useState(stores[1]?.id ?? '')
  const [notes, setNotes] = useState('')
  const [medQuery, setMedQuery] = useState('')
  const [lines, setLines] = useState<TransferLine[]>([])

  const { data: invData } = useQuery({
    queryKey: ['transfer-source-inventory', fromStoreId, medQuery],
    queryFn: () => api.get('/inventory', { params: { search: medQuery, limit: 8 } }).then((r) => r.data),
    enabled: !!fromStoreId && medQuery.length >= 2,
  })

  function addLine(item: any) {
    if (lines.some((l) => l.medicineId === item.medicineId)) {
      toast.error('Already in cart')
      return
    }
    setLines((prev) => [...prev, {
      medicineId: item.medicineId,
      medicineName: item.medicine.name,
      strength: item.medicine.strength,
      fromBatchId: item.batches[0]?.id,
      batchOptions: item.batches,
      available: item.availableQuantity,
      quantity: 1,
    }])
    setMedQuery('')
  }

  function updateLine(idx: number, patch: Partial<TransferLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const submit = useMutation({
    mutationFn: () => api.post('/stock-transfers', {
      fromStoreId, toStoreId, notes: notes || undefined,
      items: lines.map((l) => ({
        medicineId: l.medicineId,
        fromBatchId: l.fromBatchId,
        quantity: l.quantity,
      })),
    }),
    onSuccess: (res) => {
      toast.success(`Transfer ${res.data.data.code} completed`)
      onCreated(res.data.data.id)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const canSubmit = fromStoreId && toStoreId && fromStoreId !== toStoreId && lines.length > 0 && lines.every((l) => l.quantity > 0 && l.quantity <= l.available)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="font-semibold">New Stock Transfer</h2>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From store</label>
              <select className="input" value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">To store</label>
              <select className="input" value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
                {stores.filter((s) => s.id !== fromStoreId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Search & add items from source store</label>
            <div className="flex items-center gap-2 input">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                className="flex-1 outline-none text-sm"
                placeholder="Search medicine..."
                value={medQuery}
                onChange={(e) => setMedQuery(e.target.value)}
              />
            </div>
            {medQuery.length >= 2 && invData?.data?.length > 0 && (
              <ul className="border border-slate-200 rounded-lg mt-1 max-h-48 overflow-y-auto">
                {invData.data.map((item: any) => (
                  <li
                    key={item.id}
                    onClick={() => addLine(item)}
                    className={cn(
                      'p-2 hover:bg-brand-50 cursor-pointer flex items-center justify-between text-sm',
                      item.availableQuantity <= 0 && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div>
                      <p className="font-medium">{item.medicine.name}</p>
                      <p className="text-xs text-slate-500">{item.medicine.strength} · {item.availableQuantity} available</p>
                    </div>
                    <span className="text-xs text-slate-400">{formatCurrency(item.medicine.mrp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length > 0 && (
            <table className="w-full text-sm border rounded-lg">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Medicine</th>
                  <th className="text-left px-3 py-2">Batch</th>
                  <th className="text-center px-3 py-2">Qty</th>
                  <th className="text-center px-3 py-2">Available</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l, i) => (
                  <tr key={l.medicineId}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-xs">{l.medicineName}</p>
                      <p className="text-xs text-slate-500">{l.strength}</p>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="text-xs border border-slate-200 rounded px-2 py-1"
                        value={l.fromBatchId ?? ''}
                        onChange={(e) => updateLine(i, { fromBatchId: e.target.value || undefined })}
                      >
                        <option value="">Any</option>
                        {l.batchOptions.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batchNumber} ({b.quantity} units, exp {formatDate(b.expiryDate, 'MM/YY')})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min="1"
                        max={l.available}
                        className="w-16 text-center border border-slate-200 rounded px-2 py-1 text-sm"
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: Math.max(0, Math.min(l.available, parseInt(e.target.value) || 0)) })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600">{l.available}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason / reference" />
          </div>

          <div className="flex justify-between border-t pt-3">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending} className="btn-primary">
              {submit.isPending ? 'Transferring...' : `Transfer ${lines.length} item(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
