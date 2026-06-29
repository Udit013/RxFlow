'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, Pencil, Trash2, X, Repeat, AlertCircle, Clock, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { formatCurrency, formatDate, optionalNumber } from '@/lib/utils'

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

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: customerData, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/customers/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/customers/${id}`),
    onSuccess: () => {
      toast.success('Customer deleted')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      router.push('/dashboard/customers')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const { data: historyData } = useQuery({
    queryKey: ['customer-history', id],
    queryFn: () => api.get(`/customers/${id}/purchase-history`, { params: { limit: 20 } }).then((r) => r.data),
    enabled: !!id,
  })

  const { data: refillData } = useQuery({
    queryKey: ['customer-refill', id],
    queryFn: () => api.get(`/customers/${id}/refill-suggestions`).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>
  if (!customerData?.data) return <div className="p-8 text-slate-400">Customer not found</div>

  const c = customerData.data
  const orders = historyData?.data ?? []
  const ledger = c.ledgerEntries ?? []
  const refills: any[] = refillData?.data ?? []
  const overdueOrDue = refills.filter((r) => r.status === 'OVERDUE' || r.status === 'DUE_SOON')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to customers
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEdit(true)} className="btn-secondary"><Pencil className="w-4 h-4" /> Edit</button>
          <button onClick={() => setConfirmDelete(true)} className="btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{c.name}</h1>
              {c.gstin && <span className="badge-info">B2B</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-600">
              {c.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {c.phone}</span>}
              {c.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {c.email}</span>}
              {(c.city || c.state) && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {[c.city, c.state].filter(Boolean).join(', ')}</span>}
              {c.gstin && <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">GSTIN: {c.gstin}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Outstanding</p>
            <p className={`text-xl font-bold ${(c.outstandingBalance ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {formatCurrency(c.outstandingBalance ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Credit Limit</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(c.creditLimit ?? 0)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Total Purchases</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(c.totalPurchases ?? 0)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Orders</p>
          <p className="text-lg font-bold text-slate-900">{orders.length}</p>
        </div>
      </div>

      {refills.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-brand-600" /> Refill Suggestions
            </h3>
            <div className="text-xs">
              <span className="text-red-600 font-medium">{refills.filter((r) => r.status === 'OVERDUE').length} overdue</span>
              <span className="text-slate-400 mx-2">·</span>
              <span className="text-amber-600 font-medium">{refills.filter((r) => r.status === 'DUE_SOON').length} due soon</span>
              <span className="text-slate-400 mx-2">·</span>
              <span className="text-slate-500">{refills.filter((r) => r.status === 'ON_TRACK').length} on track</span>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {refills.map((r: any) => {
              const isOverdue = r.status === 'OVERDUE'
              const isDueSoon = r.status === 'DUE_SOON'
              return (
                <div key={r.medicineId} className="p-4 flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    {isOverdue && <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                    {isDueSoon && <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                    {!isOverdue && !isDueSoon && <Repeat className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />}
                    <div>
                      <Link href={`/dashboard/medicines/${r.medicineId}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {r.medicineName}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {r.strength} · {r.dosageForm} · Bought {r.purchaseCount}× · Typical qty: {r.typicalQuantity}
                      </p>
                      <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-amber-700' : 'text-slate-500'}`}>
                        Last: {r.daysSinceLast}d ago
                        {r.medianIntervalDays && <> · usually every {r.medianIntervalDays}d</>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {r.requiresPrescription && <span className="badge-warning text-[10px] mb-1 inline-block">Rx</span>}
                    <p className="text-xs text-slate-500">MRP {formatCurrency(r.mrp)}</p>
                    <Link
                      href={`/dashboard/billing?customerId=${c.id}&items=${r.medicineId}:${r.typicalQuantity}`}
                      className="inline-flex items-center gap-1 mt-1 text-xs text-brand-600 hover:underline"
                    >
                      <ShoppingCart className="w-3 h-3" /> Reorder {r.typicalQuantity}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
          {overdueOrDue.length > 0 && (
            <div className="border-t bg-brand-50 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-brand-900">
                <strong>{overdueOrDue.length}</strong> medicine(s) likely needed
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/billing?customerId=${c.id}&items=${overdueOrDue.map((r) => `${r.medicineId}:${r.typicalQuantity}`).join(',')}`}
                  className="btn-primary"
                >
                  <ShoppingCart className="w-4 h-4" /> Build refill order
                </Link>
                <a
                  href={`https://wa.me/${(c.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Hi ${c.name},\nIt's been a while since you last bought:\n` +
                    overdueOrDue.slice(0, 5).map((r) => `• ${r.medicineName} (${r.daysSinceLast}d ago)`).join('\n') +
                    `\nLet us know if you need a refill.\n— ${authService.getStoredUser()?.tenant.name ?? ''}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  WhatsApp prompt
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Purchase History</h3>
            <span className="text-xs text-slate-500">{orders.length} orders</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No purchases yet</div>
            ) : (
              orders.map((o: any) => (
                <Link href={`/dashboard/orders/${o.id}`} key={o.id} className="block p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{o.orderNumber}</p>
                      <p className="text-xs text-slate-500">{formatDate(o.createdAt)} • {o.items?.length ?? 0} items</p>
                    </div>
                    <span className="font-semibold text-slate-900">{formatCurrency(o.total)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Ledger</h3>
            <CreditCard className="w-4 h-4 text-slate-400" />
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
        <EditCustomerModal
          customer={c}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            queryClient.invalidateQueries({ queryKey: ['customer', id] })
            queryClient.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete customer?"
          message={`"${c.name}" will be hidden from the list. Existing orders and invoices stay intact. You can't undo this from the UI.`}
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          danger
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerForm>({
    defaultValues: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      pincode: customer.pincode ?? '',
      gstin: customer.gstin ?? '',
      creditLimit: customer.creditLimit ?? 0,
    },
  })
  const mutation = useMutation({
    mutationFn: (data: CustomerForm) => api.put(`/customers/${customer.id}`, {
      ...data,
      creditLimit: Number(data.creditLimit),
    }),
    onSuccess: () => { toast.success('Customer updated'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">Edit Customer</h2>
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
              <label className="label">City</label>
              <input className="input" {...register('city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" {...register('state')} />
            </div>
          </div>
          <div>
            <label className="label">GSTIN (optional)</label>
            <input className="input font-mono text-xs" placeholder="27AAACR5055K1ZV" {...register('gstin')} />
          </div>
          <div>
            <label className="label">Credit Limit (₹)</label>
            <input className="input" type="number" {...register('creditLimit', optionalNumber)} />
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
