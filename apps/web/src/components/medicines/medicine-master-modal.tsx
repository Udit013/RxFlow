'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Pill, ListChecks, IndianRupee, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// "Type" in the UI = dosage form. Limited to the common set requested.
const FORMS = ['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'OINTMENT', 'DROPS', 'CREAM', 'POWDER', 'OTHER']
const SCHEDULES = ['OTC', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X', 'SCHEDULE_G']
const STATUSES = ['CONTINUE', 'DISCONTINUE', 'INACTIVE']
const MED_TYPES = ['NORMAL', 'CONTROLLED', 'OTC', 'PRESCRIPTION']
const TAX_TYPES = ['TAXABLE', 'EXEMPT', 'NIL_RATED', 'ZERO_RATED']

const TABS = [
  { id: 'primary', label: 'Medicine', icon: Pill },
  { id: 'details', label: 'Details (optional)', icon: ListChecks },
  { id: 'pricing', label: 'Pricing & Codes (optional)', icon: IndianRupee },
] as const

type TabId = typeof TABS[number]['id']
type FormState = Record<string, any>

function emptyForm(): FormState {
  return {
    // primary
    name: '', manufacturerName: '', division: '', hsn: '30049099', dosageForm: 'TABLET',
    packing: '', gstRate: 12, composition: '', minStock: '', defaultReorderLevel: 10,
    // details
    shortName: '', genericName: '', brandName: '', category: '', status: 'CONTINUE',
    medicineType: 'NORMAL', strength: '', schedule: 'OTC', requiresPrescription: false, description: '',
    // pricing & codes
    mrp: '', defaultPurchasePrice: '', defaultCostPrice: '', marginPercent: '',
    rateA: '', rateB: '', rateC: '', taxType: 'TAXABLE', cess: 0,
    maxStock: '', negativeAllowed: false, isHidden: false,
    fastSearchName: '', packSize: '', barcodes: '', aliases: '',
  }
}

function fromMedicine(m: any): FormState {
  const f = emptyForm()
  for (const k of Object.keys(f)) if (m[k] !== undefined && m[k] !== null) f[k] = m[k]
  f.barcodes = (m.barcodes ?? []).join(', ')
  f.aliases = (m.aliases ?? []).join(', ')
  return f
}

const numOrUndef = (v: any) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v))
const splitList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)

