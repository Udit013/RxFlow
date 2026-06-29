'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Phone, Mail, MapPin, Check, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

function thisMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(period: string) {
  const [y, m] = period.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString()
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString()
  return { from, to }
}

export default function SalesRepDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(thisMonth())
  const [selected, setSelected] = useState<string[]>([])
  const [reportType, setReportType] = useState<'SALE' | 'PURCHASE' | 'all'>('SALE')

  const { from, to } = useMemo(() => monthRange(period), [period])

  const { data: repData } = useQuery({
    queryKey: ['sales-rep', id],
    queryFn: () => api.get(`/sales-reps/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['commission-report', id, period, reportType],
    queryFn: () => api.get(`/sales-reps/${id}/commission-report`, { params: { from, to, type: reportType } }).then((r) => r.data),
    enabled: !!id,
  })

  const settle = useMutation({
    mutationFn: () => api.post(`/sales-reps/${id}/settle`, { orderIds: selected }),
    onSuccess: (res) => {
      toast.success(`Settled ${res.data.data.settledCount} order(s)`)
      setSelected([])
      queryClient.invalidateQueries({ queryKey: ['commission-report', id] })
    },
    onError: () => toast.error('Failed to settle'),
  })

  if (!repData?.data) return <div className="p-8 text-slate-400">Loading...</div>

  const rep = repData.data
  const report = reportData?.data
  const orders = report?.orders ?? []
  const totals = report?.totals ?? { totalSales: 0, totalCommission: 0, paidCommission: 0, pendingCommission: 0, outstandingCommission: 0, orderCount: 0 }
  const isPurchase = reportType === 'PURCHASE'

  const pendingOrders = orders.filter((o: any) => o.commissionStatus !== 'PAID')
  const allPendingSelected = pendingOrders.length > 0 && pendingOrders.every((o: any) => selected.includes(o.id))

  const toggleAll = () => {
    if (allPendingSelected) setSelected([])
    else setSelected(pendingOrders.map((o: any) => o.id))
  }

  return (
    <div className="space-y-5">
      <Link href="/dashboard/sales-reps" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to sales reps
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{rep.name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-600">
              {rep.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {rep.phone}</span>}
              {rep.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {rep.email}</span>}
              {rep.territory && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {rep.territory}</span>}
              {rep.employeeCode && <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{rep.employeeCode}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Commission Rate</p>
            <p className="text-2xl font-bold text-slate-900">{rep.defaultCommissionPercent}%</p>
            {rep.flatBonusAmount > 0 && <p className="text-xs text-slate-500">+ {formatCurrency(rep.flatBonusAmount)} bonus/order</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Lifetime Orders</p>
          <p className="text-lg font-bold text-slate-900">{rep.stats?.totalOrders ?? 0}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Lifetime Sales</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(rep.stats?.totalSales ?? 0)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Lifetime Commission</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(rep.stats?.totalCommission ?? 0)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">This Period Pending</p>
          <p className="text-lg font-bold text-amber-600">{formatCurrency(totals.pendingCommission)}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Wallet className="w-4 h-4" /> Commission Report</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-surface-100 rounded-lg p-0.5">
              {(['SALE', 'PURCHASE', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setReportType(t); setSelected([]) }}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                    reportType === t ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-800'
                  )}
                >
                  {t === 'all' ? 'All' : t === 'SALE' ? 'Sales' : 'Purchases'}
                </button>
              ))}
            </div>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 pb-4 border-b">
          <div>
            <p className="text-xs text-slate-500">Orders</p>
            <p className="font-semibold">{totals.orderCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{isPurchase ? 'Purchase Value' : 'Sales Value'}</p>
            <p className="font-semibold">{formatCurrency(totals.totalSales)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Commission</p>
            <p className="font-semibold">{formatCurrency(totals.totalCommission)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Paid</p>
            <p className="font-semibold text-secondary-600">{formatCurrency(totals.paidCommission)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Outstanding</p>
            <p className="font-semibold text-accent-600">{formatCurrency(totals.outstandingCommission ?? totals.pendingCommission)}</p>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex items-center justify-between mb-3 p-3 bg-brand-50 rounded-lg">
            <p className="text-sm">{selected.length} order(s) selected</p>
            <button onClick={() => settle.mutate()} disabled={settle.isPending} className="btn-primary">
              <Check className="w-4 h-4" /> Mark as Paid
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="text-slate-400 text-sm py-6 text-center">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-slate-400 text-sm py-12 text-center">No commission-bearing orders in this period</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="px-2 py-2">
                  <input type="checkbox" checked={allPendingSelected} onChange={toggleAll} />
                </th>
                <th className="text-left px-2 py-2">Order #</th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-left px-2 py-2">{isPurchase ? 'Supplier' : 'Customer'}</th>
                <th className="text-right px-2 py-2">{isPurchase ? 'Purchase' : 'Sale'}</th>
                <th className="text-center px-2 py-2">Rate</th>
                <th className="text-right px-2 py-2">Commission</th>
                <th className="text-center px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o: any) => {
                const isPaid = o.commissionStatus === 'PAID'
                return (
                  <tr key={o.id}>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        disabled={isPaid}
                        checked={selected.includes(o.id)}
                        onChange={(e) => {
                          setSelected((p) => e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id))
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/dashboard/orders/${o.id}`} className="text-brand-600 hover:underline font-medium">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{formatDate(o.createdAt)}</td>
                    <td className="px-2 py-2">{isPurchase ? (o.supplier?.name ?? '—') : (o.customer?.name ?? 'Walk-in')}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(o.total)}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{o.commissionPercent ?? '—'}%</td>
                    <td className="px-2 py-2 text-right font-medium">{formatCurrency(o.commissionAmount ?? 0)}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={cn(isPaid ? 'badge-success' : 'badge-warning')}>{o.commissionStatus ?? 'PENDING'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
