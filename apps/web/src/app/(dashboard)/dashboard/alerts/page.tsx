'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { AlertTriangle, Clock, Package, Bell, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate, getDaysUntilExpiry } from '@/lib/utils'
import { AnimatedSection, PageHeader, MetricCard } from '@/components/ui'

export default function AlertsPage() {
  const queryClient = useQueryClient()
  const [writeOffBatch, setWriteOffBatch] = useState<any | null>(null)

  const { data: lowStock } = useQuery({
    queryKey: ['alerts-low-stock'],
    queryFn: () => api.get('/inventory/alerts/low-stock').then((r) => r.data),
  })

  const { data: expiry } = useQuery({
    queryKey: ['alerts-expiry'],
    queryFn: () => api.get('/inventory/alerts/expiry').then((r) => r.data),
  })

  const lowStockItems = lowStock?.data ?? []
  const expiryItems = expiry?.data ?? []

  const expiringCount = expiryItems.filter((i: any) => getDaysUntilExpiry(i.expiryDate) >= 0).length
  const expiredCount = expiryItems.filter((i: any) => getDaysUntilExpiry(i.expiryDate) < 0).length

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Bell}
          eyebrow="Operations"
          title="Alerts"
          description="Stock and expiry issues that need your attention"
        />
      </AnimatedSection>

      <AnimatedSection stagger=".alert-stat">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="alert-stat"><MetricCard icon={AlertTriangle} tone="warning" label="Low Stock" countUp={lowStockItems.length} value={String(lowStockItems.length)} sub="Below reorder level" /></div>
          <div className="alert-stat"><MetricCard icon={Clock} tone="warning" label="Expiring Soon" countUp={expiringCount} value={String(expiringCount)} sub="Within 90 days" /></div>
          <div className="alert-stat"><MetricCard icon={Package} tone="danger" label="Expired" countUp={expiredCount} value={String(expiredCount)} sub="Needs write-off" /></div>
        </div>
      </AnimatedSection>

      <AnimatedSection>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-500" /> Low Stock
            </h3>
            <Link href="/dashboard/inventory" className="text-xs text-brand-600 hover:underline">View inventory →</Link>
          </div>
          <div className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
            {lowStockItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">All stock levels healthy</div>
            ) : (
              lowStockItems.map((item: any) => (
                <div key={item.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{item.medicine.name}</p>
                    <p className="text-xs text-slate-500">{item.medicine.strength} • Reorder at {item.reorderLevel}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('font-semibold', item.availableQuantity <= 0 ? 'text-red-600' : 'text-amber-600')}>
                      {item.availableQuantity} left
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" /> Expiring / Expired
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
            {expiryItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No expiry concerns</div>
            ) : (
              expiryItems.map((batch: any) => {
                const days = getDaysUntilExpiry(batch.expiryDate)
                const isExpired = days < 0
                return (
                  <div key={batch.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{batch.medicine?.name ?? batch.inventoryItem?.medicine?.name}</p>
                      <p className="text-xs text-slate-500">
                        Batch {batch.batchNumber} • {batch.quantity} units • {formatCurrency(batch.mrp)} MRP
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-500">{formatDate(batch.expiryDate)}</p>
                      <p className={cn('font-semibold text-sm', isExpired ? 'text-red-600' : days <= 30 ? 'text-orange-600' : 'text-amber-600')}>
                        {isExpired ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                      </p>
                      {batch.quantity > 0 && (
                        <button
                          onClick={() => setWriteOffBatch(batch)}
                          className="mt-1 text-xs inline-flex items-center gap-1 text-red-600 hover:underline"
                        >
                          <Trash2 className="w-3 h-3" /> Write off
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      </AnimatedSection>

      {writeOffBatch && (
        <WriteOffModal
          batch={writeOffBatch}
          onClose={() => setWriteOffBatch(null)}
          onDone={() => {
            setWriteOffBatch(null)
            queryClient.invalidateQueries({ queryKey: ['alerts-expiry'] })
            queryClient.invalidateQueries({ queryKey: ['alerts-low-stock'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-insights'] })
          }}
        />
      )}
    </div>
  )
}

interface WriteOffForm { quantity: number; reason: string }

function WriteOffModal({ batch, onClose, onDone }: { batch: any; onClose: () => void; onDone: () => void }) {
  const medName = batch.medicine?.name ?? batch.inventoryItem?.medicine?.name ?? 'Medicine'
  const maxQty = batch.quantity
  const days = getDaysUntilExpiry(batch.expiryDate)
  const isExpired = days < 0

  const { register, handleSubmit, watch, formState: { errors } } = useForm<WriteOffForm>({
    defaultValues: { quantity: maxQty, reason: isExpired ? 'Expired' : 'Damaged' },
  })

  const qty = Number(watch('quantity')) || 0
  const lossValue = qty * (batch.purchasePrice ?? batch.mrp ?? 0)

  const mutation = useMutation({
    mutationFn: (data: WriteOffForm) => api.post(`/inventory/batches/${batch.id}/write-off`, {
      quantity: Number(data.quantity),
      reason: data.reason,
    }),
    onSuccess: (res) => {
      toast.success(`Wrote off ${res.data.data.writtenOff} units · loss ${formatCurrency(res.data.data.lossValue)}`)
      onDone()
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Write off batch</h2>
            <p className="text-xs text-slate-500 mt-0.5">{medName} · Batch {batch.batchNumber}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Expiry</span>
              <span className={isExpired ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>
                {formatDate(batch.expiryDate)} {isExpired ? `(expired ${Math.abs(days)}d ago)` : `(${days}d left)`}
              </span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">In stock</span>
              <span className="font-semibold">{maxQty} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Purchase price</span>
              <span className="font-semibold">{formatCurrency(batch.purchasePrice ?? batch.mrp ?? 0)}/unit</span>
            </div>
          </div>

          <div>
            <label className="label">Quantity to write off *</label>
            <input
              type="number"
              min="1"
              max={maxQty}
              className="input"
              {...register('quantity', { required: true, valueAsNumber: true, min: 1, max: maxQty })}
            />
            {errors.quantity && <p className="text-xs text-red-600 mt-1">Must be 1 to {maxQty}</p>}
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" {...register('reason', { required: true })}>
              <option value="Expired">Expired</option>
              <option value="Damaged">Damaged</option>
              <option value="Lost">Lost</option>
              <option value="Recalled">Manufacturer recall</option>
              <option value="Quality issue">Quality issue</option>
            </select>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm flex justify-between">
            <span className="text-slate-700">Estimated loss</span>
            <span className="font-bold text-red-700">{formatCurrency(lossValue)}</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-danger">
              <Trash2 className="w-4 h-4" /> {mutation.isPending ? 'Writing off...' : 'Write off'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
