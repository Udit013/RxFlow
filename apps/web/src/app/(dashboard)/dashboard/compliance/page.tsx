'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Papa from 'papaparse'
import { Shield, AlertTriangle, CheckCircle2, Calendar, Download, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { AnimatedSection, PageHeader, MetricCard } from '@/components/ui'

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(period: string) {
  const [y, m] = period.split('-').map(Number)
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString(),
  }
}

const STATUS_STYLES: Record<string, string> = {
  EXPIRED: 'bg-red-100 text-red-700',
  EXPIRING: 'bg-amber-100 text-amber-800',
  MISSING: 'bg-slate-100 text-slate-600',
  OK: 'bg-green-100 text-green-700',
}

export default function CompliancePage() {
  const [tab, setTab] = useState<'h1' | 'licenses'>('h1')

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Shield}
          eyebrow="Admin"
          title="Compliance"
          description="Schedule H/H1/X register & drug-license expiry tracking (CDSCO)"
        />
      </AnimatedSection>

      <AnimatedSection>
        <div className="flex items-center gap-1 bg-white border border-surface-200/70 rounded-xl p-1 w-fit shadow-xs">
          {([
            ['h1', 'Schedule H/H1/X Register', FileText],
            ['licenses', 'License Expiry', Calendar],
          ] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                tab === k ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-600 hover:bg-surface-50'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </AnimatedSection>

      <AnimatedSection key={tab}>
        {tab === 'h1' && <ScheduleH1Tab />}
        {tab === 'licenses' && <LicenseTab />}
      </AnimatedSection>
    </div>
  )
}

function ScheduleH1Tab() {
  const [period, setPeriod] = useState(thisMonth())
  const [scheduleFilter, setScheduleFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['h1-register', period, scheduleFilter],
    queryFn: () => {
      const { from, to } = monthRange(period)
      return api.get('/reports/schedule-h1-register', {
        params: { from, to, schedule: scheduleFilter || undefined },
      }).then((r) => r.data)
    },
  })

  const rows: any[] = data?.data ?? []

  function exportCsv() {
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `schedule-h1-register-${period}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">Period</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="input w-auto" />
        <select className="input w-auto" value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value)}>
          <option value="">All scheduled drugs</option>
          <option value="SCHEDULE_H">Schedule H only</option>
          <option value="SCHEDULE_H1">Schedule H1 only</option>
          <option value="SCHEDULE_X">Schedule X only</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{rows.length} entries</span>
        <button onClick={exportCsv} disabled={rows.length === 0} className="btn-primary">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="card p-3 bg-amber-50 border-amber-200 text-xs text-amber-900">
        <strong>Note:</strong> CDSCO requires this register to be available for inspection at all times. This export
        is a starting point — verify with your local Drug Inspector for any state-specific format requirements.
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Invoice</th>
                <th className="text-left px-3 py-2">Medicine</th>
                <th className="text-left px-3 py-2">Sch</th>
                <th className="text-left px-3 py-2">Batch</th>
                <th className="text-left px-3 py-2">Expiry</th>
                <th className="text-center px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">Customer</th>
                <th className="text-left px-3 py-2">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={9} className="p-12 text-center text-slate-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="p-12 text-center text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No scheduled-drug sales in this period
                </td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs">{formatDate(r.date, 'DD/MM/YY')}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceNumber}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.medicine}</p>
                      <p className="text-xs text-slate-500">{r.strength} · {r.manufacturer}</p>
                    </td>
                    <td className="px-3 py-2"><span className="badge-warning text-[10px]">{r.schedule.replace('SCHEDULE_', '')}</span></td>
                    <td className="px-3 py-2 font-mono text-xs">{r.batchNumber}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(r.expiryDate, 'MM/YY')}</td>
                    <td className="px-3 py-2 text-center font-medium">{r.quantity}</td>
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="px-3 py-2 text-xs">{r.customerPhone}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LicenseTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['license-expiry'],
    queryFn: () => api.get('/reports/license-expiry', { params: { days: 180 } }).then((r) => r.data),
  })

  const items: any[] = data?.data ?? []
  const stats = items.reduce(
    (acc, it) => ({
      expired: acc.expired + (it.status === 'EXPIRED' ? 1 : 0),
      expiring: acc.expiring + (it.status === 'EXPIRING' ? 1 : 0),
      missing: acc.missing + (it.status === 'MISSING' ? 1 : 0),
    }),
    { expired: 0, expiring: 0, missing: 0 }
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard icon={AlertTriangle} tone="danger"  label="Expired" countUp={stats.expired}  value={String(stats.expired)}  sub="Renew immediately" />
        <MetricCard icon={Calendar}      tone="warning" label="Expiring (180d)" countUp={stats.expiring} value={String(stats.expiring)} sub="Plan renewal" />
        <MetricCard icon={CheckCircle2}  tone="neutral" label="Missing data" countUp={stats.missing}  value={String(stats.missing)}  sub="Update expiry dates" />
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h3 className="font-semibold">Drug Licenses</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="text-left px-3 py-2">Owner</th>
              <th className="text-left px-3 py-2">License #</th>
              <th className="text-left px-3 py-2">Expires</th>
              <th className="text-center px-3 py-2">Days</th>
              <th className="text-center px-3 py-2">Status</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="p-12 text-center text-slate-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-12 text-center text-slate-400">No license data — set drug license expiry dates in Settings + Suppliers</td></tr>
            ) : (
              items.map((it) => (
                <tr key={`${it.kind}-${it.id}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-xs text-slate-500">{it.kind === 'TENANT' ? 'Your pharmacy' : 'Supplier'}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{it.licenseNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{it.expiryDate ? formatDate(it.expiryDate) : <span className="text-slate-400 italic">not set</span>}</td>
                  <td className="px-3 py-2 text-center font-medium">
                    {it.daysUntilExpiry == null ? '—' :
                     it.daysUntilExpiry < 0 ? <span className="text-red-600">Expired {Math.abs(it.daysUntilExpiry)}d ago</span> :
                     it.daysUntilExpiry === 0 ? <span className="text-red-600">Expires today</span> :
                     <span className={cn(it.daysUntilExpiry <= 30 ? 'text-red-600' : it.daysUntilExpiry <= 90 ? 'text-amber-600' : 'text-slate-600')}>{it.daysUntilExpiry}d</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLES[it.status])}>
                      {it.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {it.kind === 'TENANT' ? (
                      <Link href="/dashboard/settings" className="text-xs text-brand-600 hover:underline">Update</Link>
                    ) : (
                      <Link href={`/dashboard/suppliers/${it.id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                    )}
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