export function MedicineMasterModal({ medicine, onClose }: { medicine?: any; onClose: () => void }) {
  const isEdit = !!medicine?.id
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabId>('primary')
  const [form, setForm] = useState<FormState>(() => (isEdit ? fromMedicine(medicine) : emptyForm()))
  const bodyRef = useRef<HTMLDivElement>(null)

  const set = (patch: Partial<FormState>) => setForm((p) => ({ ...p, ...patch }))
  const tabIndex = TABS.findIndex((t) => t.id === tab)

  // Focus the first field whenever the tab changes — keyboard-first entry.
  useEffect(() => {
    const t = setTimeout(() => {
      const first = bodyRef.current?.querySelector<HTMLElement>('input:not([disabled]), select, textarea')
      first?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [tab])

  // Tab from the last field auto-advances to the next tab; Shift+Tab from the
  // first field goes back. Users rarely need the mouse.
  function onBodyKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const fields = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]), select, textarea') ?? [])
    if (fields.length === 0) return
    const active = document.activeElement as HTMLElement
    if (!e.shiftKey && active === fields[fields.length - 1] && tabIndex < TABS.length - 1) {
      e.preventDefault(); setTab(TABS[tabIndex + 1]!.id)
    } else if (e.shiftKey && active === fields[0] && tabIndex > 0) {
      e.preventDefault(); setTab(TABS[tabIndex - 1]!.id)
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        ...form,
        gstRate: Number(form.gstRate) || 0,
        cess: Number(form.cess) || 0,
        defaultReorderLevel: numOrUndef(form.defaultReorderLevel),
        minStock: numOrUndef(form.minStock),
        maxStock: numOrUndef(form.maxStock),
        mrp: numOrUndef(form.mrp),
        rateA: numOrUndef(form.rateA), rateB: numOrUndef(form.rateB), rateC: numOrUndef(form.rateC),
        defaultPurchasePrice: numOrUndef(form.defaultPurchasePrice),
        defaultCostPrice: numOrUndef(form.defaultCostPrice),
        marginPercent: numOrUndef(form.marginPercent),
        barcodes: splitList(form.barcodes),
        aliases: splitList(form.aliases),
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
    if (!form.name || !form.manufacturerName || !form.hsn) {
      toast.error('Product Name, Manufacturer and HSN Code are required')
      setTab('primary')
      return
    }
    save.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
          <div>
            <h2 className="font-semibold text-surface-900">{isEdit ? 'Edit Medicine' : 'New Medicine'}</h2>
            <p className="text-2xs text-surface-500">Only Product Name, Manufacturer & HSN are required · Tab through fields, auto-advances tabs</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 border-b border-surface-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              tabIndex={-1}
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
        <div ref={bodyRef} onKeyDown={onBodyKeyDown} className="p-5 overflow-y-auto flex-1">
          {tab === 'primary' && (
            <Grid>
              <Field label="Product Name" required><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Manufacturer" required><input className="input" value={form.manufacturerName} onChange={(e) => set({ manufacturerName: e.target.value })} /></Field>
              <Field label="Division"><input className="input" value={form.division} onChange={(e) => set({ division: e.target.value })} placeholder="Marketing division" /></Field>
              <Field label="HSN Code" required><input className="input font-mono" value={form.hsn} onChange={(e) => set({ hsn: e.target.value })} /></Field>
              <Field label="Type / Form"><Select value={form.dosageForm} onChange={(v) => set({ dosageForm: v })} options={FORMS} /></Field>
              <Field label="Packing"><input className="input" value={form.packing} onChange={(e) => set({ packing: e.target.value })} placeholder="10x10, Strip, Bottle…" /></Field>
              <Field label="Tax / GST %"><input type="number" step="0.01" className="input" value={form.gstRate} onChange={(e) => set({ gstRate: e.target.value })} /></Field>
              <Field label="Composition"><input className="input" value={form.composition} onChange={(e) => set({ composition: e.target.value })} placeholder="Paracetamol 500mg…" /></Field>
              <Field label="Minimum Stock"><input type="number" className="input" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} /></Field>
              <Field label="Reorder Level"><input type="number" className="input" value={form.defaultReorderLevel} onChange={(e) => set({ defaultReorderLevel: e.target.value })} /></Field>
            </Grid>
          )}

          {tab === 'details' && (
            <Grid>
              <Field label="Short Name"><input className="input" value={form.shortName} onChange={(e) => set({ shortName: e.target.value })} /></Field>
              <Field label="Generic Name"><input className="input" value={form.genericName} onChange={(e) => set({ genericName: e.target.value })} placeholder="Defaults to product name" /></Field>
              <Field label="Brand Name"><input className="input" value={form.brandName} onChange={(e) => set({ brandName: e.target.value })} placeholder="Defaults to product name" /></Field>
              <Field label="Strength"><input className="input" value={form.strength} onChange={(e) => set({ strength: e.target.value })} placeholder="500mg" /></Field>
              <Field label="Category"><input className="input" value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="Antibiotic, Analgesic…" /></Field>
              <Field label="Schedule"><Select value={form.schedule} onChange={(v) => set({ schedule: v })} options={SCHEDULES} /></Field>
              <Field label="Status"><Select value={form.status} onChange={(v) => set({ status: v })} options={STATUSES} /></Field>
              <Field label="Regulatory Type"><Select value={form.medicineType} onChange={(v) => set({ medicineType: v })} options={MED_TYPES} /></Field>
              <Field label="Description" full><textarea className="input min-h-[60px]" value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              <Toggle label="Requires prescription" checked={form.requiresPrescription} onChange={(v) => set({ requiresPrescription: v })} />
            </Grid>
          )}

          {tab === 'pricing' && (
            <Grid>
              <Field label="MRP"><input type="number" step="0.01" className="input" value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} placeholder="Set per batch if blank" /></Field>
              <Field label="Default Purchase Price"><input type="number" step="0.01" className="input" value={form.defaultPurchasePrice} onChange={(e) => set({ defaultPurchasePrice: e.target.value })} /></Field>
              <Field label="Default Cost Price"><input type="number" step="0.01" className="input" value={form.defaultCostPrice} onChange={(e) => set({ defaultCostPrice: e.target.value })} /></Field>
              <Field label="Margin %"><input type="number" step="0.01" className="input" value={form.marginPercent} onChange={(e) => set({ marginPercent: e.target.value })} /></Field>
              <Field label="Rate A (Retail)"><input type="number" step="0.01" className="input" value={form.rateA} onChange={(e) => set({ rateA: e.target.value })} /></Field>
              <Field label="Rate B (Wholesale)"><input type="number" step="0.01" className="input" value={form.rateB} onChange={(e) => set({ rateB: e.target.value })} /></Field>
              <Field label="Rate C (Special)"><input type="number" step="0.01" className="input" value={form.rateC} onChange={(e) => set({ rateC: e.target.value })} /></Field>
              <Field label="Tax Type"><Select value={form.taxType} onChange={(v) => set({ taxType: v })} options={TAX_TYPES} /></Field>
              <Field label="Cess %"><input type="number" step="0.01" className="input" value={form.cess} onChange={(e) => set({ cess: e.target.value })} /></Field>
              <Field label="Maximum Stock"><input type="number" className="input" value={form.maxStock} onChange={(e) => set({ maxStock: e.target.value })} /></Field>
              <Field label="Fast Search Name"><input className="input" value={form.fastSearchName} onChange={(e) => set({ fastSearchName: e.target.value })} placeholder="POS shortcut" /></Field>
              <Field label="Pack Size"><input className="input" value={form.packSize} onChange={(e) => set({ packSize: e.target.value })} placeholder="Defaults to Packing" /></Field>
              <Field label="Barcodes" full><input className="input font-mono" value={form.barcodes} onChange={(e) => set({ barcodes: e.target.value })} placeholder="comma-separated" /></Field>
              <Field label="Aliases" full><input className="input" value={form.aliases} onChange={(e) => set({ aliases: e.target.value })} placeholder="comma-separated alternate names" /></Field>
              <Toggle label="Allow negative stock" checked={form.negativeAllowed} onChange={(v) => set({ negativeAllowed: v })} />
              <Toggle label="Hide from lists / POS" checked={form.isHidden} onChange={(v) => set({ isHidden: v })} />
            </Grid>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-surface-200">
          <p className="text-2xs text-surface-400">Tab {tabIndex + 1} of {TABS.length} · only * fields are required</p>
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
