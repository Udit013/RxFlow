'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pill, Upload, Sparkles, Download, Plus, Pencil } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { MedicineMasterModal } from '@/components/medicines/medicine-master-modal'
import { SAMPLE_MEDICINES, type SeedMedicine } from '@/data/sample-medicines'

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
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [editing, setEditing] = useState<Medicine | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['medicines', scheduleFilter],
    queryFn: () =>
      api.get('/medicines', {
        params: { schedule: scheduleFilter || undefined, limit: 500 },
      }).then((r) => r.data),
  })

  const medicines: Medicine[] = data?.data ?? []

  const importMutation = useMutation({
    mutationFn: (rows: Partial<SeedMedicine>[]) =>
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
          dosageForm: (r.dosageForm?.trim().toUpperCase() ?? 'TABLET') as SeedMedicine['dosageForm'],
          strength: r.strength?.trim(),
          packSize: r.packSize?.trim(),
          packUnit: r.packUnit?.trim() || 'tablets',
          mrp: parseFloat(r.mrp ?? '0') || 0,
          hsn: r.hsn?.trim() || '30049099',
          gstRate: parseFloat(r.gstRate ?? '12') || 12,
          schedule: (r.schedule?.trim().toUpperCase() || 'OTC') as SeedMedicine['schedule'],
          requiresPrescription: ['true', 'yes', '1'].includes((r.requiresPrescription ?? '').toLowerCase()),
        }))
        // Filter out incomplete rows
        const valid = rows.filter((r) => r.name && r.genericName && r.manufacturerName && r.strength && r.packSize && r.mrp > 0)
        if (valid.length === 0) {
          toast.error('No valid rows found. Check CSV column headers.')
          return
        }
        importMutation.mutate(valid as Partial<SeedMedicine>[])
      },
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function downloadTemplate() {
    const sample = SAMPLE_MEDICINES.slice(0, 3)
    const csv = Papa.unparse({
      fields: CSV_TEMPLATE_HEADERS,
      data: sample.map((m) => CSV_TEMPLATE_HEADERS.map((k) => (m as any)[k] ?? '')),
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
          <p className="text-sm text-slate-500">{data?.meta?.total ?? 0} in master catalog</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate} className="btn-secondary">
            <Download className="w-4 h-4" />
            CSV Template
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" disabled={importMutation.isPending}>
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
          <button
            onClick={() => importMutation.mutate(SAMPLE_MEDICINES as Partial<SeedMedicine>[])}
            disabled={importMutation.isPending}
            className="btn-secondary"
          >
            <Sparkles className="w-4 h-4" />
            {importMutation.isPending ? 'Loading...' : `Load samples`}
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
        searchPlaceholder="Search by name, generic, brand, manufacturer…"
        exportFileName="rxflow-medicines"
        emptyIcon={Pill}
        emptyTitle="No medicines found"
        emptyDescription="Add a medicine, load samples, or import a CSV to populate the catalog."
        emptyAction={<button onClick={() => setEditing('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Medicine</button>}
        onRowClick={(m) => setEditing(m)}
        toolbar={
          <select className="input w-44" value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value)}>
            <option value="">All schedules</option>
            <option value="OTC">OTC</option>
            <option value="SCHEDULE_H">Schedule H</option>
            <option value="SCHEDULE_H1">Schedule H1</option>
            <option value="SCHEDULE_X">Schedule X</option>
            <option value="SCHEDULE_G">Schedule G</option>
          </select>
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
        <p className="text-xs text-surface-500">{m.strength} • {m.dosageForm}</p>
      </div>
    ),
  },
  { key: 'genericName', header: 'Generic', accessor: (m) => m.genericName, render: (m) => <span className="text-surface-700">{m.genericName}</span> },
  { key: 'manufacturerName', header: 'Manufacturer', accessor: (m) => m.manufacturerName, render: (m) => <span className="text-xs text-surface-600">{m.manufacturerName}</span> },
  { key: 'packSize', header: 'Pack', align: 'center', accessor: (m) => m.packSize },
  { key: 'mrp', header: 'MRP', align: 'right', accessor: (m) => m.mrp, render: (m) => <span className="font-medium">{formatCurrency(m.mrp)}</span> },
  { key: 'gstRate', header: 'GST', align: 'center', accessor: (m) => m.gstRate, render: (m) => `${m.gstRate}%` },
  {
    key: 'schedule', header: 'Schedule', align: 'center', accessor: (m) => m.schedule,
    render: (m) => m.schedule === 'OTC'
      ? <span className="badge-success">OTC</span>
      : <span className="badge-warning">{m.schedule.replace('SCHEDULE_', 'Sch ')}</span>,
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
