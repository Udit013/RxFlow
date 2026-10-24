'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Pill, Upload, Download, Plus, Pencil, Search, Database } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { MedicineMasterModal } from '@/components/medicines/medicine-master-modal'
import { getActiveRegion } from '@/lib/region'
import { DRUG_SCHEDULE_CODES, scheduleLabel } from '@rxflow/regional'
import { CountryTag, SourceBadge, formLabel } from '@/components/medicines/catalog-labels'
import { MarketPicker } from '@/components/medicines/market-picker'

/** A medicine row as uploaded from CSV (bulk-import body). */
interface CsvMedicine {
  name?: string
  genericName?: string
  brandName?: string
  manufacturerName?: string
  dosageForm: string
  strength?: string
  packSize?: string
  packUnit: string
  mrp: number
  hsn: string
  gstRate: number
  schedule: string
  requiresPrescription: boolean
}

/** Example rows for the CSV template — clearly placeholders, not catalog data. */
const TEMPLATE_EXAMPLES: Record<string, string>[] = [
  { name: 'Example Paracetamol 500', genericName: 'Paracetamol', brandName: 'Example', manufacturerName: 'Your supplier', dosageForm: 'TABLET', strength: '500mg', packSize: '10 tablets', packUnit: 'tablets', mrp: '20', hsn: '3004', gstRate: '5', schedule: 'OTC', requiresPrescription: 'false' },
  { name: 'Example Amoxicillin 250', genericName: 'Amoxicillin', brandName: 'Example', manufacturerName: 'Your supplier', dosageForm: 'CAPSULE', strength: '250mg', packSize: '10 capsules', packUnit: 'capsules', mrp: '60', hsn: '3004', gstRate: '5', schedule: 'SCHEDULE_H', requiresPrescription: 'true' },
]

const FORM_FILTERS = ['TABLET', 'CAPSULE', 'SYRUP', 'SOLUTION', 'SUSPENSION', 'INJECTION', 'DROPS', 'INHALER', 'CREAM', 'OINTMENT', 'GEL', 'LOTION', 'SPRAY', 'POWDER', 'PATCH', 'SUPPOSITORY', 'OTHER']

interface Medicine {
  id: string
  name: string
  genericName: string
  brandName: string
  manufacturerName: string
  dosageForm: string
  strength: string
  packSize: string
  mrp: number
  hsn: string
  gstRate: number
  schedule: string
  requiresPrescription: boolean
  composition: string | null
  country: string | null
  dataSource: string | null
  isVerified: boolean
  therapeuticClass: string | null
}

interface ImportResult {
  created: number
  skipped: number
  total: number
  errors: { row: number; error: string }[]
}

const CSV_TEMPLATE_HEADERS = [
  'name', 'genericName', 'brandName', 'manufacturerName',
  'dosageForm', 'strength', 'packSize', 'packUnit',
  'mrp', 'hsn', 'gstRate', 'schedule', 'requiresPrescription',
]

