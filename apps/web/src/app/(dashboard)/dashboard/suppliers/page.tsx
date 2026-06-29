'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Truck, Plus, Phone, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui'

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

const supplierColumns: DataTableColumn<Supplier>[] = [
  {
    key: 'name', header: 'Supplier', pinned: true, accessor: (s) => `${s.name} ${s.companyName}`,
    render: (s) => (
      <Link href={`/dashboard/suppliers/${s.id}`} onClick={(e) => e.stopPropagation()}>
        <p className="font-medium text-surface-900 hover:text-brand-600">{s.name}</p>
        <p className="text-xs text-surface-500">{s.companyName}</p>
      </Link>
    ),
  },
  {
    key: 'phone', header: 'Contact', accessor: (s) => s.phone,
    render: (s) => (
      <div>
        <div className="flex items-center gap-1.5 text-surface-700"><Phone className="w-3.5 h-3.5 text-surface-400" />{s.phone}</div>
        {s.email && <p className="text-xs text-surface-500 mt-0.5">{s.email}</p>}
      </div>
    ),
  },
  { key: 'gstin', header: 'GSTIN', accessor: (s) => s.gstin ?? '', render: (s) => <span className="font-mono text-xs text-surface-600">{s.gstin ?? '—'}</span> },
  { key: 'creditDays', header: 'Credit Days', align: 'center', accessor: (s) => s.creditDays, render: (s) => `${s.creditDays}d` },
  {
    key: 'outstandingBalance', header: 'Outstanding', align: 'right', accessor: (s) => s.outstandingBalance ?? 0,
    render: (s) => <span className={(s.outstandingBalance ?? 0) > 0 ? 'text-accent-600 font-medium' : 'text-surface-500'}>{formatCurrency(s.outstandingBalance ?? 0)}</span>,
  },
]

export default function SuppliersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers', { params: { limit: 500 } }).then((r) => r.data),
  })

  const suppliers: Supplier[] = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="text-sm text-surface-500">{data?.meta?.total ?? suppliers.length} suppliers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <DataTable<Supplier>
        data={suppliers}
        isLoading={isLoading}
        rowKey={(s) => s.id}
        columns={supplierColumns}
        searchPlaceholder="Search by name, company, GSTIN, phone…"
        exportFileName="rxflow-suppliers"
        emptyIcon={Truck}
        emptyTitle="No suppliers yet"
        emptyDescription="Add your first supplier to track purchases, ledgers, and dues."
        emptyAction={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Supplier</button>}
        onRowClick={(s) => router.push(`/dashboard/suppliers/${s.id}`)}
      />

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
