'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { UserCheck, Plus, Phone, X, MapPin, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

interface SalesRep {
  id: string
  name: string
  phone: string
  email?: string
  employeeCode?: string
  territory?: string
  defaultCommissionPercent: number
  flatBonusAmount?: number
  isActive: boolean
}

interface SalesRepForm {
  name: string
  phone: string
  email?: string
  employeeCode?: string
  territory?: string
  defaultCommissionPercent: number
  flatBonusAmount?: number
}

export default function SalesRepsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.get('/sales-reps', { params: { limit: 50 } }).then((r) => r.data),
  })

  const reps: SalesRep[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><UserCheck className="w-5 h-5" /> Sales Reps</h1>
          <p className="text-sm text-slate-500">{reps.length} representatives</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Sales Rep
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Territory</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Commission %</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Flat Bonus</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : reps.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No sales reps yet. Add one to start tracking commissions.
                </td>
              </tr>
            ) : (
              reps.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/sales-reps/${r.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {r.name}
                    </Link>
                    {r.employeeCode && <p className="text-xs text-slate-500 font-mono">{r.employeeCode}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-700"><Phone className="w-3.5 h-3.5 text-slate-400" />{r.phone}</div>
                    {r.email && <p className="text-xs text-slate-500">{r.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {r.territory ? (
                      <span className="flex items-center gap-1.5 text-slate-600"><MapPin className="w-3.5 h-3.5" />{r.territory}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium">{r.defaultCommissionPercent}%</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {r.flatBonusAmount ? formatCurrency(r.flatBonusAmount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.isActive ? <span className="badge-success">Active</span> : <span className="badge-neutral">Inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/sales-reps/${r.id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-5 bg-slate-50 border-dashed">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-2"><Percent className="w-4 h-4" /> How commission works</h3>
        <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
          <li>When creating a sale (POS), optionally attach a sales rep — commission is computed automatically.</li>
          <li>Default commission % per rep is configured here; can be overridden per order.</li>
          <li>Orders without a rep attached (direct walk-ins, WhatsApp orders) generate no commission.</li>
          <li>View commission per period on each rep's detail page; settle (mark as paid) in bulk.</li>
        </ul>
      </div>

      {showCreate && (
        <CreateSalesRepModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['sales-reps'] })
          }}
        />
      )}
    </div>
  )
}

function CreateSalesRepModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<SalesRepForm>({
    defaultValues: { defaultCommissionPercent: 2 },
  })

  const mutation = useMutation({
    mutationFn: (data: SalesRepForm) => api.post('/sales-reps', {
      ...data,
      defaultCommissionPercent: Number(data.defaultCommissionPercent),
      flatBonusAmount: data.flatBonusAmount ? Number(data.flatBonusAmount) : undefined,
    }),
    onSuccess: () => { toast.success('Sales rep added'); onCreated() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">New Sales Rep</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" {...register('name', { required: true })} />
            {errors.name && <p className="text-xs text-red-600 mt-1">Required</p>}
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" {...register('phone', { required: true, minLength: 10 })} />
            {errors.phone && <p className="text-xs text-red-600 mt-1">10+ digits required</p>}
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" {...register('email')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Employee Code</label>
              <input className="input" {...register('employeeCode')} placeholder="EMP-001" />
            </div>
            <div>
              <label className="label">Territory</label>
              <input className="input" {...register('territory')} placeholder="South Mumbai" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Commission % *</label>
              <input className="input" type="number" step="0.1" {...register('defaultCommissionPercent', { required: true, valueAsNumber: true, min: 0, max: 100 })} />
            </div>
            <div>
              <label className="label">Flat Bonus (₹) per order</label>
              <input className="input" type="number" step="1" {...register('flatBonusAmount', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Add Sales Rep'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
