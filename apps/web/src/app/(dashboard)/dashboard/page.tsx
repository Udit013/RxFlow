'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  TrendingUp, Package, AlertTriangle, Clock, ShoppingCart,
  Users, DollarSign, Activity, Wallet, FileSpreadsheet, UserCheck, RotateCcw, Bell,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { AnimatedSection, PageHeader, MetricCard, SectionCard, EmptyState } from '@/components/ui'

interface DashboardData {
  today: { sales: number; purchases: number; revenue: number; orders: number; newCustomers: number }
  inventory: { totalSkus: number; lowStockItems: number; expiringItems: number; expiredItems: number }
  finance: {
    outstanding: number
    pendingInvoices: number
    commissionsPending: number
    commissionsPendingCount: number
    monthlyGst: { outputTax: number; inputCredit: number; netPayable: number; salesCount: number }
    returnRate: { percent: number; creditNoteCount: number; creditNoteValue: number; salesCount: number }
  }
  topRepThisMonth: { name: string; totalCommission: number; totalSales: number; orderCount: number } | null
  recentOrders: Array<{ id: string; orderNumber: string; total: number; status: string; customer?: { name: string }; createdAt: string }>
  topMedicines: Array<{ medicineId: string; medicineName: string; totalQuantity: number; totalRevenue: number }>
  revenueChart: Array<{ date: string; revenue: number; orders: number }>
  alerts: Array<{ id: string; type: string; title: string; message: string; createdAt: string }>
}

