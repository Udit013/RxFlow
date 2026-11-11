'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, PackageSearch, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
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
      <Link href={`/dashboard/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2">
        {o.orderNumber}
      </Link>
    ),
  },
  { key: 'type', header: 'Type', accessor: (o) => o.type, render: (o) => <span className="text-surface-600">{o.type === 'SALE' ? 'Sale' : o.type === 'PURCHASE' ? 'Purchase' : o.type}</span> },
  { key: 'party', header: 'Party', accessor: (o) => o.type === 'SALE' ? (o.customer?.name ?? 'Walk-in') : (o.supplier?.name ?? '—'), render: (o) => <span className="text-surface-700">{o.type === 'SALE' ? (o.customer?.name ?? 'Walk-in') : (o.supplier?.name ?? '—')}</span> },
  { key: 'items', header: 'Items', align: 'center', accessor: (o) => o.items?.length ?? 0 },
  { key: 'createdAt', header: 'Date', accessor: (o) => o.createdAt, render: (o) => <span className="text-surface-600">{formatDate(o.createdAt)}</span> },
  { key: 'total', header: 'Total', align: 'right', accessor: (o) => o.total, render: (o) => <span className="font-medium">{formatCurrency(o.total)}</span> },
  { key: 'status', header: 'Status', align: 'center', accessor: (o) => o.status, render: (o) => <span className={STATUS_STYLES[o.status] ?? 'badge-neutral'}>{o.status}</span> },
]

export default function OrdersPage() {
  const [view, setView] = useState<'orders' | 'reorder'>('orders')
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
          <h1 className="page-title">Orders &amp; Reorder</h1>
          <p className="text-[13px] leading-5 text-surface-500 mt-1">Track sales &amp; purchases, and plan what to restock</p>
        </div>
        <Link href="/dashboard/billing" className="btn-primary">
          <ShoppingCart className="w-4 h-4" />
          New Sale (POS)
        </Link>
      </div>

      {/* View toggle */}
      <div role="tablist" className="tab-list">
        <button role="tab" aria-selected={view === 'orders'} onClick={() => setView('orders')} className="tab">Order history</button>
        <button role="tab" aria-selected={view === 'reorder'} onClick={() => setView('reorder')} className="tab">Reorder suggestions</button>
      </div>

      {view === 'reorder' ? (
        <ReorderView />
      ) : (
        <>
          <div className="segmented">
            {(['ALL', 'SALE', 'PURCHASE'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className="segment">
                {t === 'ALL' ? 'All orders' : t === 'SALE' ? 'Sales' : 'Purchases'}
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
        </>
      )}
    </div>
  )
}

// ── Reorder suggestions ───────────────────────────────────────────────────────

interface ReorderItem {
  id: string
  availableQuantity: number
  reorderLevel: number
  reorderQuantity: number
  medicine: { id: string; name: string; strength: string; dosageForm: string; mrp: number }
  isLowStock: boolean
}

function ReorderView() {
  const router = useRouter()
  const { data, isLoading } = useQuery({
    queryKey: ['reorder-inventory'],
    queryFn: () => api.get('/inventory', { params: { limit: 1000 } }).then((r) => r.data),
  })
  const items: ReorderItem[] = (data?.data ?? []).filter((i: ReorderItem) => i.availableQuantity <= i.reorderLevel)
  const suggestQty = (i: ReorderItem) => Math.max(i.reorderQuantity || 0, i.reorderLevel * 2 - i.availableQuantity, 1)

  const columns: DataTableColumn<ReorderItem>[] = [
    {
      key: 'name', header: 'Medicine', pinned: true, accessor: (i) => i.medicine?.name ?? '',
      render: (i) => (
        <div>
          <p className="font-medium text-surface-900">{i.medicine?.name}</p>
          <p className="text-xs text-surface-500">{i.medicine?.strength} · {i.medicine?.dosageForm}</p>
        </div>
      ),
    },
    {
      key: 'availableQuantity', header: 'In Stock', align: 'center', accessor: (i) => i.availableQuantity,
      render: (i) => <span className={i.availableQuantity <= 0 ? 'text-accent-600 font-semibold' : 'text-surface-700'}>{i.availableQuantity}</span>,
    },
    { key: 'reorderLevel', header: 'Reorder At', align: 'center', accessor: (i) => i.reorderLevel },
    {
      key: 'suggest', header: 'Suggested Order', align: 'center', accessor: (i) => suggestQty(i),
      render: (i) => <span className="font-semibold text-brand-700">{suggestQty(i)}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sortable: false,
      render: (i) => i.availableQuantity <= 0
        ? <span className="badge-danger">Out of stock</span>
        : <span className="badge-warning">Low</span>,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="card p-4 bg-brand-50/50 border-brand-200 flex items-center justify-between gap-3">
        <p className="text-sm text-surface-700">
          <strong className="text-surface-900">{items.length}</strong> item(s) at or below their reorder level.
          The <strong>Suggested Order</strong> tops each back up to a healthy level. Export the list or start a purchase.
        </p>
        <button onClick={() => router.push('/dashboard/purchases/new')} className="btn-primary shrink-0">
          <Plus className="w-4 h-4" /> New Purchase
        </button>
      </div>
      <DataTable<ReorderItem>
        data={items}
        isLoading={isLoading}
        rowKey={(i) => i.id}
        columns={columns}
        searchPlaceholder="Search medicines to reorder…"
        exportFileName="rxflow-reorder-list"
        emptyIcon={PackageSearch}
        emptyTitle="Everything is well stocked"
        emptyDescription="No medicines are below their reorder level right now."
        onRowClick={(i) => router.push(`/dashboard/medicines/${i.medicine?.id}`)}
      />
    </div>
  )
}
