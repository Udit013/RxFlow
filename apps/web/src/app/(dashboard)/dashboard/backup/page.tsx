'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Papa from 'papaparse'
import { Download, Upload, FileJson, Database, FileSpreadsheet, AlertTriangle, Check, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { encryptJson, decryptJson, isEncryptedEnvelope } from '@/lib/crypto-backup'

export default function BackupPage() {
  const [tab, setTab] = useState<'backup' | 'customers' | 'suppliers'>('backup')

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Database className="w-5 h-5" /> Backup & Import</h1>
          <p className="text-sm text-slate-500">Export your full database · Import from CSV (Marg, Pharmarack, custom)</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {([
          ['backup', 'Backup & Restore', FileJson],
          ['customers', 'Import Customers', FileSpreadsheet],
          ['suppliers', 'Import Suppliers', FileSpreadsheet],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === k ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'backup' && <BackupTab />}
      {tab === 'customers' && <CsvImportTab entity="customers" />}
      {tab === 'suppliers' && <CsvImportTab entity="suppliers" />}
    </div>
  )
}

function BackupTab() {
  const [exporting, setExporting] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'medicines-only'>('merge')
  const [encrypt, setEncrypt] = useState(false)
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportPassphraseConfirm, setExportPassphraseConfirm] = useState('')
  const [restorePassphrase, setRestorePassphrase] = useState('')

  async function exportBackup() {
    if (encrypt) {
      if (exportPassphrase.length < 8) { toast.error('Passphrase must be 8+ characters'); return }
      if (exportPassphrase !== exportPassphraseConfirm) { toast.error('Passphrases do not match'); return }
    }
    setExporting(true)
    try {
      const res = await api.get('/backup/export', { responseType: 'text', transformResponse: [(v) => v] })
      const dump = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      const tenant = authService.getStoredUser()?.tenant
      const dateStr = new Date().toISOString().slice(0, 10)

      let payload: string
      let filename: string
      if (encrypt) {
        const env = await encryptJson(dump, exportPassphrase)
        payload = JSON.stringify(env)
        filename = `rxflow-backup-${tenant?.slug ?? 'tenant'}-${dateStr}.encrypted.json`
      } else {
        payload = JSON.stringify(dump, null, 2)
        filename = `rxflow-backup-${tenant?.slug ?? 'tenant'}-${dateStr}.json`
      }

      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(encrypt ? 'Encrypted backup downloaded' : 'Backup downloaded')
      setExportPassphrase('')
      setExportPassphraseConfirm('')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? e.message ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const restoreMut = useMutation({
    mutationFn: async () => {
      if (!restoreFile) throw new Error('Pick a file')
      const text = await restoreFile.text()
      let parsed: any
      try { parsed = JSON.parse(text) } catch { throw new Error('File is not valid JSON') }

      let dump = parsed
      if (isEncryptedEnvelope(parsed)) {
        if (!restorePassphrase) throw new Error('This backup is encrypted — enter the passphrase')
        dump = await decryptJson(parsed, restorePassphrase)
      }
      return api.post('/backup/import', { dump, mode: restoreMode })
    },
    onSuccess: (res) => {
      const s = res.data.data
      toast.success(
        `Restored: ${s.medicinesInserted}+${s.medicinesUpdated} medicines, ${s.customersUpserted} customers, ${s.suppliersUpserted} suppliers, ${s.salesRepsUpserted} sales reps`
      )
      setRestoreFile(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.message ?? 'Restore failed'),
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-brand-600" />
          <h3 className="font-semibold text-slate-900">Export full backup</h3>
        </div>
        <p className="text-sm text-slate-600">
          Downloads everything for this tenant as a single JSON file: customers, suppliers, sales reps, inventory,
          batches, orders, invoices, payments, ledger. Medicines (global catalog) included. <strong>Passwords are
          excluded</strong> — never exported.
        </p>
        <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
          <li>Use this for regular off-site backups (Drive, Dropbox, USB)</li>
          <li>Use this before any major change (schema migrations, big imports)</li>
          <li>Portable JSON — works across machines, future DB versions</li>
        </ul>
        <label className="flex items-start gap-2 cursor-pointer border-t pt-3">
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} className="mt-1" />
          <div className="text-sm">
            <p className="font-medium flex items-center gap-1"><Lock className="w-3 h-3" /> Encrypt with passphrase</p>
            <p className="text-xs text-slate-500">AES-GCM-256, PBKDF2-SHA256 (200K iterations). Keep the passphrase safe — without it the file cannot be recovered.</p>
          </div>
        </label>
        {encrypt && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="password"
              className="input"
              placeholder="Passphrase (8+ chars)"
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              className="input"
              placeholder="Confirm passphrase"
              value={exportPassphraseConfirm}
              onChange={(e) => setExportPassphraseConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        )}
        <button onClick={exportBackup} disabled={exporting} className="btn-primary">
          <Download className="w-4 h-4" /> {exporting ? 'Exporting...' : encrypt ? 'Download encrypted backup' : 'Download backup'}
        </button>
      </div>

      <div className="card p-5 space-y-3 border-amber-200">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-amber-700" />
          <h3 className="font-semibold text-slate-900">Restore from backup</h3>
        </div>
        <p className="text-sm text-slate-600">
          Merges a backup JSON back into this tenant. Customers/suppliers/reps upsert by phone (existing rows
          updated). Medicines upsert by ID.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Restore does not touch orders, invoices, batches, or ledger entries — those would re-trigger inventory
            changes and break accounting. Use the SQL-level restore from your DB host if you need to roll back
            transactional data.
          </span>
        </div>
        <div>
          <label className="label">Backup file (plain or encrypted)</label>
          <input
            type="file"
            accept=".json,application/json"
            className="input"
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Lock className="w-3 h-3" /> Passphrase (only if encrypted)</label>
          <input
            type="password"
            className="input"
            placeholder="Leave blank for unencrypted backups"
            value={restorePassphrase}
            onChange={(e) => setRestorePassphrase(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label">Mode</label>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" checked={restoreMode === 'merge'} onChange={() => setRestoreMode('merge')} className="mt-1" />
              <div>
                <p className="font-medium">Merge (recommended)</p>
                <p className="text-xs text-slate-500">Upsert medicines + customers + suppliers + sales reps</p>
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" checked={restoreMode === 'medicines-only'} onChange={() => setRestoreMode('medicines-only')} className="mt-1" />
              <div>
                <p className="font-medium">Medicines only</p>
                <p className="text-xs text-slate-500">Useful for syncing the medicine catalog between installations</p>
              </div>
            </label>
          </div>
        </div>
        <button
          onClick={() => restoreMut.mutate()}
          disabled={!restoreFile || restoreMut.isPending}
          className="btn-secondary"
        >
          <Upload className="w-4 h-4" /> {restoreMut.isPending ? 'Restoring...' : 'Restore'}
        </button>
      </div>

      <div className="card p-5 lg:col-span-2 bg-slate-50 border-dashed">
        <h3 className="font-semibold text-slate-900 mb-2">Automated backups (recommended)</h3>
        <p className="text-sm text-slate-600 mb-2">
          For LAN/single-host deployments, schedule a daily cron on the host machine:
        </p>
        <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto">{`# crontab -e
0 23 * * * curl -s -H "Authorization: Bearer $RXFLOW_ADMIN_TOKEN" \\
  -o ~/Backups/rxflow-$(date +%Y-%m-%d).json \\
  http://localhost:3001/api/v1/backup/export`}</pre>
        <p className="text-xs text-slate-500 mt-2">
          Generate a long-lived token via your API (or just log in and copy from localStorage for one-off use).
          For production, prefer a host-level <code className="bg-slate-200 px-1 rounded">pg_dump</code> too — it&apos;s
          stricter and captures schema.
        </p>
      </div>
    </div>
  )
}

interface CsvImportTabProps { entity: 'customers' | 'suppliers' }

function CsvImportTab({ entity }: CsvImportTabProps) {
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [stage, setStage] = useState<'upload' | 'map' | 'done'>('upload')

  const fields = entity === 'customers' ? [
    { key: 'name', label: 'Name', required: true, hints: ['name', 'customer'] },
    { key: 'phone', label: 'Phone', required: true, hints: ['phone', 'mobile', 'contact'] },
    { key: 'email', label: 'Email', hints: ['email'] },
    { key: 'gstin', label: 'GSTIN', hints: ['gstin', 'gst'] },
    { key: 'addressLine1', label: 'Address', hints: ['address', 'street'] },
    { key: 'city', label: 'City', hints: ['city'] },
    { key: 'state', label: 'State', hints: ['state'] },
    { key: 'pincode', label: 'Pincode', hints: ['pincode', 'zip', 'postal'] },
    { key: 'creditLimit', label: 'Credit Limit', hints: ['credit', 'limit'] },
  ] : [
    { key: 'name', label: 'Contact Name', required: true, hints: ['name', 'contact'] },
    { key: 'companyName', label: 'Company Name', required: true, hints: ['company', 'firm'] },
    { key: 'phone', label: 'Phone', required: true, hints: ['phone', 'mobile'] },
    { key: 'email', label: 'Email', hints: ['email'] },
    { key: 'gstin', label: 'GSTIN', hints: ['gstin', 'gst'] },
    { key: 'city', label: 'City', hints: ['city'] },
    { key: 'state', label: 'State', hints: ['state'] },
    { key: 'creditDays', label: 'Credit Days', hints: ['credit', 'days'] },
  ]

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data as any[]).filter((r) => Object.values(r).some((v) => String(v).trim() !== ''))
        if (data.length === 0) {
          toast.error('CSV empty')
          return
        }
        const hdrs = Object.keys(data[0])
        const auto: Record<string, string | null> = {}
        for (const f of fields) {
          const m = hdrs.find((h) => f.hints.some((hint) => h.toLowerCase().replace(/[^a-z]/g, '').includes(hint)))
          auto[f.key] = m ?? null
        }
        setRows(data)
        setHeaders(hdrs)
        setMapping(auto)
        setStage('map')
      },
    })
  }

  const [result, setResult] = useState<{ inserted: number; updated?: number; errors: Array<{ row: number; name: string; phone: string; reason: string }> } | null>(null)

  const importMut = useMutation({
    mutationFn: () => {
      const missing = fields.filter((f) => f.required && !mapping[f.key])
      if (missing.length > 0) throw new Error(`Map required columns: ${missing.map((f) => f.label).join(', ')}`)
      const mapped = rows.map((r) => {
        const out: any = {}
        for (const f of fields) {
          const col = mapping[f.key]
          if (!col) continue
          const v = r[col]
          if (f.key === 'creditLimit' || f.key === 'creditDays') {
            out[f.key] = Number(v) || (f.key === 'creditDays' ? 30 : 0)
          } else if (v != null && String(v).trim() !== '') {
            out[f.key] = String(v).trim()
          }
        }
        return out
      }).filter((o) => o.name && o.phone && (entity === 'customers' || o.companyName))

      return api.post(`/backup/import-${entity}`, { rows: mapped })
    },
    onSuccess: (res) => {
      const s = res.data.data
      setResult(s)
      const ok = (s.inserted ?? 0) + (s.updated ?? 0)
      if (s.errors?.length > 0) {
        toast.warning(`${ok} imported · ${s.errors.length} failed (see report below)`)
      } else {
        toast.success(`Imported ${ok} row(s)`)
      }
      setStage('done')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.message ?? 'Import failed'),
  })

  function downloadErrorCsv(errors: any[]) {
    const csv = Papa.unparse(errors.map((e) => ({ row: e.row, name: e.name, phone: e.phone, reason: e.reason })))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${entity}-import-errors-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (stage === 'done') {
    const errors = result?.errors ?? []
    const totalImported = (result?.inserted ?? 0) + (result?.updated ?? 0)
    return (
      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <Check className="w-8 h-8 text-green-600 shrink-0" />
            <div>
              <h3 className="font-semibold">Import complete</h3>
              <p className="text-sm text-slate-600 mt-1">
                <strong>{result?.inserted ?? 0}</strong> inserted{result?.updated != null && <>, <strong>{result.updated}</strong> updated</>}
                {errors.length > 0 && <>, <strong className="text-red-600">{errors.length}</strong> failed</>}
                {' '}— total imported {totalImported}/{totalImported + errors.length}
              </p>
            </div>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="card overflow-hidden border-red-200">
            <div className="card-header bg-red-50 flex items-center justify-between">
              <h3 className="font-semibold text-red-900">Failed rows ({errors.length})</h3>
              <button onClick={() => downloadErrorCsv(errors)} className="text-xs text-brand-600 hover:underline">
                Download errors as CSV
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Row #</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {errors.slice(0, 100).map((e, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">{e.row}</td>
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.phone}</td>
                    <td className="px-3 py-2 text-red-700 text-xs">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {errors.length > 100 && (
              <p className="p-2 text-xs text-slate-500 bg-slate-50 text-center">Showing first 100 of {errors.length}. Download CSV for the full list.</p>
            )}
          </div>
        )}

        <button onClick={() => { setStage('upload'); setRows([]); setHeaders([]); setMapping({}); setResult(null) }} className="btn-primary">
          Import another file
        </button>
      </div>
    )
  }

  if (stage === 'upload') {
    return (
      <div className="card p-5">
        <h3 className="font-semibold mb-3">Upload {entity} CSV</h3>
        <label className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors">
          <Upload className="w-8 h-8 text-slate-400" />
          <p className="font-medium text-slate-700">Drop CSV or click to browse</p>
          <p className="text-xs text-slate-500">Works with Marg, Pharmarack, custom formats — you map the columns next</p>
          <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        <p className="text-xs text-slate-500 mt-3">
          Required columns: {fields.filter((f) => f.required).map((f) => f.label).join(', ')}
        </p>
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Map columns</h3>
        <p className="text-xs text-slate-500">{rows.length} rows detected</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="label">
              {f.label} {f.required && <span className="text-red-600">*</span>}
            </label>
            <select
              className="input"
              value={mapping[f.key] ?? ''}
              onChange={(e) => setMapping((p) => ({ ...p, [f.key]: e.target.value || null }))}
            >
              <option value="">— Not mapped —</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2">Preview (first 3 rows)</p>
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>{headers.map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 3).map((r, i) => (
                <tr key={i} className="border-t">{headers.map((h) => <td key={h} className="px-2 py-1 text-slate-600">{r[h]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between border-t pt-3">
        <button onClick={() => setStage('upload')} className="btn-secondary">Back</button>
        <button onClick={() => importMut.mutate()} disabled={importMut.isPending} className="btn-primary">
          <Upload className="w-4 h-4" /> {importMut.isPending ? 'Importing...' : `Import ${rows.length} rows`}
        </button>
      </div>
    </div>
  )
}
