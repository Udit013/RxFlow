'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Pill, Tags, Boxes, IndianRupee, Percent, Warehouse, ScanBarcode, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const DOSAGE_FORMS = ['TABLET','CAPSULE','SYRUP','INJECTION','CREAM','OINTMENT','DROPS','INHALER','PATCH','SUPPOSITORY','POWDER','SUSPENSION','GEL','LOTION','SPRAY','OTHER']
const SCHEDULES = ['OTC','SCHEDULE_H','SCHEDULE_H1','SCHEDULE_X','SCHEDULE_G']
const STATUSES = ['CONTINUE','DISCONTINUE','INACTIVE']
const TYPES = ['NORMAL','CONTROLLED','OTC','PRESCRIPTION']
const TAX_TYPES = ['TAXABLE','EXEMPT','NIL_RATED','ZERO_RATED']

const TABS = [
  { id: 'general', label: 'General', icon: Pill },
  { id: 'classification', label: 'Classification', icon: Tags },
  { id: 'units', label: 'Units & Packing', icon: Boxes },
  { id: 'pricing', label: 'Pricing', icon: IndianRupee },
  { id: 'tax', label: 'Tax', icon: Percent },
  { id: 'inventory', label: 'Inventory', icon: Warehouse },
  { id: 'codes', label: 'Search & Codes', icon: ScanBarcode },
] as const

type TabId = typeof TABS[number]['id']

// Form state — strings for inputs; numbers parsed on submit.
type FormState = Record<string, any>

function emptyForm(): FormState {
  return {
    name: '', shortName: '', genericName: '', brandName: '', manufacturerName: '', category: '',
    status: 'CONTINUE', medicineType: 'NORMAL',
    dosageForm: 'TABLET', strength: '', schedule: 'OTC', requiresPrescription: false, hsn: '30049099',
    composition: '', description: '',
    packSize: '', packing: '', packUnit: 'tablets', primaryUnit: 'PCS', secondaryUnit: '', conversionFactor: 1, boxQuantity: '', decimalAllowed: false,
    mrp: '', rateA: '', rateB: '', rateC: '', defaultPurchasePrice: '', defaultCostPrice: '', marginPercent: '',
    gstRate: 12, taxType: 'TAXABLE', cess: 0,
    defaultReorderLevel: 10, minStock: '', maxStock: '', negativeAllowed: false, isHidden: false,
    fastSearchName: '', aliases: '', barcodes: '', searchTokens: '',
  }
}

function fromMedicine(m: any): FormState {
  const f = emptyForm()
  for (const k of Object.keys(f)) {
    if (m[k] !== undefined && m[k] !== null) f[k] = m[k]
  }
  f.aliases = (m.aliases ?? []).join(', ')
  f.barcodes = (m.barcodes ?? []).join(', ')
  f.searchTokens = (m.searchTokens ?? []).join(', ')
  return f
}

const numOrUndef = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v))
const splitList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)

