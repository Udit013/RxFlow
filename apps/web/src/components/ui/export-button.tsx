'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, ChevronDown, FileText, FileSpreadsheet } from 'lucide-react'
import { exportRows } from '@/lib/export'
import { cn } from '@/lib/utils'

interface ExportButtonProps {
  /** Base filename without extension */
  filename: string
  /** Row data to export. Can be a function for lazy evaluation. */
  rows: any[] | (() => any[])
  sheetName?: string
  disabled?: boolean
  label?: string
  className?: string
}

/** Split button: CSV + Excel export from a single control. */
export function ExportButton({ filename, rows, sheetName, disabled, label = 'Export', className }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) { document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler) }
    return undefined
  }, [open])

  const doExport = (format: 'csv' | 'xlsx') => {
    const data = typeof rows === 'function' ? rows() : rows
    if (!data || data.length === 0) return
    exportRows(format, filename, data, sheetName)
    setOpen(false)
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="btn-primary"
      >
        <Download className="w-4 h-4" /> {label} <ChevronDown className="w-3.5 h-3.5 opacity-80" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-surface-200 rounded-xl shadow-elevated z-30 overflow-hidden py-1">
          <button onClick={() => doExport('xlsx')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-50 text-surface-700">
            <FileSpreadsheet className="w-4 h-4 text-success-600" /> Excel (.xlsx)
          </button>
          <button onClick={() => doExport('csv')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-50 text-surface-700">
            <FileText className="w-4 h-4 text-surface-500" /> CSV (.csv)
          </button>
        </div>
      )}
    </div>
  )
}
