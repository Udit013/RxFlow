'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, XCircle, Search, TrendingUp, TrendingDown, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn, debounce, formatDate } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'badge-neutral',
  IN_PROGRESS: 'badge-info',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
}

export default function StockTakeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'counted' | 'uncounted' | 'variance'>('all')

  useEffect(() => {
    const fn = debounce((v: string) => setDebouncedSearch(v.toLowerCase()), 200)
    fn(search)
  }, [search])

  const { data } = useQuery({
    queryKey: ['stock-take', id],
    queryFn: () => api.get(`/stock-takes/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const take = data?.data
  const lines: any[] = take?.lines ?? []
  const isEditable = take?.status === 'IN_PROGRESS' || take?.status === 'DRAFT'

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (filter === 'counted' && l.actualQty == null) return false
      if (filter === 'uncounted' && l.actualQty != null) return false
      if (filter === 'variance' && (!l.variance || l.variance === 0)) return false
      if (debouncedSearch) {
        const hay = `${l.medicine?.name ?? ''} ${l.medicine?.strength ?? ''} ${l.batch?.batchNumber ?? ''}`.toLowerCase()
        if (!hay.includes(debouncedSearch)) return false
      }
      return true
    })
  }, [lines, filter, debouncedSearch])

  const stats = useMemo(() => {
    let counted = 0, positive = 0, negative = 0, lossValue = 0, gainValue = 0
    for (const l of lines) {
      if (l.actualQty != null) counted++
      const v = l.variance ?? 0
      if (v > 0) {
        positive++
        gainValue += v * (l.batch?.purchasePrice ?? 0)
      } else if (v < 0) {
        negative++
        lossValue += Math.abs(v) * (l.batch?.purchasePrice ?? 0)
      }
    }
    return { counted, positive, negative, lossValue, gainValue, total: lines.length }
  }, [lines])

  const completeMut = useMutation({
    mutationFn: () => api.post(`/stock-takes/${id}/complete`, {}),
    onSuccess: (res) => {
      const d = res.data.data
      toast.success(`Applied ${d.applied} lines: +${d.positiveAdjustments} / -${d.negativeAdjustments}`)
      queryClient.invalidateQueries({ queryKey: ['stock-take', id] })
      queryClient.invalidateQueries({ queryKey: ['stock-takes'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/stock-takes/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Stock take cancelled')
      router.push('/dashboard/stock-takes')
    },
  })

  if (!take) return <div className="p-8 text-slate-400">Loading...</div>

  return (
    <div className="space-y-5">
      <Link href="/dashboard/stock-takes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to stock takes
      </Link>

      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 font-mono">{take.code}</h1>
              <span className={STATUS_STYLES[take.status] ?? 'badge-neutral'}>{take.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">Started {formatDate(take.createdAt)}</p>
            {take.notes && <p className="text-sm text-slate-600 mt-2">{take.notes}</p>}
          </div>
          {isEditable && (
            <div className="flex items-center gap-2">
              <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className="btn-secondary">
                <XCircle className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending || stats.counted === 0}
                className="btn-primary"
                title={stats.counted === 0 ? 'Count at least one line first' : 'Apply variances to inventory'}
              >
                <Save className="w-4 h-4" /> {completeMut.isPending ? 'Applying...' : `Submit (${stats.counted} counted)`}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Total Lines</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Counted</p>
          <p className="text-lg font-bold text-blue-700">{stats.counted}</p>
          <p className="text-xs text-slate-500">{stats.total > 0 ? Math.round((stats.counted / stats.total) * 100) : 0}%</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-600" /> Overage</p>
          <p className="text-lg font-bold text-green-700">+{stats.positive}</p>
          <p className="text-xs text-green-600">₹{stats.gainValue.toFixed(0)} value</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-600" /> Shortage</p>
          <p className="text-lg font-bold text-red-700">-{stats.negative}</p>
          <p className="text-xs text-red-600">₹{stats.lossValue.toFixed(0)} loss</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Net Impact</p>
          <p className={cn('text-lg font-bold', stats.gainValue - stats.lossValue >= 0 ? 'text-green-700' : 'text-red-700')}>
            ₹{(stats.gainValue - stats.lossValue).toFixed(0)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="card p-2 flex-1 max-w-md">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 ml-1" />
            <input
              className="flex-1 text-sm outline-none"
              placeholder="Search medicine / batch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {(['all', 'uncounted', 'counted', 'variance'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium',
                filter === f ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              {f === 'all' ? 'All' : f === 'uncounted' ? 'Not yet counted' : f === 'counted' ? 'Counted' : 'With variance'}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">Medicine</th>
                <th className="text-left px-3 py-2">Batch</th>
                <th className="text-center px-3 py-2">System Qty</th>
                <th className="text-center px-3 py-2">Actual Qty</th>
                <th className="text-center px-3 py-2">Variance</th>
                <th className="text-left px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm">No lines match</td></tr>
              ) : (
                filtered.map((l) => (
                  <LineRow key={l.id} line={l} takeId={id} editable={isEditable} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LineRow({ line, takeId, editable }: { line: any; takeId: string; editable: boolean }) {
  const queryClient = useQueryClient()
  const [actual, setActual] = useState<string>(line.actualQty != null ? String(line.actualQty) : '')
  const [notes, setNotes] = useState<string>(line.notes ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  const mutation = useMutation({
    mutationFn: (data: { actualQty: number; notes?: string }) =>
      api.patch(`/stock-takes/${takeId}/lines/${line.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-take', takeId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Save failed'),
  })

  function scheduleSave(val: string, noteVal: string) {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      mutation.mutate({ actualQty: n, notes: noteVal || undefined })
    }, 600)
  }

  const variance = actual !== '' ? parseInt(actual, 10) - line.systemQty : null

  return (
    <tr className={cn(
      line.actualQty != null ? 'bg-blue-50/30' : '',
      variance && variance > 0 ? '!bg-green-50' : '',
      variance && variance < 0 ? '!bg-red-50' : '',
    )}>
      <td className="px-3 py-2">
        <p className="font-medium text-slate-900">{line.medicine?.name ?? '—'}</p>
        <p className="text-xs text-slate-500">
          {line.medicine?.strength} · {line.medicine?.manufacturerName}
        </p>
      </td>
      <td className="px-3 py-2">
        {line.batch ? (
          <>
            <p className="text-xs font-mono">{line.batch.batchNumber}</p>
            <p className="text-[10px] text-slate-500">Exp {formatDate(line.batch.expiryDate, 'MM/YY')}</p>
          </>
        ) : <span className="text-slate-400 text-xs">No batch</span>}
      </td>
      <td className="px-3 py-2 text-center font-mono">{line.systemQty}</td>
      <td className="px-3 py-2 text-center">
        {editable ? (
          <input
            ref={inputRef}
            type="number"
            min="0"
            className="w-20 text-center border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={actual}
            onChange={(e) => {
              setActual(e.target.value)
              scheduleSave(e.target.value, notes)
            }}
            placeholder="—"
          />
        ) : (
          <span className="font-mono">{line.actualQty ?? '—'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center font-mono">
        {variance == null ? <span className="text-slate-300">—</span> :
         variance > 0 ? <span className="text-green-700 font-semibold">+{variance}</span> :
         variance < 0 ? <span className="text-red-700 font-semibold">{variance}</span> :
         <span className="text-slate-500">0</span>}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            value={notes}
            placeholder="Optional"
            onChange={(e) => {
              setNotes(e.target.value)
              if (actual !== '') scheduleSave(actual, e.target.value)
            }}
          />
        ) : <span className="text-xs text-slate-500">{line.notes ?? '—'}</span>}
      </td>
    </tr>
  )
}
