'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui'

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

const orderColumns: DataTableColumn<Order>[] = [
  {
    key: 'orderNumber', header: 'Order #', pinned: true, accessor: (o) => o.orderNumber,
    render: (o) => (
      <Link href={`/dashboard/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-600 hover:underline">
        {o.orderNumber}
      </Link>
    ),
  },
  { key: 'type', header: 'Type', accessor: (o) => o.type, render: (o) => <span className={o.type === 'SALE' ? 'badge-info' : 'badge-neutral'}>{o.type}</span> },
  { key: 'party', header: 'Party', accessor: (o) => o.type === 'SALE' ? (o.customer?.name ?? 'Walk-in') : (o.supplier?.name ?? '—'), render: (o) => <span className="text-surface-700">{o.type === 'SALE' ? (o.customer?.name ?? 'Walk-in') : (o.supplier?.name ?? '—')}</span> },
  { key: 'items', header: 'Items', align: 'center', accessor: (o) => o.items?.length ?? 0 },
  { key: 'createdAt', header: 'Date', accessor: (o) => o.createdAt, render: (o) => <span className="text-surface-600">{formatDate(o.createdAt)}</span> },
  { key: 'total', header: 'Total', align: 'right', accessor: (o) => o.total, render: (o) => <span className="font-medium">{formatCurrency(o.total)}</span> },
  { key: 'status', header: 'Status', align: 'center', accessor: (o) => o.status, render: (o) => <span className={STATUS_STYLES[o.status] ?? 'badge-neutral'}>{o.status}</span> },
]

export default function OrdersPage() {
  const [type, setType] = useState<'ALL' | 'SALE' | 'PURCHASE'>('ALL')
  const [status, setStatus] = useState<string>('')
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['orders', type, status],
    queryFn: () =>
      api.get('/orders', {
        params: {
          type: type === 'ALL' ? undefined : type,
          status: status || undefined,
          limit: 500,
        },
      }).then((r) => r.data),
  })

  const orders: Order[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="text-sm text-surface-500">{data?.meta?.total ?? orders.length} orders</p>
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
              type === t ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'
            )}
          >
            {t === 'SALE' && <ArrowUpFromLine className="w-3.5 h-3.5" />}
            {t === 'PURCHASE' && <ArrowDownToLine className="w-3.5 h-3.5" />}
            {t === 'ALL' ? 'All Orders' : t === 'SALE' ? 'Sales' : 'Purchases'}
          </button>
        ))}
      </div>

      <DataTable<Order>
        data={orders}
        isLoading={isLoading}
        rowKey={(o) => o.id}
        columns={orderColumns}
        searchPlaceholder="Find by order #, customer, supplier…"
        exportFileName="rxflow-orders"
        emptyIcon={ShoppingCart}
        emptyTitle="No orders yet"
        emptyDescription="Sales and purchases will appear here as you create them."
        onRowClick={(o) => router.push(`/dashboard/orders/${o.id}`)}
        toolbar={
          <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        }
      />
    </div>
  )
}