export default function MedicinesPage() {
  const [scheduleFilter, setScheduleFilter] = useState<string>('')
  const [formFilter, setFormFilter] = useState<string>('')
  const home = getActiveRegion().country
  const [markets, setMarkets] = useState<string[]>([home])
  // Which markets have a shared catalog (with counts) — the picker's options.
  const { data: sourcesData } = useQuery({
    queryKey: ['medicine-sources'],
    queryFn: () => api.get('/medicines/sources').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  })
  const marketOptions = (() => {
    const counts = new Map<string, number>()
    for (const c of (sourcesData?.catalog ?? []) as { country: string | null; count: number }[]) {
      const code = c.country ?? 'INTL'
      counts.set(code, (counts.get(code) ?? 0) + c.count)
    }
    if (!counts.has(home)) counts.set(home, 0)
    return [...counts.entries()].map(([code, count]) => ({ code, count }))
  })()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // Search runs on the server (brand, generic, ingredient, strength, form, therapeutic class).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [editing, setEditing] = useState<Medicine | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['medicines', scheduleFilter, formFilter, markets.join(','), search],
    queryFn: () =>
      api.get('/medicines', {
        params: {
          schedule: scheduleFilter || undefined,
          dosageForm: formFilter || undefined,
          markets: markets.join(','),
          search: search || undefined,
          limit: 500,
        },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const medicines: Medicine[] = data?.data ?? []

  const importMutation = useMutation({
    mutationFn: (rows: CsvMedicine[]) =>
      api.post('/medicines/bulk-import', { medicines: rows }).then((r) => r.data),
    onSuccess: (res) => {
      const r: ImportResult = res.data
      setImportResult(r)
      toast.success(`Imported ${r.created} medicines (${r.skipped} skipped)`)
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Import failed'),
  })

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast.error(`CSV parse error: ${results.errors[0].message}`)
          return
        }
        const rows = results.data.map((r) => ({
          name: r.name?.trim(),
          genericName: r.genericName?.trim(),
          brandName: r.brandName?.trim(),
          manufacturerName: r.manufacturerName?.trim(),
          dosageForm: (r.dosageForm?.trim().toUpperCase() ?? 'TABLET') ,
          strength: r.strength?.trim(),
          packSize: r.packSize?.trim(),
          packUnit: r.packUnit?.trim() || 'tablets',
          mrp: parseFloat(r.mrp ?? '0') || 0,
          // Defaults: HS heading 3004 (medicaments; India's 8-digit HSN is 30049099), the
          // country's default tax rate. A literal 0% is kept — `|| default` used to turn it into 12%.
          hsn: r.hsn?.trim() || (getActiveRegion().code === 'IN' ? '30049099' : '3004'),
          gstRate: Number.isFinite(parseFloat(r.gstRate ?? '')) ? parseFloat(r.gstRate!) : getActiveRegion().tax.defaultRate,
          schedule: (r.schedule?.trim().toUpperCase() || 'OTC') ,
          requiresPrescription: ['true', 'yes', '1'].includes((r.requiresPrescription ?? '').toLowerCase()),
        }))
        // Filter out incomplete rows
        const valid = rows.filter((r) => r.name && r.genericName && r.manufacturerName && r.strength && r.packSize && r.mrp > 0)
        if (valid.length === 0) {
          toast.error('No valid rows found. Check CSV column headers.')
          return
        }
        importMutation.mutate(valid as CsvMedicine[])
      },
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function downloadTemplate() {
    const csv = Papa.unparse({
      fields: CSV_TEMPLATE_HEADERS,
      data: TEMPLATE_EXAMPLES.map((m) => CSV_TEMPLATE_HEADERS.map((k) => m[k] ?? '')),
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'rxflow-medicines-template.csv'
    link.click()
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Medicines</h1>
          <p className="text-sm text-slate-500">
            {data?.meta?.total ?? 0} {search ? 'matching' : 'in master catalog'}
            {(data?.meta?.total ?? 0) > medicines.length && ` · showing the first ${medicines.length} — refine the search to narrow it down`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/medicines/sources" className="btn-secondary">
            <Database className="w-4 h-4" />
            Data sources
          </Link>
          <button onClick={downloadTemplate} className="btn-secondary">
            <Download className="w-4 h-4" />
            CSV Template
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" disabled={importMutation.isPending}>
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
          <button onClick={() => setEditing('new')} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Medicine
          </button>
        </div>
      </div>

      {importResult && (
        <div className="card p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-900">
            <strong>Import complete:</strong> {importResult.created} created, {importResult.skipped} skipped (duplicates), {importResult.errors.length} errors out of {importResult.total} rows.
          </p>
          {importResult.errors.length > 0 && (
            <details className="mt-2 text-xs text-red-700">
              <summary className="cursor-pointer">Show errors</summary>
              <ul className="mt-1 list-disc list-inside">
                {importResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <DataTable<Medicine>
        data={medicines}
        isLoading={isLoading}
        rowKey={(m) => m.id}
        searchable={false}
        exportFileName="rxflow-medicines"
        emptyIcon={Pill}
        emptyTitle="No medicines found"
        emptyDescription="Add a medicine or import a CSV — or tick other markets to browse the open-data catalogs."
        emptyAction={<button onClick={() => setEditing('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Medicine</button>}
        onRowClick={(m) => setEditing(m)}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 w-full">
            <div className="relative flex-1 min-w-56">
              <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Brand, generic, ingredient, strength, form or use — e.g. “amoxicillin 500mg cap”, “statin”"
                aria-label="Search medicines"
              />
            </div>
            <select className="input w-40" value={formFilter} onChange={(e) => setFormFilter(e.target.value)} aria-label="Dosage form">
              <option value="">All forms</option>
              {FORM_FILTERS.map((f) => <option key={f} value={f}>{formLabel(f)}</option>)}
            </select>
            <select className="input w-44" value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value)} aria-label="Classification">
              <option value="">All classifications</option>
              {DRUG_SCHEDULE_CODES.map((code) => (
                <option key={code} value={code}>{scheduleLabel(getActiveRegion(), code)}</option>
              ))}
            </select>
            <MarketPicker options={marketOptions} value={markets} onChange={setMarkets} home={home} />
          </div>
        }
        columns={medicineColumns}
      />

      {editing && (
        <MedicineMasterModal
          medicine={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

const medicineColumns: DataTableColumn<Medicine>[] = [
  {
    key: 'name', header: 'Medicine', pinned: true, accessor: (m) => m.name,
    render: (m) => (
      <div>
        <p className="font-medium text-surface-900">{m.name}</p>
        <p className="text-xs text-surface-500">{m.strength} • {formLabel(m.dosageForm)}</p>
        {m.composition && <p className="text-2xs text-surface-400 truncate max-w-88" title={m.composition}>{m.composition}</p>}
      </div>
    ),
  },
  { key: 'genericName', header: 'Generic', accessor: (m) => m.genericName, render: (m) => <span className="text-surface-700">{m.genericName}</span> },
  { key: 'manufacturerName', header: 'Manufacturer', accessor: (m) => m.manufacturerName, render: (m) => <span className="text-xs text-surface-600">{m.manufacturerName}</span> },
  { key: 'packSize', header: 'Pack', align: 'center', accessor: (m) => m.packSize },
  {
    key: 'dataSource', header: 'Source', accessor: (m) => m.dataSource ?? '',
    render: (m) => (
      <div className="space-y-0.5">
        <SourceBadge source={m.dataSource} verified={m.isVerified} />
        {m.country && m.country !== getActiveRegion().country && <p className="text-2xs text-surface-500"><CountryTag code={m.country} /></p>}
      </div>
    ),
  },
  { key: 'mrp', header: 'MRP', align: 'right', accessor: (m) => m.mrp, render: (m) => (m.mrp > 0 ? <span className="font-medium">{formatCurrency(m.mrp)}</span> : <span className="text-2xs text-surface-400">Not set</span>) },
  { key: 'gstRate', get header() { return getActiveRegion().tax.label }, align: 'center', accessor: (m) => m.gstRate, render: (m) => `${m.gstRate}%` },
  {
    key: 'schedule', header: 'Classification', align: 'center', accessor: (m) => m.schedule,
    render: (m) => m.schedule === 'OTC'
      ? <span className="badge-success">{scheduleLabel(getActiveRegion(), 'OTC')}</span>
      : <span className="badge-warning">{scheduleLabel(getActiveRegion(), m.schedule)}</span>,
  },
  {
    key: 'actions', header: '', sortable: false, pinned: true, align: 'right',
    render: (m) => (
      <Link href={`/dashboard/medicines/${m.id}`} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline text-xs inline-flex items-center gap-1">
        <Pencil className="w-3 h-3" /> Details
      </Link>
    ),
  },
]
