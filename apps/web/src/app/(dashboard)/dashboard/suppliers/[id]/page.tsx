'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Phone, Mail, MapPin, FileText, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, optionalNumber } from '@/lib/utils'

interface SupplierForm {
  name: string
  companyName: string
  phone: string
  email?: string
  gstin?: string
  drugLicenseNumber?: string
  drugLicenseExpiryDate?: string
  city?: string
  state?: string
  pincode?: string
  creditDays: number
  creditLimit: number
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => api.get(`/suppliers/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: ledgerData } = useQuery({
    queryKey: ['supplier-ledger', id],
    queryFn: () => api.get(`/suppliers/${id}/ledger`, { params: { limit: 30 } }).then((r) => r.data),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/suppliers/${id}`),
    onSuccess: () => {
      toast.success('Supplier deleted')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      router.push('/dashboard/suppliers')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>
  if (!data?.data) return <div className="p-8 text-slate-400">Supplier not found</div>

  const s = data.data
  const orders = s.orders ?? []
  const ledger = ledgerData?.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/suppliers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to suppliers
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEdit(true)} className="btn-secondary"><Pencil className="w-4 h-4" /> Edit</button>
          <button onClick={() => setConfirmDelete(true)} className="btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{s.name}</h1>
            <p className="text-sm text-slate-600 mt-1">{s.companyName}</p>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-600">
              {s.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {s.phone}</span>}
              {s.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {s.email}</span>}
              {(s.city || s.state) && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {[s.city, s.state].filter(Boolean).join(', ')}</span>}
              {s.gstin && <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{s.gstin}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Outstanding (Payable)</p>
            <p className={`text-xl font-bold ${(s.outstandingBalance ?? 0) > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {formatCurrency(s.outstandingBalance ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Credit Days</p>
          <p className="text-lg font-bold text-slate-900">{s.creditDays}d</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Credit Limit</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(s.creditLimit ?? 0)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Total Purchases</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(s.totalPurchases ?? 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Recent Purchase Orders</h3>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No purchase orders</div>
            ) : (
              orders.map((o: any) => (
                <Link href={`/dashboard/orders/${o.id}`} key={o.id} className="block p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{o.orderNumber}</p>
                      <p className="text-xs text-slate-500">{formatDate(o.createdAt)} • {o.status}</p>
                    </div>
                    <span className="font-semibold text-slate-900">{formatCurrency(o.total)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-slate-900">Ledger</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {ledger.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No ledger entries</div>
            ) : (
              ledger.map((e: any) => (
                <div key={e.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{e.description ?? e.type}</p>
                    <p className="text-xs text-slate-500">{formatDate(e.createdAt)}</p>
                  </div>
                  <span className={`font-semibold text-sm ${e.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                    {e.type === 'CREDIT' ? '+' : '-'}{formatCurrency(e.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <EditSupplierModal
          supplier={s}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            queryClient.invalidateQueries({ queryKey: ['supplier', id] })
            queryClient.invalidateQueries({ queryKey: ['suppliers'] })
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete supplier?"
          message={`"${s.name}" will be hidden from the list. Existing purchase orders and batches stay intact. You can't undo this from the UI.`}
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          danger
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function EditSupplierModal({ supplier, onClose, onSaved }: { supplier: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierForm>({
    defaultValues: {
      name: supplier.name,
      companyName: supplier.companyName,
      phone: supplier.phone,
      email: supplier.email ?? '',
      gstin: supplier.gstin ?? '',
      drugLicenseNumber: supplier.drugLicenseNumber ?? '',
      drugLicenseExpiryDate: supplier.drugLicenseExpiryDate ? new Date(supplier.drugLicenseExpiryDate).toISOString().slice(0, 10) : '',
      city: supplier.city ?? '',
      state: supplier.state ?? '',
      pincode: supplier.pincode ?? '',
      creditDays: supplier.creditDays ?? 30,
      creditLimit: supplier.creditLimit ?? 0,
    },
  })
  const mutation = useMutation({
    mutationFn: (data: SupplierForm) => {
      const payload: any = { ...data, creditDays: Number(data.creditDays), creditLimit: Number(data.creditLimit) }
      for (const k of Object.keys(payload)) {
        if (payload[k] === '') delete payload[k]
      }
      return api.put(`/suppliers/${supplier.id}`, payload)
    },
    onSuccess: () => { toast.success('Supplier updated'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">Edit Supplier</h2>
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
            <input className="input" {...register('gstin')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Drug License #</label>
              <input className="input font-mono text-xs" {...register('drugLicenseNumber')} />
            </div>
            <div>
              <label className="label">License Expiry</label>
              <input type="date" className="input" {...register('drugLicenseExpiryDate')} />
            </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Credit Days</label>
              <input className="input" type="number" {...register('creditDays', optionalNumber)} />
            </div>
            <div>
              <label className="label">Credit Limit (₹)</label>
              <input className="input" type="number" {...register('creditLimit', optionalNumber)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
        <h2 className="font-semibold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-600 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
