'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ShoppingCart, ShoppingBag, PackagePlus, Pill, ArrowRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatNumber, moneySymbol } from '@/lib/utils'
import { MetricCard, StatGrid, SectionCard, EmptyState } from '@/components/ui'

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
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="page-eyebrow">{formatDate(new Date(), 'dddd, DD MMM YYYY')}</p>
          <h1 className="page-title">Today&apos;s operations</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/purchases/new" className="btn-secondary"><PackagePlus className="w-4 h-4" /> New purchase</Link>
          <Link href="/dashboard/billing" className="btn-primary"><ShoppingBag className="w-4 h-4" /> New sale</Link>
        </div>
      </header>

      {/* Today — money in and money owed */}
      <StatGrid className="grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Today's sales" value={formatCurrency(d?.today.sales ?? 0)} sub={`${formatNumber(d?.today.orders ?? 0)} orders today`} loading={isLoading} />
        <MetricCard tone={(d?.operations.pendingPurchaseOrders ?? 0) > 0 ? 'warning' : 'neutral'} label="Pending purchase orders" value={String(d?.operations.pendingPurchaseOrders ?? 0)} sub="Not yet received" href="/dashboard/orders?type=PURCHASE" loading={isLoading} />
        <MetricCard tone={(d?.finance.outstanding ?? 0) > 0 ? 'danger' : 'neutral'} label="Outstanding payments" value={formatCurrency(d?.finance.outstanding ?? 0)} sub={`${d?.finance.pendingInvoices ?? 0} unpaid invoices`} href="/dashboard/invoices" loading={isLoading} />
        <MetricCard label="GST payable (month)" value={formatCurrency(d?.finance.monthlyGst.netPayable ?? 0)} sub="Output − ITC" href="/dashboard/reports" loading={isLoading} />
      </StatGrid>

      {/* Inventory health */}
      <section>
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="section-heading">Inventory health</h2>
          <Link href="/dashboard/inventory" className="text-xs font-medium text-surface-500 hover:text-surface-900 inline-flex items-center gap-0.5">View inventory <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <StatGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Total SKUs" value={formatNumber(d?.inventory.totalSkus ?? 0)} loading={isLoading} />
          <MetricCard tone={(d?.inventory.lowStockItems ?? 0) > 0 ? 'warning' : 'neutral'} label="Low stock" value={String(d?.inventory.lowStockItems ?? 0)} sub="Below reorder" href="/dashboard/alerts" loading={isLoading} />
          <ExpiryCard d={d} loading={isLoading} />
          <MetricCard tone={(d?.inventory.expiringItems ?? 0) > 0 ? 'warning' : 'neutral'} label="Expiring in 90 days" value={String(d?.inventory.expiringItems ?? 0)} sub="Total near-expiry" href="/dashboard/alerts" loading={isLoading} />
          <MetricCard tone={returnTone === 'success' ? 'neutral' : returnTone} label="Return rate (month)" value={`${returnRate}%`} sub={`${d?.finance.returnRate.creditNoteCount ?? 0} returns`} loading={isLoading} />
        </StatGrid>
      </section>

      {/* Revenue + recent activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Revenue" description="Last 7 days" className="xl:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.revenueChart ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d8169" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#1d8169" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eceae3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#77756b' }} tickFormatter={(v) => formatDate(v, 'DD MMM')} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#77756b' }} tickFormatter={(v: number) => (v >= 1000 ? `${moneySymbol()}${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${moneySymbol()}${Math.round(v)}`)} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ stroke: '#cfcbbe' }} contentStyle={{ borderRadius: 6, border: '1px solid #e5e2d8', boxShadow: '0 8px 24px -8px rgb(19 19 17 / 0.2)', fontSize: 12, padding: '6px 10px' }} formatter={(v) => [formatCurrency(Number(v ?? 0)), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#0e5f52" fill="url(#rev)" strokeWidth={1.75} dot={false} activeDot={{ r: 3.5, fill: '#0e5f52', stroke: '#fefefc', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Top selling" description="Last 30 days" flush>
          {(d?.topMedicines.length ?? 0) === 0 ? (
            <EmptyState icon={Pill} title="No sales yet" size="compact" />
          ) : (
            <ul className="divide-y divide-surface-100">
              {(d?.topMedicines ?? []).slice(0, 6).map((m, i) => (
                <li key={m.medicineId} className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-surface-400 w-4 tabular-nums">{i + 1}</span>
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
          title="Recent activity"
          action={<Link href="/dashboard/orders" className="font-medium text-surface-500 hover:text-surface-900">All orders</Link>}
          flush className="xl:col-span-2"
        >
          {(d?.recentOrders?.length ?? 0) === 0 ? (
            <EmptyState icon={ShoppingCart} title="No activity yet" size="compact" />
          ) : (
            <ul className="divide-y divide-surface-100">
              {(d?.recentOrders ?? []).slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Link href={`/dashboard/orders/${o.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`badge-base ${o.type === 'SALE' ? 'badge-success' : 'badge-info'}`}>{o.type === 'SALE' ? 'Sale' : 'Purch'}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">{o.orderNumber}</p>
                        <p className="text-xs text-surface-500 truncate">{o.customer?.name ?? o.supplier?.name ?? 'Walk-in'} · {formatDate(o.createdAt, 'DD MMM HH:mm')}</p>
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

        <SectionCard title="Recently added" flush>
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
  const urgent = (d?.inventory.expiry30 ?? 0) > 0
  return (
    <Link href="/dashboard/alerts" className="block h-full px-4 py-3.5 transition-colors hover:bg-surface-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600">
      <p className="flex items-center gap-1.5 text-xs font-medium text-surface-500">
        {urgent && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-danger-500" />}
        Expiry buckets
      </p>
      {loading ? <div className="h-6 w-20 skeleton mt-2" /> : (
        <div className="flex items-baseline gap-1.5 font-display text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums mt-1">
          <span className={urgent ? 'text-danger-600' : 'text-surface-950'} title="≤30 days">{d?.inventory.expiry30 ?? 0}</span>
          <span className="text-surface-300 text-base font-normal">/</span>
          <span className={(d?.inventory.expiry60 ?? 0) > 0 ? 'text-warning-600' : 'text-surface-950'} title="31–60 days">{d?.inventory.expiry60 ?? 0}</span>
          <span className="text-surface-300 text-base font-normal">/</span>
          <span className="text-surface-950" title="61–90 days">{d?.inventory.expiry90 ?? 0}</span>
        </div>
      )}
      <p className="text-xs text-surface-500 mt-0.5">30 / 60 / 90 days</p>
    </Link>
  )
}
