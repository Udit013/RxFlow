'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pill, Search, Upload, Sparkles, Download } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
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
  const [search, setSearch] = useState('')
  const [scheduleFilter, setScheduleFilter] = useState<string>('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['medicines', search, scheduleFilter],
    queryFn: () =>
      api.get('/medicines', {
        params: { search: search || undefined, schedule: scheduleFilter || undefined, limit: 50 },
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
            className="btn-primary"
          >
            <Sparkles className="w-4 h-4" />
            {importMutation.isPending ? 'Loading...' : `Load ${SAMPLE_MEDICINES.length} sample medicines`}
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

      <div className="flex gap-3">
        <div className="card p-3 flex-1">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 ml-1" />
            <input
              className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
              placeholder="Search by name, generic, brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <select
          className="input w-48"
          value={scheduleFilter}
          onChange={(e) => setScheduleFilter(e.target.value)}
        >
          <option value="">All schedules</option>
          <option value="OTC">OTC</option>
          <option value="SCHEDULE_H">Schedule H</option>
          <option value="SCHEDULE_H1">Schedule H1</option>
          <option value="SCHEDULE_X">Schedule X</option>
          <option value="SCHEDULE_G">Schedule G</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Medicine</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Generic</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Manufacturer</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pack</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">MRP</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">GST</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Schedule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : medicines.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  <Pill className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No medicines found.</p>
                  <p className="text-xs mt-2">Click <strong>"Load sample medicines"</strong> above to populate the catalog.</p>
                </td>
              </tr>
            ) : (
              medicines.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/medicines/${m.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {m.name}
                    </Link>
                    <p className="text-xs text-slate-500">{m.strength} • {m.dosageForm}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{m.genericName}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{m.manufacturerName}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{m.packSize}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(m.mrp)}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{m.gstRate}%</td>
                  <td className="px-4 py-3 text-center">
                    {m.schedule === 'OTC' ? (
                      <span className="badge-success">OTC</span>
                    ) : (
                      <span className="badge-warning">{m.schedule.replace('SCHEDULE_', 'Sch ')}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
