'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
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
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Analytics</h1>
          <p className="text-sm text-slate-500">Last 30 days</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Revenue (30d)</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Orders</p>
          <p className="text-2xl font-bold text-slate-900">{totalOrders}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Avg Order Value</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(avgOrderValue)}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-slate-900">Daily Revenue</h3>
        </div>
        {isLoading ? (
          <div className="h-72 animate-pulse bg-slate-50 rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="revenue" stroke="#077ace" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
