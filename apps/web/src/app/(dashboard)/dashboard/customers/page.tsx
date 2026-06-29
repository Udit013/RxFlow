'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Users, Plus, Phone, Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, optionalNumber } from '@/lib/utils'
import { AnimatedSection, PageHeader, DataTable, type DataTableColumn } from '@/components/ui'

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

const customerColumns: DataTableColumn<Customer>[] = [
  {
    key: 'name', header: 'Name', pinned: true, accessor: (c) => c.name,
    render: (c) => (
      <Link href={`/dashboard/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-surface-900 hover:text-brand-600">
        {c.name}{c.gstin && <span className="ml-2 badge-info text-[10px] font-mono">B2B</span>}
      </Link>
    ),
  },
  {
    key: 'phone', header: 'Contact', accessor: (c) => `${c.phone} ${c.email ?? ''}`,
    render: (c) => (
      <div>
        <div className="flex items-center gap-1.5 text-surface-700"><Phone className="w-3.5 h-3.5 text-surface-400" />{c.phone}</div>
        {c.email && <div className="flex items-center gap-1.5 text-xs text-surface-500 mt-0.5"><Mail className="w-3 h-3" />{c.email}</div>}
      </div>
    ),
  },
  { key: 'location', header: 'Location', accessor: (c) => [c.city, c.state].filter(Boolean).join(', '), render: (c) => <span className="text-surface-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</span> },
  {
    key: 'outstandingBalance', header: 'Outstanding', align: 'right', accessor: (c) => c.outstandingBalance ?? 0,
    render: (c) => <span className={(c.outstandingBalance ?? 0) > 0 ? 'text-accent-600 font-medium' : 'text-surface-500'}>{formatCurrency(c.outstandingBalance ?? 0)}</span>,
  },
  { key: 'totalPurchases', header: 'Total Purchases', align: 'right', accessor: (c) => c.totalPurchases ?? 0, render: (c) => <span className="text-surface-900">{formatCurrency(c.totalPurchases ?? 0)}</span> },
]

export default function CustomersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers', { params: { limit: 500 } }).then((r) => r.data),
  })

  const customers: Customer[] = data?.data ?? []

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Users}
          eyebrow="Stakeholders"
          title="Customers"
          description={`${data?.meta?.total ?? customers.length} customer${(data?.meta?.total ?? customers.length) === 1 ? '' : 's'} on file`}
          actions={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Add Customer
            </button>
          }
        />
      </AnimatedSection>

      <DataTable<Customer>
        data={customers}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        columns={customerColumns}
        searchPlaceholder="Search by name, phone, email…"
        exportFileName="rxflow-customers"
        emptyIcon={Users}
        emptyTitle="No customers yet"
        emptyDescription="Add your first customer to start tracking sales."
        emptyAction={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Customer</button>}
        onRowClick={(c) => router.push(`/dashboard/customers/${c.id}`)}
      />

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
            <input className="input" type="number" {...register('creditLimit', optionalNumber)} />
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