export function MedicineMasterModal({ medicine, onClose }: { medicine?: any; onClose: () => void }) {
  const isEdit = !!medicine?.id
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabId>('general')
  const [form, setForm] = useState<FormState>(() => (isEdit ? fromMedicine(medicine) : emptyForm()))

  const set = (patch: Partial<FormState>) => setForm((p) => ({ ...p, ...patch }))

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        ...form,
        mrp: Number(form.mrp) || 0,
        gstRate: Number(form.gstRate) || 0,
        cess: Number(form.cess) || 0,
        conversionFactor: Number(form.conversionFactor) || 1,
        defaultReorderLevel: Number(form.defaultReorderLevel) || 0,
        boxQuantity: numOrUndef(form.boxQuantity),
        minStock: numOrUndef(form.minStock),
        maxStock: numOrUndef(form.maxStock),
        rateA: numOrUndef(form.rateA), rateB: numOrUndef(form.rateB), rateC: numOrUndef(form.rateC),
        defaultPurchasePrice: numOrUndef(form.defaultPurchasePrice),
        defaultCostPrice: numOrUndef(form.defaultCostPrice),
        marginPercent: numOrUndef(form.marginPercent),
        aliases: splitList(form.aliases),
        barcodes: splitList(form.barcodes),
        searchTokens: splitList(form.searchTokens),
        category: form.category || undefined,
        secondaryUnit: form.secondaryUnit || undefined,
      }
      return isEdit ? api.put(`/medicines/${medicine.id}`, payload) : api.post('/medicines', payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Medicine updated' : 'Medicine created')
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
      onClose()
    },
    onError: (e: any) => {
      const err = e.response?.data
      const msg = err?.details?.[0] ? `${err.details[0].field}: ${err.details[0].message}` : err?.error
      toast.error(msg ?? 'Failed to save medicine')
    },
  })

  function handleSubmit() {
    if (!form.name || !form.genericName || !form.brandName || !form.manufacturerName || !form.strength || !form.packSize || !form.hsn || !form.mrp) {
      toast.error('Fill the required fields in General & Classification (marked *)')
      if (!form.name || !form.genericName || !form.brandName || !form.manufacturerName) setTab('general')
      else setTab('classification')
      return
    }
    save.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
          <div>
            <h2 className="font-semibold text-surface-900">{isEdit ? 'Edit Medicine' : 'New Medicine'}</h2>
            <p className="text-2xs text-surface-500">{isEdit ? medicine.name : 'Add a product to the master catalog'}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 border-b border-surface-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-lg whitespace-nowrap border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-surface-500 hover:text-surface-800'
              )}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'general' && (
            <Grid>
              <Field label="Product Name" required><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
              <Field label="Short Name"><input className="input" value={form.shortName} onChange={(e) => set({ shortName: e.target.value })} /></Field>
              <Field label="Generic Name" required><input className="input" value={form.genericName} onChange={(e) => set({ genericName: e.target.value })} /></Field>
              <Field label="Brand Name" required><input className="input" value={form.brandName} onChange={(e) => set({ brandName: e.target.value })} /></Field>
              <Field label="Manufacturer" required><input className="input" value={form.manufacturerName} onChange={(e) => set({ manufacturerName: e.target.value })} /></Field>
              <Field label="Category"><input className="input" value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="Antibiotic, Analgesic…" /></Field>
              <Field label="Status"><Select value={form.status} onChange={(v) => set({ status: v })} options={STATUSES} /></Field>
              <Field label="Type"><Select value={form.medicineType} onChange={(v) => set({ medicineType: v })} options={TYPES} /></Field>
            </Grid>
          )}

          {tab === 'classification' && (
            <Grid>
              <Field label="Dosage Form"><Select value={form.dosageForm} onChange={(v) => set({ dosageForm: v })} options={DOSAGE_FORMS} /></Field>
              <Field label="Strength" required><input className="input" value={form.strength} onChange={(e) => set({ strength: e.target.value })} placeholder="500mg" /></Field>
              <Field label="Schedule"><Select value={form.schedule} onChange={(v) => set({ schedule: v })} options={SCHEDULES} /></Field>
              <Field label="HSN Code" required><input className="input font-mono" value={form.hsn} onChange={(e) => set({ hsn: e.target.value })} /></Field>
              <Field label="Composition" full><input className="input" value={form.composition} onChange={(e) => set({ composition: e.target.value })} placeholder="Paracetamol 500mg + Caffeine 30mg" /></Field>
              <Field label="Description" full><textarea className="input min-h-[64px]" value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              <Toggle label="Requires prescription" checked={form.requiresPrescription} onChange={(v) => set({ requiresPrescription: v })} />
            </Grid>
          )}

          {tab === 'units' && (
            <Grid>
              <Field label="Pack Size" required><input className="input" value={form.packSize} onChange={(e) => set({ packSize: e.target.value })} placeholder="10x10" /></Field>
              <Field label="Packing"><input className="input" value={form.packing} onChange={(e) => set({ packing: e.target.value })} placeholder="Strip / Box / Bottle" /></Field>
              <Field label="Primary Unit"><input className="input" value={form.primaryUnit} onChange={(e) => set({ primaryUnit: e.target.value })} placeholder="PCS" /></Field>
              <Field label="Secondary Unit"><input className="input" value={form.secondaryUnit} onChange={(e) => set({ secondaryUnit: e.target.value })} placeholder="BOX" /></Field>
              <Field label="Conversion Factor"><input type="number" step="0.01" className="input" value={form.conversionFactor} onChange={(e) => set({ conversionFactor: e.target.value })} /></Field>
              <Field label="Box Quantity"><input type="number" className="input" value={form.boxQuantity} onChange={(e) => set({ boxQuantity: e.target.value })} /></Field>
              <Toggle label="Allow decimal quantity" checked={form.decimalAllowed} onChange={(v) => set({ decimalAllowed: v })} />
            </Grid>
          )}

          {tab === 'pricing' && (
            <Grid>
              <Field label="MRP" required><input type="number" step="0.01" className="input" value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} /></Field>
              <Field label="Default Purchase Price"><input type="number" step="0.01" className="input" value={form.defaultPurchasePrice} onChange={(e) => set({ defaultPurchasePrice: e.target.value })} /></Field>
              <Field label="Default Cost Price"><input type="number" step="0.01" className="input" value={form.defaultCostPrice} onChange={(e) => set({ defaultCostPrice: e.target.value })} /></Field>
              <Field label="Margin %"><input type="number" step="0.01" className="input" value={form.marginPercent} onChange={(e) => set({ marginPercent: e.target.value })} /></Field>
              <Field label="Rate A (Retail)"><input type="number" step="0.01" className="input" value={form.rateA} onChange={(e) => set({ rateA: e.target.value })} /></Field>
              <Field label="Rate B (Wholesale)"><input type="number" step="0.01" className="input" value={form.rateB} onChange={(e) => set({ rateB: e.target.value })} /></Field>
              <Field label="Rate C (Special)"><input type="number" step="0.01" className="input" value={form.rateC} onChange={(e) => set({ rateC: e.target.value })} /></Field>
            </Grid>
          )}

          {tab === 'tax' && (
            <Grid>
              <Field label="GST Rate %"><input type="number" step="0.01" className="input" value={form.gstRate} onChange={(e) => set({ gstRate: e.target.value })} /></Field>
              <Field label="Tax Type"><Select value={form.taxType} onChange={(v) => set({ taxType: v })} options={TAX_TYPES} /></Field>
              <Field label="Cess %"><input type="number" step="0.01" className="input" value={form.cess} onChange={(e) => set({ cess: e.target.value })} /></Field>
            </Grid>
          )}

          {tab === 'inventory' && (
            <Grid>
              <Field label="Default Reorder Level"><input type="number" className="input" value={form.defaultReorderLevel} onChange={(e) => set({ defaultReorderLevel: e.target.value })} /></Field>
              <Field label="Minimum Stock"><input type="number" className="input" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} /></Field>
              <Field label="Maximum Stock"><input type="number" className="input" value={form.maxStock} onChange={(e) => set({ maxStock: e.target.value })} /></Field>
              <Toggle label="Allow negative stock" checked={form.negativeAllowed} onChange={(v) => set({ negativeAllowed: v })} />
              <Toggle label="Hide from lists / POS" checked={form.isHidden} onChange={(v) => set({ isHidden: v })} />
            </Grid>
          )}

          {tab === 'codes' && (
            <Grid>
              <Field label="Fast Search Name"><input className="input" value={form.fastSearchName} onChange={(e) => set({ fastSearchName: e.target.value })} placeholder="Shortcut typed at POS" /></Field>
              <Field label="Barcodes" full><input className="input font-mono" value={form.barcodes} onChange={(e) => set({ barcodes: e.target.value })} placeholder="comma-separated" /></Field>
              <Field label="Aliases" full><input className="input" value={form.aliases} onChange={(e) => set({ aliases: e.target.value })} placeholder="comma-separated alternate names" /></Field>
              <Field label="Search Tokens" full><input className="input" value={form.searchTokens} onChange={(e) => set({ searchTokens: e.target.value })} placeholder="comma-separated" /></Field>
            </Grid>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-surface-200">
          <p className="text-2xs text-surface-400">Fields marked * are required</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} disabled={save.isPending} className="btn-primary">
              <Save className="w-4 h-4" /> {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create medicine'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(full && 'sm:col-span-2')}>
      <label className="label">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer self-end pb-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      <span className="text-sm text-surface-700">{label}</span>
    </label>
  )
}
