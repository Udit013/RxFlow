'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  TrendingUp, Package, AlertTriangle, Clock, ShoppingCart, ShoppingBag,
  Wallet, FileSpreadsheet, RotateCcw, Search, PackagePlus, Pill, Receipt, ArrowRight,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { MetricCard, SectionCard, EmptyState } from '@/components/ui'

interface DashboardData {
  today: { sales: number; purchases: number; revenue: number; orders: number; newCustomers: number }
  inventory: { totalSkus: number; lowStockItems: number; expiringItems: number; expiredItems: number; expiry30: number; expiry60: number; expiry90: number }
  operations: { pendingPurchaseOrders: number; recentMedicines: Array<{ id: string; name: string; strength: string; dosageForm: string; stock: number; addedAt: string }> }
  finance: {
    outstanding: number; pendingInvoices: number
    monthlyGst: { outputTax: number; inputCredit: number; netPayable: number }
    returnRate: { percent: number; creditNoteCount: number; creditNoteValue: number }
  }
  recentOrders: Array<{ id: string; orderNumber: string; type: string; total: number; status: string; customer?: { name: string }; supplier?: { name: string }; createdAt: string }>
  topMedicines: Array<{ medicineId: string; medicineName: string; totalQuantity: number; totalRevenue: number }>
  revenueChart: Array<{ date: string; revenue: number; orders: number }>
  alerts: Array<{ id: string; type: string; title: string; message: string }>
}

const STATUS_BADGES: Record<string, string> = {
  CONFIRMED: 'badge-info', DELIVERED: 'badge-success', CANCELLED: 'badge-danger',
  PENDING: 'badge-warning', PROCESSING: 'badge-info', DRAFT: 'badge-neutral',
}

