'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { History, User as UserIcon, Filter } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { AnimatedSection, PageHeader } from '@/components/ui'

const ACTION_COLORS: Record<string, string> = {
  'order.sale.create': 'bg-green-100 text-green-700',
  'order.purchase.create': 'bg-blue-100 text-blue-700',
  'order.status.update': 'bg-slate-100 text-slate-700',
  'invoice.sale.create': 'bg-green-100 text-green-700',
  'invoice.purchase.create': 'bg-blue-100 text-blue-700',
  'invoice.payment.record': 'bg-emerald-100 text-emerald-700',
  'invoice.credit-note.create': 'bg-amber-100 text-amber-700',
  'inventory.batch.add': 'bg-blue-100 text-blue-700',
  'inventory.batch.write-off': 'bg-red-100 text-red-700',
  'stock-take.create': 'bg-indigo-100 text-indigo-700',
  'stock-take.complete': 'bg-purple-100 text-purple-700',
  'customer.create': 'bg-cyan-100 text-cyan-700',
  'customer.update': 'bg-slate-100 text-slate-700',
  'customer.delete': 'bg-red-100 text-red-700',
  'supplier.create': 'bg-cyan-100 text-cyan-700',
  'supplier.update': 'bg-slate-100 text-slate-700',
}

function actionLabel(action: string): string {
  return action
    .split('.')
    .map((s) => s.replace(/-/g, ' '))
    .join(' › ')
}

function entityLink(entityType: string, entityId: string | null | undefined): string | null {
  if (!entityId) return null
  switch (entityType) {
    case 'Order': return `/dashboard/orders/${entityId}`
    case 'Invoice': return `/dashboard/invoices/${entityId}`
    case 'Customer': return `/dashboard/customers/${entityId}`
    case 'Supplier': return `/dashboard/suppliers/${entityId}`
    case 'StockTake': return `/dashboard/stock-takes/${entityId}`
    default: return null
  }
}

export default function AuditPage() {
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [userId, setUserId] = useState('')

  const { data: filtersData } = useQuery({
    queryKey: ['audit-filters'],
    queryFn: () => api.get('/audit-logs/distinct').then((r) => r.data),
  })
  const filters = filtersData?.data ?? { actions: [], entityTypes: [], users: [] }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', action, entityType, userId],
    queryFn: () =>
      api.get('/audit-logs', {
        params: {
          action: action || undefined,
          entityType: entityType || undefined,
          userId: userId || undefined,
          limit: 100,
        },
      }).then((r) => r.data),
  })

  const logs: any[] = data?.data ?? []

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={History}
          eyebrow="Admin"
          title="Audit Log"
          description="Every change — who did it, when, and from which device"
        />
      </AnimatedSection>

      <AnimatedSection>
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400 ml-1" />
        <select className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {filters.actions.map((a: string) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
        <select className="input w-auto" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entity types</option>
          {filters.entityTypes.map((e: string) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="input w-auto" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">All users</option>
          {filters.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(action || entityType || userId) && (
          <button
            onClick={() => { setAction(''); setEntityType(''); setUserId('') }}
            className="text-xs text-slate-500 hover:text-red-600"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-surface-500">{data?.meta?.total ?? 0} entries · {logs.length} shown</span>
      </div>
      </AnimatedSection>

      <AnimatedSection>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[700px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Entity</th>
                <th className="text-left px-3 py-2">Details</th>
                <th className="text-left px-3 py-2">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-slate-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-slate-400 text-sm">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No audit entries yet
                </td></tr>
              ) : (
                logs.map((log) => {
                  const colorCls = ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-700'
                  const href = entityLink(log.entityType, log.entityId)
                  return (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 align-top">
                        <p className="text-xs">{formatRelativeTime(log.createdAt)}</p>
                        <p className="text-[10px] text-slate-400">{formatDate(log.createdAt, 'HH:mm:ss')}</p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          <span className="text-xs">{log.user?.name ?? '—'}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{log.user?.role ?? ''}</span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colorCls}`}>
                          {actionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {href ? (
                          <Link href={href} className="text-xs text-brand-600 hover:underline">
                            {log.entityType}
                          </Link>
                        ) : <span className="text-xs text-slate-500">{log.entityType}</span>}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-600 max-w-md">
                        <Details newValues={log.newValues} oldValues={log.oldValues} />
                      </td>
                      <td className="px-3 py-2 align-top text-[10px] text-slate-400 font-mono">
                        {log.ipAddress ?? '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </AnimatedSection>
    </div>
  )
}

function Details({ newValues, oldValues }: { newValues: any; oldValues: any }) {
  if (!newValues && !oldValues) return <span className="text-slate-400">—</span>
  const parts: string[] = []
  if (newValues && typeof newValues === 'object') {
    for (const [k, v] of Object.entries(newValues)) {
      if (v == null || v === '') continue
      const display = typeof v === 'object' ? JSON.stringify(v) : String(v)
      parts.push(`${k}: ${display}`)
    }
  }
  if (oldValues && typeof oldValues === 'object') {
    const changes: string[] = []
    for (const [k, v] of Object.entries(oldValues)) {
      if (v == null || v === '') continue
      changes.push(`${k} was ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    }
    if (changes.length > 0) parts.unshift(...changes)
  }
  return <span className="break-words">{parts.slice(0, 4).join(' · ')}{parts.length > 4 ? ` · +${parts.length - 4}` : ''}</span>
}
