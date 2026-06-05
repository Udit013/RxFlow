'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Plus, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'badge-neutral',
  IN_PROGRESS: 'badge-info',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
}

export default function StockTakesPage() {
  const [showNew, setShowNew] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['stock-takes'],
    queryFn: () => api.get('/stock-takes', { params: { limit: 50 } }).then((r) => r.data),
  })

  const takes: any[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Stock Takes</h1>
          <p className="text-sm text-slate-500">Physical stock counts and inventory reconciliation</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Start New Count
        </button>
      </div>

      <div className="card p-4 bg-slate-50 border-dashed text-sm text-slate-600">
        <strong>How it works:</strong> Start a count → walk shelves and enter actual quantities per batch → submit.
        Variances (positive or negative) are applied to inventory in one transaction with a full audit trail.
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Started</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Lines</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Counted</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">+ / −</th>
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
            ) : takes.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No stock takes yet. Start one to begin counting.
                </td>
              </tr>
            ) : (
              takes.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/stock-takes/${t.id}`} className="font-medium text-brand-600 hover:underline font-mono text-xs">
                      {t.code}
                    </Link>
                    {t.notes && <p className="text-xs text-slate-500 mt-0.5">{t.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-center">{t.lineCount}</td>
                  <td className="px-4 py-3 text-center">
                    {t.countedCount}/{t.lineCount}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    {t.positiveVariance > 0 && <span className="text-green-600">+{t.positiveVariance}</span>}
                    {t.positiveVariance > 0 && t.negativeVariance > 0 && <span className="text-slate-300 mx-1">/</span>}
                    {t.negativeVariance > 0 && <span className="text-red-600">-{t.negativeVariance}</span>}
                    {t.positiveVariance === 0 && t.negativeVariance === 0 && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={STATUS_STYLES[t.status] ?? 'badge-neutral'}>{t.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/stock-takes/${t.id}`} className="text-xs text-brand-600 hover:underline">
                      {t.status === 'IN_PROGRESS' ? 'Continue →' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewStockTakeModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false)
            queryClient.invalidateQueries({ queryKey: ['stock-takes'] })
            window.location.href = `/dashboard/stock-takes/${id}`
          }}
        />
      )}
    </div>
  )
}

function NewStockTakeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [scope, setScope] = useState<'all' | 'lowStock' | 'expiringSoon'>('all')
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/stock-takes', { scope, notes: notes || undefined }),
    onSuccess: (res) => {
      toast.success(`Started count ${res.data.data.code} with ${res.data.data.lineCount} lines`)
      onCreated(res.data.data.id)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">New Stock Count</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Scope</label>
            <div className="space-y-2">
              {([
                ['all', 'Full inventory', 'Count every SKU and batch — best for month-end'],
                ['lowStock', 'Low stock only', 'Items at or below reorder level'],
                ['expiringSoon', 'Expiring within 90 days', 'Focused count of near-expiry batches'],
              ] as const).map(([value, label, hint]) => (
                <label key={value} className={cn(
                  'flex items-start gap-2 p-3 rounded-lg border cursor-pointer',
                  scope === value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
                )}>
                  <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mt-1" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-slate-500">{hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Q4 audit, post-restocking" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Counts will be applied to inventory when you submit. Make sure no sales/purchases happen during the count for accuracy.</span>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
              <CheckCircle2 className="w-4 h-4" /> {mutation.isPending ? 'Starting...' : 'Start Count'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