function openSearch() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<{ data: DashboardData }>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then((r) => r.data),
    refetchInterval: 30_000,
  })
  const d = data?.data
  const returnRate = d?.finance.returnRate.percent ?? 0
  const returnTone = returnRate > 10 ? 'danger' : returnRate > 5 ? 'warning' : 'success'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header + prominent search */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <p className="page-eyebrow">{formatDate(new Date(), 'dddd, DD MMM YYYY')}</p>
          <h1 className="page-title">Today&apos;s Operations</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/billing" className="btn-primary"><ShoppingBag className="w-4 h-4" /> New Sale</Link>
          <Link href="/dashboard/purchases/new" className="btn-secondary"><PackagePlus className="w-4 h-4" /> New Purchase</Link>
        </div>
      </div>

      <button
        onClick={openSearch}
        className="w-full flex items-center gap-3 bg-white border border-surface-300 rounded-lg px-4 py-3 text-left hover:border-brand-400 transition-colors group"
      >
        <Search className="w-5 h-5 text-surface-400 group-hover:text-brand-600" />
        <span className="text-sm text-surface-400 flex-1">Search medicines, customers, invoices, orders…</span>
        <kbd className="text-2xs text-surface-500 bg-surface-100 border border-surface-200 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      {/* Today's operations metric strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={TrendingUp} tone="brand" label="Today's Sales" value={formatCurrency(d?.today.sales ?? 0)} sub={`${formatNumber(d?.today.orders ?? 0)} orders today`} loading={isLoading} />
        <MetricCard icon={ShoppingCart} tone="warning" label="Pending Purchase Orders" value={String(d?.operations.pendingPurchaseOrders ?? 0)} sub="Not yet received" href="/dashboard/orders?type=PURCHASE" loading={isLoading} />
        <MetricCard icon={Wallet} tone="danger" label="Outstanding Payments" value={formatCurrency(d?.finance.outstanding ?? 0)} sub={`${d?.finance.pendingInvoices ?? 0} unpaid invoices`} href="/dashboard/invoices" loading={isLoading} />
        <MetricCard icon={FileSpreadsheet} tone="neutral" label="GST Payable (mo)" value={formatCurrency(d?.finance.monthlyGst.netPayable ?? 0)} sub="Output − ITC" href="/dashboard/reports" loading={isLoading} />
      </div>

      {/* Inventory health */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-heading">Inventory Health</h2>
          <Link href="/dashboard/inventory" className="text-xs text-brand-600 hover:underline flex items-center gap-0.5">View inventory <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard icon={Package} tone="brand" label="Total SKUs" value={formatNumber(d?.inventory.totalSkus ?? 0)} loading={isLoading} />
          <MetricCard icon={AlertTriangle} tone="warning" label="Low Stock" value={String(d?.inventory.lowStockItems ?? 0)} sub="Below reorder" href="/dashboard/alerts" loading={isLoading} />
          <ExpiryCard d={d} loading={isLoading} />
          <MetricCard icon={Clock} tone="warning" label="Expiring (90d)" value={String(d?.inventory.expiringItems ?? 0)} sub="Total near-expiry" href="/dashboard/alerts" loading={isLoading} />
          <MetricCard icon={RotateCcw} tone={returnTone} label="Return Rate (mo)" value={`${returnRate}%`} sub={`${d?.finance.returnRate.creditNoteCount ?? 0} returns`} loading={isLoading} />
        </div>
      </div>

      {/* Revenue + recent activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Revenue · Last 7 days" className="xl:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.revenueChart ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0a8a52" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#0a8a52" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6a7681' }} tickFormatter={(v) => formatDate(v, 'DD MMM')} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6a7681' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e3e8ec', fontSize: 12, padding: '6px 10px' }} formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#0a8a52" fill="url(#rev)" strokeWidth={2} dot={{ fill: '#0a8a52', r: 2.5 }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Top Selling · 30d" flush>
          {(d?.topMedicines.length ?? 0) === 0 ? (
            <EmptyState icon={Pill} title="No sales yet" size="compact" />
          ) : (
            <ul className="divide-y divide-surface-100">
              {(d?.topMedicines ?? []).slice(0, 6).map((m, i) => (
                <li key={m.medicineId} className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xs text-surface-400 w-4">{i + 1}</span>
                    <span className="text-[13px] truncate">{m.medicineName}</span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-semibold">{m.totalQuantity}u</p>
                    <p className="text-2xs text-surface-500">{formatCurrency(m.totalRevenue)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard
          title="Recent Activity" icon={Receipt}
          action={<Link href="/dashboard/orders" className="text-xs text-brand-600 hover:underline">All orders</Link>}
          flush className="xl:col-span-2"
        >
          {(d?.recentOrders?.length ?? 0) === 0 ? (
            <EmptyState icon={ShoppingCart} title="No activity yet" size="compact" />
          ) : (
            <ul className="divide-y divide-surface-100">
              {(d?.recentOrders ?? []).slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Link href={`/dashboard/orders/${o.id}`} className="flex items-center justify-between px-4 py-2 hover:bg-surface-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`badge-base ${o.type === 'SALE' ? 'badge-success' : 'badge-info'}`}>{o.type === 'SALE' ? 'Sale' : 'Purch'}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium font-mono truncate">{o.orderNumber}</p>
                        <p className="text-2xs text-surface-500 truncate">{o.customer?.name ?? o.supplier?.name ?? 'Walk-in'} · {formatDate(o.createdAt, 'DD MMM HH:mm')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      <span className={STATUS_BADGES[o.status] ?? 'badge-neutral'}>{o.status}</span>
                      <span className="text-[13px] font-semibold tabular-nums">{formatCurrency(o.total)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recently Added" icon={PackagePlus} flush>
          {(d?.operations.recentMedicines?.length ?? 0) === 0 ? (
            <EmptyState icon={Pill} title="No medicines yet" size="compact" description="Add stock to populate inventory." />
          ) : (
            <ul className="divide-y divide-surface-100">
              {(d?.operations.recentMedicines ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] truncate">{m.name}</p>
                    <p className="text-2xs text-surface-500">{m.strength} · {m.dosageForm}</p>
                  </div>
                  <span className="text-xs font-semibold shrink-0 ml-2">{m.stock}u</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function ExpiryCard({ d, loading }: { d?: DashboardData; loading: boolean }) {
  return (
    <Link href="/dashboard/alerts" className="metric-card group">
      <div className="flex items-center justify-between mb-0.5">
        <span className="w-7 h-7 rounded-md bg-danger-50 text-danger-600 flex items-center justify-center"><Clock className="w-4 h-4" /></span>
      </div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-surface-500">Expiry Buckets</p>
      {loading ? <div className="h-5 w-20 skeleton" /> : (
        <div className="flex items-center gap-2 text-[13px] font-semibold tabular-nums">
          <span className="text-danger-600" title="≤30 days">{d?.inventory.expiry30 ?? 0}</span>
          <span className="text-surface-300">/</span>
          <span className="text-warning-600" title="31–60 days">{d?.inventory.expiry60 ?? 0}</span>
          <span className="text-surface-300">/</span>
          <span className="text-surface-500" title="61–90 days">{d?.inventory.expiry90 ?? 0}</span>
        </div>
      )}
      <p className="text-2xs text-surface-500">30 / 60 / 90 days</p>
    </Link>
  )
}
