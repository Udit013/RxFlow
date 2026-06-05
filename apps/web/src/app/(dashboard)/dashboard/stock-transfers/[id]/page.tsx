'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Store } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'badge-neutral',
  IN_TRANSIT: 'badge-info',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
}

export default function StockTransferDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const { data } = useQuery({
    queryKey: ['stock-transfer', id],
    queryFn: () => api.get(`/stock-transfers/${id}`).then((r) => r.data),
    enabled: !!id,
  })
  const t = data?.data

  if (!t) return <div className="p-8 text-slate-400">Loading...</div>

  return (
    <div className="space-y-5">
      <Link href="/dashboard/stock-transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to transfers
      </Link>

      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{t.code}</h1>
              <span className={STATUS_STYLES[t.status] ?? 'badge-neutral'}>{t.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Created {formatDate(t.createdAt)} {t.completedAt && `· Completed ${formatDate(t.completedAt)}`}
            </p>
            {t.notes && <p className="text-sm text-slate-600 mt-2">{t.notes}</p>}
          </div>
        </div>

        <div className="mt-5 pt-5 border-t flex items-center justify-center gap-6">
          <div className="text-center">
            <Store className="w-6 h-6 mx-auto text-slate-400 mb-1" />
            <p className="text-xs text-slate-500">From</p>
            <p className="font-semibold">{t.fromStore?.name}</p>
            <p className="text-[10px] font-mono text-slate-400">{t.fromStore?.code}</p>
          </div>
          <ArrowRight className="w-6 h-6 text-brand-500" />
          <div className="text-center">
            <Store className="w-6 h-6 mx-auto text-slate-400 mb-1" />
            <p className="text-xs text-slate-500">To</p>
            <p className="font-semibold">{t.toStore?.name}</p>
            <p className="text-[10px] font-mono text-slate-400">{t.toStore?.code}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h3 className="font-semibold">Items transferred</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">Medicine</th>
              <th className="text-left px-4 py-2">Batch</th>
              <th className="text-center px-4 py-2">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.items.map((it: any) => (
              <tr key={it.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{it.medicine?.name ?? '—'}</p>
                  <p className="text-xs text-slate-500">{it.medicine?.strength} · {it.medicine?.dosageForm}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  {it.batch ? (
                    <>
                      <p className="font-mono">{it.batch.batchNumber}</p>
                      <p className="text-slate-500">Exp {formatDate(it.batch.expiryDate, 'MM/YY')}</p>
                    </>
                  ) : <span className="text-slate-400">Any batch</span>}
                </td>
                <td className="px-4 py-3 text-center font-medium">{it.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
