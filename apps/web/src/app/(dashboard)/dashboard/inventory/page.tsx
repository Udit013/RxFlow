'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Package, AlertTriangle, Clock, Search, Plus, RefreshCw, X, Download, MapPin } from 'lucide-react'
import Papa from 'papaparse'
import { AnimatedSection, PageHeader, SectionCard, EmptyState, SkeletonRow } from '@/components/ui'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, getDaysUntilExpiry, getExpiryStatus, getStockStatus, cn, optionalNumber, moneySymbol } from '@/lib/utils'

interface InventoryItem {
  id: string
  medicineId: string
  totalQuantity: number
  availableQuantity: number
  reorderLevel: number
  sellingPrice: number
  rackNumber?: string | null
  shelfNumber?: string | null
  medicine: { id: string; name: string; genericName: string; dosageForm: string; strength: string; packSize: string; schedule: string }
  batches: Array<{ id: string; batchNumber: string; expiryDate: string; quantity: number; mrp: number }>
  isLowStock: boolean
  hasExpiredBatches: boolean
  hasExpiringSoonBatches: boolean
}

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'expiring' | 'expired'>('all')
  const [showAddStock, setShowAddStock] = useState(false)
  const [manageItem, setManageItem] = useState<any | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', search, filter],
    queryFn: () =>
      api.get('/inventory', {
        params: {
          search: search || undefined,
          lowStock: filter === 'low' ? 'true' : undefined,
          expiringSoon: filter === 'expiring' ? 'true' : undefined,
          expired: filter === 'expired' ? 'true' : undefined,
          limit: 50,
        },
      }).then((r) => r.data),
  })

  const { data: insightsData } = useQuery({
    queryKey: ['inventory-insights'],
    queryFn: () => api.get('/inventory/insights', { params: { days: 30 } }).then((r) => r.data),
  })

  const [exporting, setExporting] = useState(false)
  async function exportInventoryCsv() {
    setExporting(true)
    try {
      // Pull everything, one API page at a time (the API caps `limit` at 100)
      const all: any[] = []
      let page = 1
      for (;;) {
        const res = await api.get('/inventory', { params: { limit: 100, page } })
        const rows = res.data?.data ?? []
        all.push(...rows)
        const meta = res.data?.meta
        if (!meta || page >= (meta.totalPages ?? 1)) break
        page++
        if (page > 50) break // safety: at most 5,000 rows
      }

      // Flatten: one row per batch (most useful for reconciliation)
      const flat: any[] = []
      for (const inv of all) {
        if (!inv.batches || inv.batches.length === 0) {
          flat.push({
            medicine: inv.medicine?.name ?? '',
            generic: inv.medicine?.genericName ?? '',
            strength: inv.medicine?.strength ?? '',
            dosageForm: inv.medicine?.dosageForm ?? '',
            manufacturer: inv.medicine?.manufacturerName ?? '',
            hsn: inv.medicine?.hsn ?? '',
            schedule: inv.medicine?.schedule ?? '',
            batchNumber: '',
            expiryDate: '',
            quantity: inv.availableQuantity ?? 0,
            purchasePrice: '',
            mrp: inv.medicine?.mrp ?? '',
            sellingPrice: inv.sellingPrice ?? '',
            reorderLevel: inv.reorderLevel ?? '',
          })
        } else {
          for (const b of inv.batches) {
            flat.push({
              medicine: inv.medicine?.name ?? '',
              generic: inv.medicine?.genericName ?? '',
              strength: inv.medicine?.strength ?? '',
              dosageForm: inv.medicine?.dosageForm ?? '',
              manufacturer: inv.medicine?.manufacturerName ?? '',
              hsn: inv.medicine?.hsn ?? '',
              schedule: inv.medicine?.schedule ?? '',
              batchNumber: b.batchNumber ?? '',
              expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().slice(0, 10) : '',
              quantity: b.quantity ?? 0,
              purchasePrice: b.purchasePrice ?? '',
              mrp: b.mrp ?? '',
              sellingPrice: inv.sellingPrice ?? '',
              reorderLevel: inv.reorderLevel ?? '',
            })
          }
        }
      }

      const csv = Papa.unparse(flat)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      toast.success(`Exported ${flat.length} row(s) from ${all.length} SKU(s)`)
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const items: InventoryItem[] = data?.data ?? []

  const filterTabs = [
    { key: 'all', label: 'All Stock' },
    { key: 'low', label: 'Low Stock', icon: AlertTriangle, color: 'text-amber-500' },
    { key: 'expiring', label: 'Expiring Soon', icon: Clock, color: 'text-orange-500' },
    { key: 'expired', label: 'Expired', icon: Package, color: 'text-red-500' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Package}
          eyebrow="Operations"
          title="Inventory"
          description={`${data?.meta?.total ?? 0} items tracked across all batches`}
          actions={
            <>
              <button className="btn-ghost" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button className="btn-secondary" onClick={exportInventoryCsv} disabled={exporting}>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              <button className="btn-primary" onClick={() => setShowAddStock(true)}>
                <Plus className="w-4 h-4" />
                Add Stock
              </button>
            </>
          }
        />
      </AnimatedSection>

      {insightsData?.data && (
        <AnimatedSection className="max-md:order-last">
          <InsightsPanel data={insightsData.data} />
        </AnimatedSection>
      )}

      <AnimatedSection>
        {/* Filter tabs + search inline */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="segmented self-start">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={filter === tab.key}
                onClick={() => setFilter(tab.key as typeof filter)}
                className="segment"
              >
                {tab.icon && <tab.icon className={cn(filter !== tab.key && tab.color)} />}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="search-field flex-1">
            <Search />
            <input
              type="search"
              aria-label="Search inventory"
              className="input pr-8"
              placeholder="Search by medicine name, generic, manufacturer, barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1.5 p-1 rounded text-surface-400 hover:text-surface-700"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection>
        <SectionCard flush className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Medicine</th>
              <th className="text-center px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Available</th>
              <th className="text-center px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Batches</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Nearest Expiry</th>
              <th className="text-right px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Selling Price</th>
              <th className="text-center px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {isLoading ? (
              <SkeletonRow columns={7} rows={6} widths={['60%', '40%', '30%', '50%', '40%', '50%', '20%']} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={Package}
                    title="No inventory items"
                    description={search ? `Nothing matches "${search}". Try a different term.` : 'Add stock to start tracking inventory.'}
                    action={!search && (
                      <button onClick={() => setShowAddStock(true)} className="btn-primary">
                        <Plus className="w-4 h-4" /> Add Stock
                      </button>
                    )}
                  />
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const stockStatus = getStockStatus(item.availableQuantity, item.reorderLevel)
                const nearestBatch = item.batches[0]
                const expiryStatus = nearestBatch ? getExpiryStatus(nearestBatch.expiryDate) : null
                const daysLeft = nearestBatch ? getDaysUntilExpiry(nearestBatch.expiryDate) : null

                return (
                  <tr key={item.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{item.medicine.name}</p>
                          {(item.rackNumber || item.shelfNumber) && (
                            <span className="chip text-[10px] py-0!" title="Shelf location">
                              <MapPin className="w-3 h-3" /> {[item.rackNumber, item.shelfNumber].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{item.medicine.genericName} • {item.medicine.strength} • {item.medicine.dosageForm}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'font-semibold',
                        stockStatus === 'negative' ? 'text-red-700' :
                        stockStatus === 'out' ? 'text-red-600' :
                        stockStatus === 'low' ? 'text-amber-600' : 'text-slate-900'
                      )}>
                        {item.availableQuantity}
                      </span>
                      <span className="text-slate-400 text-xs"> / {item.totalQuantity}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {item.batches.length}
                    </td>
                    <td className="px-4 py-3">
                      {nearestBatch ? (
                        <div>
                          <p className="text-slate-700">{formatDate(nearestBatch.expiryDate)}</p>
                          <p className={cn(
                            'text-xs',
                            expiryStatus === 'expired' ? 'text-red-500' :
                            expiryStatus === 'critical' ? 'text-orange-500' :
                            expiryStatus === 'warning' ? 'text-amber-500' : 'text-slate-400'
                          )}>
                            {daysLeft !== null && daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` :
                             daysLeft !== null ? `${daysLeft}d left` : ''}
                          </p>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(item.sellingPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        stockStatus === 'negative' ? 'badge-danger' :
                        stockStatus === 'out' ? 'badge-danger' :
                        stockStatus === 'low' ? 'badge-warning' : 'text-xs text-surface-500'
                      )}>
                        {stockStatus === 'negative' ? 'Negative' :
                         stockStatus === 'out' ? 'Out of Stock' :
                         stockStatus === 'low' ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setManageItem(item)} className="text-xs font-medium text-surface-600 hover:text-surface-950 px-1.5 py-1 -my-1 rounded-md hover:bg-surface-100">Manage</button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>
        </SectionCard>
      </AnimatedSection>

      {showAddStock && (
        <AddStockModal
          onClose={() => setShowAddStock(false)}
          onSaved={() => {
            setShowAddStock(false)
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
          }}
        />
      )}

      {manageItem && (
        <ManageItemModal
          item={manageItem}
          onClose={() => setManageItem(null)}
          onSaved={() => {
            setManageItem(null)
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
          }}
        />
      )}
    </div>
  )
}

interface ManageForm { sellingPrice: number; reorderLevel: number; rackNumber?: string; shelfNumber?: string }

function ManageItemModal({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit } = useForm<ManageForm>({
    defaultValues: {
      sellingPrice: item.sellingPrice,
      reorderLevel: item.reorderLevel,
      rackNumber: item.rackNumber ?? '',
      shelfNumber: item.shelfNumber ?? '',
    },
  })
  const mutation = useMutation({
    mutationFn: (d: ManageForm) => api.patch(`/inventory/${item.id}`, {
      sellingPrice: Number(d.sellingPrice),
      reorderLevel: Number(d.reorderLevel),
      rackNumber: d.rackNumber || '',
      shelfNumber: d.shelfNumber || '',
    }),
    onSuccess: () => { toast.success('Updated'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-md">
        <div className="modal-header">
          <div>
            <h2 className="font-semibold text-surface-900">Manage Item</h2>
            <p className="text-xs text-surface-500">{item.medicine?.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-close"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Selling Price ({moneySymbol()})</label><input type="number" step="0.01" className="input" {...register('sellingPrice', optionalNumber)} /></div>
            <div><label className="label">Reorder Level</label><input type="number" className="input" {...register('reorderLevel', optionalNumber)} /></div>
          </div>
          <div className="pt-2 border-t border-surface-100">
            <p className="section-heading mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Shelf Location</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Rack</label><input className="input" {...register('rackNumber')} placeholder="R-12" /></div>
              <div><label className="label">Shelf</label><input className="input" {...register('shelfNumber')} placeholder="S-3" /></div>
            </div>
            <p className="help-text">Shown on the inventory list and at the POS so staff can find stock fast.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface AddStockForm {
  medicineId: string
  batchNumber: string
  expiryDate: string
  quantity: number
  purchasePrice: number
  mrp: number
  sellingPrice?: number
  supplierId?: string
}

function AddStockModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [medicineQuery, setMedicineQuery] = useState('')
  const [selectedMedicine, setSelectedMedicine] = useState<any | null>(null)
  const [supplierQuery, setSupplierQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null)

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<AddStockForm>()

  const medQuery = useQuery({
    queryKey: ['med-search', medicineQuery],
    queryFn: () => api.get('/medicines', { params: { search: medicineQuery, limit: 8 } }).then((r) => r.data),
    enabled: medicineQuery.length >= 2 && !selectedMedicine,
  })

  const supQuery = useQuery({
    queryKey: ['sup-search', supplierQuery],
    queryFn: () => api.get('/suppliers', { params: { search: supplierQuery, limit: 5 } }).then((r) => r.data),
    enabled: supplierQuery.length >= 2 && !selectedSupplier,
  })

  const mutation = useMutation({
    mutationFn: (data: AddStockForm) => {
      if (!selectedSupplier) throw new Error('__nosupplier__')
      return api.post('/inventory/batches', {
        ...data,
        quantity: Number(data.quantity),
        purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : undefined,
        mrp: Number(data.mrp),
        sellingPrice: data.sellingPrice ? Number(data.sellingPrice) : undefined,
        expiryDate: new Date(data.expiryDate).toISOString(),
        supplierId: selectedSupplier.id,
        isTemporary: true,
      })
    },
    onSuccess: () => {
      toast.success('Temporary stock added — convert it to a bill when the invoice arrives')
      onSaved()
    },
    onError: (e: any) => {
      if (e?.message === '__nosupplier__') { toast.error('Select a supplier — required for a temporary purchase'); return }
      toast.error(e.response?.data?.error ?? 'Failed to add stock')
    },
  })

  const pickMedicine = (m: any) => {
    setSelectedMedicine(m)
    setMedicineQuery(m.name)
    setValue('medicineId', m.id)
    setValue('mrp', m.mrp)
    setValue('sellingPrice', m.mrp)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="modal-header sticky top-0 z-10">
          <h2 className="font-semibold text-slate-900">Add Stock · Temporary Purchase</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-close"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-2.5 text-xs text-surface-700">
            Use this when <strong>goods have arrived but the invoice hasn&apos;t</strong>. Supplier is required; purchase price can be left blank.
            When the bill comes, open <strong>New Purchase</strong> for this supplier and convert it into a proper purchase.
          </div>
          {/* Medicine picker */}
          <div>
            <label className="label">Medicine *</label>
            {selectedMedicine ? (
              <div className="flex items-center justify-between p-2 bg-brand-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{selectedMedicine.name}</p>
                  <p className="text-xs text-slate-500">{selectedMedicine.strength} • {selectedMedicine.dosageForm}</p>
                </div>
                <button type="button" onClick={() => { setSelectedMedicine(null); setMedicineQuery('') }} className="text-xs text-slate-500 hover:text-red-600">Change</button>
              </div>
            ) : (
              <>
                <input className="input" placeholder="Search medicine..." value={medicineQuery} onChange={(e) => setMedicineQuery(e.target.value)} />
                {medQuery.data?.data?.length > 0 && (
                  <ul className="mt-1 border border-slate-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    {medQuery.data.data.map((m: any) => (
                      <li key={m.id} onClick={() => pickMedicine(m)} className="p-2 text-sm hover:bg-slate-50 cursor-pointer">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.strength} • {m.manufacturerName} • MRP {formatCurrency(m.mrp)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <input type="hidden" {...register('medicineId', { required: true })} />
            {errors.medicineId && <p className="text-xs text-red-600 mt-1">Pick a medicine</p>}
          </div>

          {/* Supplier picker (required for temporary purchase) */}
          <div>
            <label className="label">Supplier *</label>
            {selectedSupplier ? (
              <div className="flex items-center justify-between p-2 bg-brand-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{selectedSupplier.name}</p>
                  <p className="text-xs text-slate-500">{selectedSupplier.companyName}</p>
                </div>
                <button type="button" onClick={() => { setSelectedSupplier(null); setSupplierQuery('') }} className="text-xs text-slate-500 hover:text-red-600">Remove</button>
              </div>
            ) : (
              <>
                <input className="input" placeholder="Search supplier..." value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} />
                {supQuery.data?.data?.length > 0 && (
                  <ul className="mt-1 border border-slate-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    {supQuery.data.data.map((s: any) => (
                      <li key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierQuery(s.name) }} className="p-2 text-sm hover:bg-slate-50 cursor-pointer">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.companyName}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Batch # *</label>
              <input className="input" {...register('batchNumber', { required: true })} />
              {errors.batchNumber && <p className="text-xs text-red-600 mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Expiry Date *</label>
              <input type="date" className="input" {...register('expiryDate', { required: true })} />
              {errors.expiryDate && <p className="text-xs text-red-600 mt-1">Required</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Quantity *</label>
              <input type="number" className="input" {...register('quantity', { required: true, valueAsNumber: true, min: 1 })} />
            </div>
            <div>
              <label className="label">Purchase Price</label>
              <input type="number" step="0.01" className="input" placeholder="blank until invoice" {...register('purchasePrice', optionalNumber)} />
            </div>
            <div>
              <label className="label">MRP *</label>
              <input type="number" step="0.01" className="input" {...register('mrp', { required: true, valueAsNumber: true, min: 0.01 })} />
            </div>
          </div>

          <div>
            <label className="label">Selling Price (defaults to MRP)</label>
            <input type="number" step="0.01" className="input" {...register('sellingPrice', optionalNumber)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending || !selectedMedicine}>
              {mutation.isPending ? 'Saving...' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InsightsPanel({ data }: { data: any }) {
  const { topMovers, slowMovers, byManufacturer, writeOffs } = data
  const col = 'min-w-0 flex flex-col'
  const head = 'flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2'
  const title = 'text-[13px] font-semibold text-surface-900'
  const hint = 'text-xs text-surface-500'
  const row = 'px-4 py-2 flex items-center justify-between gap-3 text-[13px]'
  const empty = 'px-4 py-6 text-[13px] text-surface-400'
  return (
    <section aria-label="Inventory insights" className="card overflow-hidden grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 divide-surface-200 [&>*]:border-surface-200 md:[&>*:nth-child(odd)]:border-r md:[&>*:nth-child(-n+2)]:border-b xl:[&>*]:border-b-0 xl:[&>*:not(:last-child)]:border-r">
      <div className={col}>
        <div className={head}><h3 className={title}>Top movers</h3><span className={hint}>30 days</span></div>
        <div className="pb-2">
          {topMovers.length === 0 ? (
            <p className={empty}>No sales in the last 30 days</p>
          ) : (
            topMovers.slice(0, 6).map((m: any, i: number) => (
              <div key={m.medicineId} className={row}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-surface-400 w-3 tabular-nums">{i + 1}</span>
                  <span className="truncate">{m.medicineName}</span>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="font-medium">{m.unitsSold}u</p>
                  <p className="text-xs text-surface-500">{formatCurrency(m.revenue)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={col}>
        <div className={head}><h3 className={title}>Slow movers</h3><span className={hint}>Oldest stock</span></div>
        <div className="pb-2">
          {slowMovers.length === 0 ? (
            <p className={empty}>All stock is moving</p>
          ) : (
            slowMovers.slice(0, 6).map((m: any) => (
              <div key={m.medicineId} className={row}>
                <div className="min-w-0">
                  <p className="truncate">{m.medicineName}</p>
                  <p className="text-xs text-surface-500">{m.daysInStock}d in stock</p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="font-medium">{m.quantity}u</p>
                  <p className="text-xs text-surface-500">{formatCurrency(m.valueAtCost)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={col}>
        <div className={head}><h3 className={title}>Top manufacturers</h3><span className={hint}>By value</span></div>
        <div className="pb-2">
          {byManufacturer.length === 0 ? (
            <p className={empty}>No inventory</p>
          ) : (
            byManufacturer.slice(0, 6).map((m: any) => (
              <div key={m.manufacturer} className={row}>
                <div className="min-w-0">
                  <p className="truncate">{m.manufacturer}</p>
                  <p className="text-xs text-surface-500">{m.skus} SKUs · {m.quantity}u</p>
                </div>
                <p className="font-medium shrink-0 tabular-nums">{formatCurrency(m.valueAtCost)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={col}>
        <div className={head}><h3 className={title}>Write-offs</h3><span className={hint}>30 days</span></div>
        <div className="px-4 pb-3 grid grid-cols-2 gap-3 border-b border-surface-100">
          <div>
            <p className="text-xs text-surface-500">Units</p>
            <p className="font-display text-lg font-semibold tabular-nums">{writeOffs.totalUnits}</p>
          </div>
          <div>
            <p className="text-xs text-surface-500">Loss</p>
            <p className={cn('font-display text-lg font-semibold tabular-nums', writeOffs.totalLoss > 0 && 'text-danger-600')}>{formatCurrency(writeOffs.totalLoss)}</p>
          </div>
        </div>
        <div className="pb-2">
          {writeOffs.recent.length === 0 ? (
            <p className={empty}>No write-offs in 30 days</p>
          ) : (
            writeOffs.recent.slice(0, 5).map((w: any) => (
              <div key={w.batchId} className={row}>
                <div className="min-w-0">
                  <p className="font-medium truncate">{w.medicineName}</p>
                  <p className="text-xs text-surface-500">B {w.batchNumber} · {w.writeOffReason}</p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="font-medium">{w.writeOffQuantity}u</p>
                  <p className="text-xs text-danger-600">{formatCurrency(w.lossValue)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
