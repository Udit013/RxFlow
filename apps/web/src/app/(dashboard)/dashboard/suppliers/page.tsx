'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Truck, Search, Plus, Phone, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

interface Supplier {
  id: string
  name: string
  companyName: string
  phone: string
  email?: string
  gstin?: string
  city?: string
  state?: string
  creditDays: number
  outstandingBalance: number
}

interface SupplierForm {
  name: string
  companyName: string
  phone: string
  email?: string
  gstin?: string
  city?: string
  state?: string
  creditDays: number
}

export default function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () =>
      api.get('/suppliers', { params: { search: search || undefined, limit: 50 } }).then((r) => r.data),
  })

  const suppliers: Supplier[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="text-sm text-slate-500">{data?.meta?.total ?? 0} suppliers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 ml-1" />
          <input
            className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
            placeholder="Search by name, company, GSTIN, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Supplier</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">GSTIN</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Credit Days</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Outstanding</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No suppliers yet
                </td>
              </tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/suppliers/${s.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {s.name}
                    </Link>
                    <p className="text-xs text-slate-500">{s.companyName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-700"><Phone className="w-3.5 h-3.5 text-slate-400" />{s.phone}</div>
                    {s.email && <p className="text-xs text-slate-500 mt-0.5">{s.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.gstin ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{s.creditDays}d</td>
                  <td className="px-4 py-3 text-right">
                    <span className={(s.outstandingBalance ?? 0) > 0 ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                      {formatCurrency(s.outstandingBalance ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/suppliers/${s.id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateSupplierModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['suppliers'] })
          }}
        />
      )}
    </div>
  )
}

function CreateSupplierModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierForm>({
    defaultValues: { creditDays: 30 },
  })

  const mutation = useMutation({
    mutationFn: (data: SupplierForm) => api.post('/suppliers', data),
    onSuccess: () => {
      toast.success('Supplier created')
      onCreated()
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to create'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">New Supplier</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div>
            <label className="label">Contact Name *</label>
            <input className="input" {...register('name', { required: true })} />
            {errors.name && <p className="text-xs text-red-600 mt-1">Required</p>}
          </div>
          <div>
            <label className="label">Company Name *</label>
            <input className="input" {...register('companyName', { required: true })} />
            {errors.companyName && <p className="text-xs text-red-600 mt-1">Required</p>}
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" {...register('phone', { required: true, minLength: 10 })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" {...register('email')} />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input" {...register('gstin')} placeholder="27AAACR5055K1ZV" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">City</label>
              <input className="input" {...register('city')} />
            </div>
            <div>
              <label className="label">Credit Days</label>
              <input className="input" type="number" {...register('creditDays', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
