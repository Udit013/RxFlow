'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, debounce, formatCurrency, formatDate } from '@/lib/utils'

interface Order {
  id: string
  orderNumber: string
  type: 'SALE' | 'PURCHASE'
  status: string
  total: number
  createdAt: string
  customer?: { id: string; name: string } | null
  supplier?: { id: string; name: string; companyName: string } | null
  items: any[]
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'badge-neutral',
  PENDING: 'badge-warning',
  CONFIRMED: 'badge-info',
  PROCESSING: 'badge-info',
  PARTIALLY_SHIPPED: 'badge-warning',
  SHIPPED: 'badge-info',
  DELIVERED: 'badge-success',
  CANCELLED: 'badge-danger',
  RETURNED: 'badge-danger',
}

export default function OrdersPage() {
  const [type, setType] = useState<'ALL' | 'SALE' | 'PURCHASE'>('ALL')
  const [status, setStatus] = useState<string>('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const fn = debounce((v: string) => setDebouncedSearch(v), 250)
    fn(search)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['orders', type, status, debouncedSearch],
    queryFn: () =>
      api.get('/orders', {
        params: {
          type: type === 'ALL' ? undefined : type,
          status: status || undefined,
          search: debouncedSearch || undefined,
          limit: 50,
        },
      }).then((r) => r.data),
  })

  const orders: Order[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="text-sm text-slate-500">{data?.meta?.total ?? 0} orders</p>
        </div>
        <Link href="/dashboard/billing" className="btn-primary">
          <ShoppingCart className="w-4 h-4" />
          New Sale (POS)
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {(['ALL', 'SALE', 'PURCHASE'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              type === t ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {t === 'SALE' && <ArrowUpFromLine className="w-3.5 h-3.5" />}
            {t === 'PURCHASE' && <ArrowDownToLine className="w-3.5 h-3.5" />}
            {t === 'ALL' ? 'All Orders' : t === 'SALE' ? 'Sales' : 'Purchases'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="card !p-2 flex items-center gap-2 min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              className="flex-1 text-sm outline-none"
              placeholder="Find by invoice #, customer, supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>}
          </div>
          <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Order #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Party</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Items</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No orders yet
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-brand-600 hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={o.type === 'SALE' ? 'badge-info' : 'badge-neutral'}>{o.type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {o.type === 'SALE' ? (o.customer?.name ?? 'Walk-in') : (o.supplier?.name ?? '—')}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{o.items?.length ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(o.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={STATUS_STYLES[o.status] ?? 'badge-neutral'}>{o.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
