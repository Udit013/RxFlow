'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowUpDown, ArrowUp, ArrowDown, Search, SlidersHorizontal,
  ChevronLeft, ChevronRight, Download, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { SkeletonRow } from './skeleton-row'

export interface DataTableColumn<T> {
  /** Stable key — also used for column-visibility toggling */
  key: string
  header: string
  /** Cell renderer. Falls back to accessor/raw value. */
  render?: (row: T) => ReactNode
  /** Value used for sorting, global filter, and CSV export */
  accessor?: (row: T) => string | number | null | undefined
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  /** Hide from the column-visibility menu (always shown) */
  pinned?: boolean
  className?: string
  /** Initially hidden (user can re-enable) */
  defaultHidden?: boolean
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey: (row: T) => string
  isLoading?: boolean
  onRowClick?: (row: T) => void
  searchPlaceholder?: string
  /** Show the global search box */
  searchable?: boolean
  pageSize?: number
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  /** Enables a CSV export button using each column's accessor/header */
  exportFileName?: string
  /** Extra controls rendered in the toolbar (e.g. filters, "New" button) */
  toolbar?: ReactNode
}

function valueOf<T>(col: DataTableColumn<T>, row: T): string | number {
  if (col.accessor) { const v = col.accessor(row); return v ?? '' }
  const raw = (row as Record<string, unknown>)[col.key]
  return (raw as string | number) ?? ''
}

export function DataTable<T>({
  columns, data, rowKey, isLoading, onRowClick,
  searchPlaceholder = 'Search…', searchable = true, pageSize = 15,
  emptyIcon, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction,
  exportFileName, toolbar,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  )
  const [colMenuOpen, setColMenuOpen] = useState(false)

  const visibleColumns = columns.filter((c) => !hidden.has(c.key))

  const filtered = useMemo(() => {
    if (!query.trim()) return data
    const q = query.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => String(valueOf(col, row)).toLowerCase().includes(q))
    )
  }, [data, query, columns])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = valueOf(col, a), bv = valueOf(col, b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
    })
  }, [filtered, sortKey, sortDir, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const paged = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  function toggleSort(col: DataTableColumn<T>) {
    if (col.sortable === false) return
    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(col.key); setSortDir('asc') }
  }

  function exportCsv() {
    const cols = visibleColumns
    const header = cols.map((c) => `"${c.header}"`).join(',')
    const rows = sorted.map((row) =>
      cols.map((c) => `"${String(valueOf(c, row)).replace(/"/g, '""')}"`).join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportFileName || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const alignCls = (a?: string) => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {(searchable || toolbar || exportFileName) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="card !p-2 flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-surface-400 ml-1" />
              <input
                className="flex-1 text-sm bg-transparent outline-none"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              />
            </div>
          )}
          {toolbar}
          {/* Column visibility */}
          <div className="relative">
            <button
              onClick={() => setColMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setColMenuOpen(false), 150)}
              className="btn-secondary"
              title="Columns"
            >
              <SlidersHorizontal className="w-4 h-4" /> Columns
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-surface-200 rounded-lg shadow-dropdown z-20 p-1.5 max-h-72 overflow-y-auto">
                {columns.map((c) => (
                  <label
                    key={c.key}
                    className={cn('flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-surface-50', c.pinned && 'opacity-50')}
                  >
                    <input
                      type="checkbox"
                      disabled={c.pinned}
                      checked={!hidden.has(c.key)}
                      onChange={(e) => {
                        setHidden((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.delete(c.key)
                          else next.add(c.key)
                          return next
                        })
                      }}
                    />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          {exportFileName && (
            <button onClick={exportCsv} className="btn-secondary" title="Export CSV">
              <Download className="w-4 h-4" /> Export
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-50/80 backdrop-blur text-2xs uppercase tracking-[0.08em] text-surface-500 border-b border-surface-200">
                {visibleColumns.map((col) => {
                  const isSorted = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col)}
                      className={cn(
                        'px-4 py-2.5 font-semibold whitespace-nowrap select-none',
                        alignCls(col.align),
                        col.sortable !== false && 'cursor-pointer hover:text-surface-700',
                      )}
                    >
                      <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                        {col.header}
                        {col.sortable !== false && (
                          isSorted
                            ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-brand-600" /> : <ArrowDown className="w-3 h-3 text-brand-600" />)
                            : <ArrowUpDown className="w-3 h-3 text-surface-300" />
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {isLoading ? (
                <SkeletonRow columns={visibleColumns.length} rows={8} />
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length}>
                    <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
                  </td>
                </tr>
              ) : (
                paged.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('hover:bg-surface-50/60', onRowClick && 'cursor-pointer')}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={cn('px-4 py-2.5', alignCls(col.align), col.className)}>
                        {col.render ? col.render(row) : String(valueOf(col, row) || '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / pagination */}
        {!isLoading && sorted.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-surface-200 text-xs text-surface-500">
            <span>
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                className="p-1.5 rounded hover:bg-surface-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">Page {safePage + 1} / {pageCount}</span>
              <button
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                className="p-1.5 rounded hover:bg-surface-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
