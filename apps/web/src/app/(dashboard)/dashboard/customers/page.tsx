'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Users, Search, Plus, Phone, Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { AnimatedSection, PageHeader, SectionCard, EmptyState, SkeletonRow } from '@/components/ui'

interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  city?: string
  state?: string
  gstin?: string
  creditLimit: number
  outstandingBalance: number
  totalPurchases: number
  createdAt: string
}

interface CustomerForm {
  name: string
  phone: string
  email?: string
  city?: string
  state?: string
  pincode?: string
  gstin?: string
  creditLimit: number
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      api.get('/customers', { params: { search: search || undefined, limit: 50 } }).then((r) => r.data),
  })

  const customers: Customer[] = data?.data ?? []

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Users}
          eyebrow="Stakeholders"
          title="Customers"
          description={`${data?.meta?.total ?? 0} customer${(data?.meta?.total ?? 0) === 1 ? '' : 's'} on file`}
          actions={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Add Customer
            </button>
          }
        />
      </AnimatedSection>

      <AnimatedSection>
        <div className="card !p-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-surface-400 ml-1" />
          <input
            className="flex-1 text-sm bg-transparent placeholder:text-surface-400 outline-none py-1.5"
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} className="text-surface-400 hover:text-surface-700 px-1"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </AnimatedSection>

      <AnimatedSection>
        <SectionCard flush>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50/60 border-b border-surface-200/70">
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-surface-500 uppercase tracking-[0.1em]">Name</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-surface-500 uppercase tracking-[0.1em]">Contact</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-surface-500 uppercase tracking-[0.1em]">Location</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold text-surface-500 uppercase tracking-[0.1em]">Outstanding</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold text-surface-500 uppercase tracking-[0.1em]">Total Purchases</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {isLoading ? (
              <SkeletonRow columns={6} rows={6} widths={['40%', '50%', '40%', '30%', '30%', '15%']} />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Users}
                    title={search ? 'No matches' : 'No customers yet'}
                    description={search ? `Nothing matches "${search}".` : 'Add your first customer to start tracking sales.'}
                    action={!search && (
                      <button onClick={() => setShowCreate(true)} className="btn-primary">
                        <Plus className="w-4 h-4" /> Add Customer
                      </button>
                    )}
                  />
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-surface-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {c.name}
                    </Link>
                    {c.gstin && <span className="ml-2 badge-info text-[10px] font-mono">B2B</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-700"><Phone className="w-3.5 h-3.5 text-slate-400" />{c.phone}</div>
                    {c.email && <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5"><Mail className="w-3 h-3" />{c.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={c.outstandingBalance > 0 ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                      {formatCurrency(c.outstandingBalance ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(c.totalPurchases ?? 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/customers/${c.id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </SectionCard>
      </AnimatedSection>

      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}
    </div>
  )
}

function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CustomerForm>({
    defaultValues: { creditLimit: 0 },
  })

  const mutation = useMutation({
    mutationFn: (data: CustomerForm) => api.post('/customers', data),
    onSuccess: () => {
      toast.success('Customer created')
      onCreated()
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to create'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">New Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
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
              <label className="label">City</label>
              <input className="input" {...register('city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" {...register('state')} />
            </div>
          </div>
          <div>
            <label className="label">GSTIN (optional — makes this customer B2B)</label>
            <input className="input font-mono text-xs" placeholder="27AAACR5055K1ZV" {...register('gstin')} />
          </div>
          <div>
            <label className="label">Credit Limit (₹)</label>
            <input className="input" type="number" {...register('creditLimit', { valueAsNumber: true })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
