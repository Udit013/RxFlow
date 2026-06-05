'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp, TrendingDown, Package, Pill, Award } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

export default function MedicineDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const { data, isLoading } = useQuery({
    queryKey: ['medicine', id],
    queryFn: () => api.get(`/medicines/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: historyData } = useQuery({
    queryKey: ['medicine-purchase-history', id],
    queryFn: () => api.get(`/medicines/${id}/purchase-history`).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>
  if (!data?.data) return <div className="p-8 text-slate-400">Medicine not found</div>

  const m = data.data
  const history = historyData?.data
  const stats = history?.stats
  const suppliers = history?.suppliers ?? []
  const batches = history?.batches ?? []

  return (
    <div className="space-y-5">
      <Link href="/dashboard/medicines" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to medicines
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
                <Pill className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{m.name}</h1>
                <p className="text-sm text-slate-500">{m.genericName} • {m.strength} • {m.dosageForm}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
              <span className="text-slate-600">By <strong>{m.manufacturerName}</strong></span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">HSN <span className="font-mono">{m.hsn}</span></span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">GST {m.gstRate}%</span>
              {m.schedule === 'OTC' ? <span className="badge-success">OTC</span> : <span className="badge-warning">{m.schedule.replace('SCHEDULE_', 'Sch ')}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">MRP</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(m.mrp)}</p>
            <p className="text-xs text-slate-500 mt-1">{m.packSize}</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="metric-card">
            <p className="text-xs text-slate-500 uppercase">Last Buy Price</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(stats.lastPurchasePrice)}</p>
            <p className="text-xs text-slate-500 mt-1">from {stats.lastSupplierName ?? '—'}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-slate-500 uppercase">Avg Buy Price</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(stats.avgPurchasePrice)}</p>
            <p className="text-xs text-slate-500 mt-1">over {stats.totalBatches} batches</p>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase">Min</p>
              <TrendingDown className="w-3.5 h-3.5 text-green-500" />
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(stats.minPurchasePrice)}</p>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase">Max</p>
              <TrendingUp className="w-3.5 h-3.5 text-red-500" />
            </div>
            <p className="text-lg font-bold text-red-600">{formatCurrency(stats.maxPurchasePrice)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-brand-600" /> Supplier Comparison
            </h3>
            <span className="text-xs text-slate-500">{suppliers.length} suppliers</span>
          </div>
          {suppliers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No purchase history yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Supplier</th>
                  <th className="text-right px-3 py-2">Last</th>
                  <th className="text-right px-3 py-2">Avg</th>
                  <th className="text-center px-3 py-2">Batches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s: any, i: number) => (
                  <tr key={s.supplierId} className={cn(i === 0 && 'bg-green-50')}>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/suppliers/${s.supplierId}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {s.supplierName}
                      </Link>
                      {i === 0 && <span className="ml-2 badge-success text-[10px]">Best avg</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(s.lastPurchasePrice)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(s.avgPurchasePrice)}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{s.batchCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-slate-900">Recent Batches</h3>
          </div>
          {batches.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No batches recorded</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {batches.slice(0, 15).map((b: any) => (
                <div key={b.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Batch {b.batchNumber}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(b.createdAt)} • {b.quantity} units • {b.supplier?.name ?? 'no supplier'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 text-sm">{formatCurrency(b.purchasePrice)}</p>
                    <p className="text-xs text-slate-500">Exp {formatDate(b.expiryDate, 'MM/YY')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
