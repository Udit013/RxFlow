'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Store, Plus, Pencil, X, Trash2, MapPin, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatDate } from '@/lib/utils'

interface StoreRow {
  id: string
  name: string
  code: string
  addressLine1?: string
  city?: string
  state?: string
  pincode?: string
  phone?: string
  gstin?: string
  drugLicenseNumber?: string
  isActive: boolean
  createdAt: string
}

interface StoreForm {
  name: string
  code: string
  addressLine1?: string
  city?: string
  state?: string
  pincode?: string
  phone?: string
  gstin?: string
  drugLicenseNumber?: string
}

export default function StoresPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState<'new' | { id: string } | null>(null)
  const [user] = useState(() => authService.getStoredUser())

  const { data } = useQuery({
    queryKey: ['tenant-stores'],
    queryFn: () => api.get('/tenant/stores').then((r) => r.data),
  })
  const stores: StoreRow[] = data?.data ?? []
  const myStoreIds = new Set(user?.stores?.map((s) => s.id) ?? [])
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN'

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/tenant/stores/${id}`),
    onSuccess: () => {
      toast.success('Store disabled')
      queryClient.invalidateQueries({ queryKey: ['tenant-stores'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Store className="w-5 h-5" /> Stores</h1>
          <p className="text-sm text-slate-500">Manage your pharmacy branches and outlets</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal('new')} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Store
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stores.length === 0 ? (
          <div className="col-span-2 card p-12 text-center text-slate-400">
            <Store className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No stores yet
          </div>
        ) : (
          stores.map((s) => (
            <div key={s.id} className={cn('card p-5', !s.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{s.name}</h3>
                    {myStoreIds.has(s.id) && <span className="badge-info text-[10px]">Your store</span>}
                    {!s.isActive && <span className="badge-neutral text-[10px]">Disabled</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">{s.code}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowModal({ id: s.id })} className="text-slate-400 hover:text-brand-600 p-1">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {s.isActive && (
                      <button
                        onClick={() => window.confirm(`Disable "${s.name}"? Existing data is preserved.`) && deleteMut.mutate(s.id)}
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                {(s.addressLine1 || s.city) && (
                  <p className="flex items-start gap-1.5"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    {[s.addressLine1, s.city, s.state, s.pincode].filter(Boolean).join(', ')}
                  </p>
                )}
                {s.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{s.phone}</p>}
                {s.gstin && <p className="font-mono">GSTIN: {s.gstin}</p>}
                {s.drugLicenseNumber && <p className="font-mono">DL: {s.drugLicenseNumber}</p>}
                <p className="text-[10px] text-slate-400 pt-1">Created {formatDate(s.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {!isAdmin && (
        <div className="card p-4 bg-slate-50 text-sm text-slate-600 border-dashed">
          Only administrators can add or modify stores. Ask your tenant admin if you need a new branch.
        </div>
      )}

      {showModal && (
        <StoreModal
          existing={typeof showModal === 'object' ? stores.find((s) => s.id === showModal.id) : undefined}
          onClose={() => setShowModal(null)}
          onSaved={() => {
            setShowModal(null)
            queryClient.invalidateQueries({ queryKey: ['tenant-stores'] })
          }}
        />
      )}
    </div>
  )
}

function StoreModal({ existing, onClose, onSaved }: { existing?: StoreRow; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existing
  const { register, handleSubmit, formState: { errors } } = useForm<StoreForm>({
    defaultValues: existing ? {
      name: existing.name,
      code: existing.code,
      addressLine1: existing.addressLine1 ?? '',
      city: existing.city ?? '',
      state: existing.state ?? '',
      pincode: existing.pincode ?? '',
      phone: existing.phone ?? '',
      gstin: existing.gstin ?? '',
      drugLicenseNumber: existing.drugLicenseNumber ?? '',
    } : { code: '' },
  })

  const mutation = useMutation({
    mutationFn: (d: StoreForm) => isEdit
      ? api.patch(`/tenant/stores/${existing!.id}`, d)
      : api.post('/tenant/stores', d),
    onSuccess: () => { toast.success(isEdit ? 'Store updated' : 'Store created'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">{isEdit ? 'Edit Store' : 'Add Store'}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Store Name *</label>
              <input className="input" {...register('name', { required: true })} placeholder="Andheri Branch" />
              {errors.name && <p className="text-xs text-red-600 mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Code *</label>
              <input
                className="input font-mono"
                disabled={isEdit}
                {...register('code', { required: !isEdit, pattern: /^[A-Z0-9-]+$/ })}
                placeholder="AND-01"
              />
              {errors.code && <p className="text-xs text-red-600 mt-1">A-Z, 0-9, hyphens only</p>}
            </div>
          </div>
          <div>
            <label className="label">Address *</label>
            <input className="input" {...register('addressLine1', { required: true })} />
            {errors.addressLine1 && <p className="text-xs text-red-600 mt-1">Required</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">City *</label>
              <input className="input" {...register('city', { required: true })} />
            </div>
            <div>
              <label className="label">State *</label>
              <input className="input" {...register('state', { required: true })} placeholder="Maharashtra" />
            </div>
            <div>
              <label className="label">Pincode *</label>
              <input className="input" {...register('pincode', { required: true, minLength: 4 })} />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" {...register('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">GSTIN (if different from tenant)</label>
              <input className="input font-mono text-xs" {...register('gstin')} />
            </div>
            <div>
              <label className="label">Drug License #</label>
              <input className="input font-mono text-xs" {...register('drugLicenseNumber')} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Create store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
