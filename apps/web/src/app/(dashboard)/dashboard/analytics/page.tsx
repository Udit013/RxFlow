'use client'

import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
import { MetricCard, StatGrid } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-sales'],
    queryFn: () => api.get('/dashboard/analytics/sales', { params: { period: '30d' } }).then((r) => r.data),
  })

  const summary = data?.data?.summary
  const series = (data?.data?.salesByDay ?? []).map((d: any) => ({
    date: formatDate(d.date, 'DD MMM'),
    revenue: d.revenue,
    orders: d.orders,
  }))

  const totalRevenue = summary?.totalRevenue ?? 0
  const totalOrders = summary?.totalOrders ?? 0
  const avgOrderValue = summary?.avgOrderValue ?? 0

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="text-[13px] leading-5 text-surface-500 mt-1">Last 30 days</p>
        </div>
      </div>

      <StatGrid className="grid-cols-1 sm:grid-cols-3">
        <MetricCard label="Revenue (30 days)" value={formatCurrency(totalRevenue)} loading={isLoading} />
        <MetricCard label="Orders" value={String(totalOrders)} loading={isLoading} />
        <MetricCard label="Average order value" value={formatCurrency(avgOrderValue)} loading={isLoading} />
      </StatGrid>

      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-surface-900">Daily revenue</h2>
          <span className="text-xs text-surface-500">Last 30 days</span>
        </div>
        {isLoading ? (
          <div className="h-[300px] skeleton rounded-md" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid stroke="#eceae3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#77756b' }} axisLine={{ stroke: '#e5e2d8' }} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#77756b' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip cursor={{ stroke: '#cfcbbe' }} contentStyle={{ borderRadius: 6, border: '1px solid #e5e2d8', boxShadow: '0 8px 24px -8px rgb(19 19 17 / 0.2)', fontSize: 12, padding: '6px 10px' }} formatter={(v) => formatCurrency(Number(v ?? 0))} />
              <Line type="monotone" dataKey="revenue" stroke="#0e5f52" strokeWidth={1.75} dot={false} activeDot={{ r: 3.5, fill: '#0e5f52', stroke: '#fefefc', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