const STATUS_BADGES: Record<string, string> = {
  CONFIRMED: 'badge-info',
  DELIVERED: 'badge-success',
  CANCELLED: 'badge-danger',
  PENDING: 'badge-warning',
  PROCESSING: 'badge-info',
  SHIPPED: 'badge-info',
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
    <div className="space-y-7">
      {/* Hero header with gradient mesh */}
      <AnimatedSection immediate className="relative">
        <div className="absolute inset-0 -z-10 bg-gradient-mesh rounded-3xl" />
        <PageHeader
          eyebrow={formatDate(new Date(), 'dddd · DD MMM YYYY')}
          title="Dashboard"
          description={`Welcome back. Here's your pharmacy at a glance${d ? ` — ${d.recentOrders.length} recent activity items.` : '.'}`}
          actions={
            <>
              <Link href="/dashboard/billing" className="btn-primary">
                <ShoppingCart className="w-4 h-4" /> New Sale
              </Link>
              <Link href="/dashboard/purchases/new" className="btn-secondary">
                <Package className="w-4 h-4" /> New Purchase
              </Link>
            </>
          }
        />
      </AnimatedSection>

      {/* Hero metric strip — biggest signal: today's revenue + GST + outstanding + returns */}
      <AnimatedSection stagger=".metric-tile">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="metric-tile">
            <MetricCard
              icon={DollarSign}
              tone="brand"
              label="Today's Revenue"
              value={formatCurrency(d?.today.revenue ?? 0)}
              sub={`${formatNumber(d?.today.orders ?? 0)} orders · ${formatNumber(d?.today.newCustomers ?? 0)} new customers`}
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={TrendingUp}
              tone="warning"
              label="Outstanding"
              value={formatCurrency(d?.finance.outstanding ?? 0)}
              sub={`${d?.finance.pendingInvoices ?? 0} unpaid invoices`}
              href="/dashboard/invoices"
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={FileSpreadsheet}
              tone="danger"
              label="GST Payable (this month)"
              value={formatCurrency(d?.finance.monthlyGst.netPayable ?? 0)}
              sub={`Output ${formatCurrency(d?.finance.monthlyGst.outputTax ?? 0)} − ITC ${formatCurrency(d?.finance.monthlyGst.inputCredit ?? 0)}`}
              href="/dashboard/reports"
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={RotateCcw}
              tone={returnTone}
              label="Return Rate (mo)"
              value={`${returnRate}%`}
              sub={`${d?.finance.returnRate.creditNoteCount ?? 0} CNs · ${formatCurrency(d?.finance.returnRate.creditNoteValue ?? 0)} refunded`}
              loading={isLoading}
            />
          </div>
        </div>
      </AnimatedSection>

      {/* Inventory health row */}
      <AnimatedSection stagger=".metric-tile">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-heading">Inventory Health</h2>
          <Link href="/dashboard/inventory" className="text-xs text-brand-600 hover:underline">View inventory →</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="metric-tile">
            <MetricCard
              icon={Package}
              tone="brand"
              label="Total SKUs"
              countUp={d?.inventory.totalSkus ?? 0}
              value={formatNumber(d?.inventory.totalSkus ?? 0)}
              sub="Active inventory items"
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={AlertTriangle}
              tone="warning"
              label="Low Stock"
              countUp={d?.inventory.lowStockItems ?? 0}
              value={formatNumber(d?.inventory.lowStockItems ?? 0)}
              sub="Below reorder level"
              href="/dashboard/alerts"
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={Clock}
              tone="warning"
              label="Expiring Soon"
              countUp={d?.inventory.expiringItems ?? 0}
              value={formatNumber(d?.inventory.expiringItems ?? 0)}
              sub="Within 90 days"
              href="/dashboard/alerts"
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={Activity}
              tone="danger"
              label="Expired"
              countUp={d?.inventory.expiredItems ?? 0}
              value={formatNumber(d?.inventory.expiredItems ?? 0)}
              sub="Quarantine + write off"
              href="/dashboard/alerts"
              loading={isLoading}
            />
          </div>
        </div>
      </AnimatedSection>

      {/* Operations + commissions row */}
      <AnimatedSection stagger=".metric-tile">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="metric-tile">
            <MetricCard
              icon={Wallet}
              tone="accent"
              label="Commissions Due"
              value={formatCurrency(d?.finance.commissionsPending ?? 0)}
              sub={`${d?.finance.commissionsPendingCount ?? 0} orders pending settlement`}
              href="/dashboard/sales-reps"
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={UserCheck}
              tone="success"
              label="Top Rep (this month)"
              value={d?.topRepThisMonth?.name ?? '—'}
              sub={d?.topRepThisMonth
                ? `${formatCurrency(d.topRepThisMonth.totalCommission)} · ${d.topRepThisMonth.orderCount} orders`
                : 'No rep-attributed sales yet'}
              loading={isLoading}
            />
          </div>
          <div className="metric-tile">
            <MetricCard
              icon={Users}
              tone="brand"
              label="New Customers (today)"
              countUp={d?.today.newCustomers ?? 0}
              value={formatNumber(d?.today.newCustomers ?? 0)}
              sub={`${formatCurrency(d?.today.purchases ?? 0)} purchased from suppliers today`}
              loading={isLoading}
            />
          </div>
        </div>
      </AnimatedSection>

      {/* Charts row */}
      <AnimatedSection>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <SectionCard
            title="Revenue · Last 7 days"
            description="Daily total of sale invoices"
            className="xl:col-span-2"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d?.revenueChart ?? []}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0c83d0" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0c83d0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7484' }} tickFormatter={(v) => formatDate(v, 'DD MMM')} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7484' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e4e8ee', boxShadow: '0 8px 24px -8px rgb(15 23 42 / 0.18)', padding: '8px 12px' }}
                    formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#0c83d0" fill="url(#colorRevenue)" strokeWidth={2.5} dot={{ fill: '#0c83d0', r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Top Medicines · 30 days" description="By revenue">
            <div className="h-64">
              {(d?.topMedicines.length ?? 0) === 0 ? (
                <EmptyState icon={Package} title="No sales yet" size="compact" description="Top sellers will appear here." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d?.topMedicines.slice(0, 6) ?? []} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7484' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="medicineName" tick={{ fontSize: 10, fill: '#363c47' }} width={90} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e4e8ee', padding: '8px 12px' }}
                      formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                    />
                    <Bar dataKey="totalRevenue" fill="#0c83d0" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>
        </div>
      </AnimatedSection>

      {/* Recent orders + alerts */}
      <AnimatedSection>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SectionCard
            title="Recent Orders"
            icon={ShoppingCart}
            action={<Link href="/dashboard/orders" className="text-xs text-brand-600 hover:underline">View all →</Link>}
            flush
          >
            {(d?.recentOrders?.length ?? 0) === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders today" size="compact" description="Sales will appear here as they happen." />
            ) : (
              <ul className="divide-y divide-surface-100">
                {(d?.recentOrders ?? []).slice(0, 6).map((order) => (
                  <li key={order.id}>
                    <Link href={`/dashboard/orders/${order.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-50/60 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-900 font-mono">{order.orderNumber}</p>
                        <p className="text-xs text-surface-500 truncate">
                          {order.customer?.name ?? 'Walk-in customer'} · {formatDate(order.createdAt, 'DD MMM HH:mm')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className={STATUS_BADGES[order.status] ?? 'badge-neutral'}>{order.status}</span>
                        <span className="text-sm font-semibold text-surface-900 tabular-nums">{formatCurrency(order.total)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Active Alerts"
            icon={Bell}
            action={<span className={(d?.alerts?.length ?? 0) > 0 ? 'badge-danger' : 'badge-success'}>{d?.alerts?.length ?? 0} {(d?.alerts?.length ?? 0) === 1 ? 'alert' : 'alerts'}</span>}
            flush
          >
            {(d?.alerts?.length ?? 0) === 0 ? (
              <EmptyState icon={Bell} title="All clear" size="compact" description="No active alerts. Stock and expiry status looks healthy." />
            ) : (
              <ul className="divide-y divide-surface-100">
                {(d?.alerts ?? []).slice(0, 6).map((alert) => (
                  <li key={alert.id} className="px-5 py-3 flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      alert.type === 'EXPIRED' ? 'bg-danger-500' :
                      alert.type === 'EXPIRY_SOON' ? 'bg-warning-500' :
                      alert.type === 'LOW_STOCK' ? 'bg-warning-500 animate-pulse-soft' :
                      'bg-brand-500'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-800">{alert.title}</p>
                      <p className="text-xs text-surface-500 truncate">{alert.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </AnimatedSection>
    </div>
  )
}
