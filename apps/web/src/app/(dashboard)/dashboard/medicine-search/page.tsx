'use client'

import { useState, useMemo } from 'react'
import { Search, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency, cn, debounce } from '@/lib/utils'

interface SearchResult {
  id: string
  name: string
  genericName: string
  brandName: string
  manufacturerName: string
  dosageForm: string
  strength: string
  packSize: string
  mrp: number
  schedule: string
  matchScore: number
  matchType: 'EXACT' | 'ALIAS' | 'BARCODE' | 'FUZZY' | 'COMPOSITION' | 'TOKEN'
  matchedOn: string
}

interface NormalizedResult {
  raw: string
  normalized: string
  brandName?: string
  genericName?: string
  strength?: string
  strengthNumeric?: number
  strengthUnit?: string
  dosageForm?: string
  tokens: string[]
  confidence: number
}

const MATCH_TYPE_STYLES: Record<string, string> = {
  EXACT: 'bg-brand-50 text-brand-800',
  BARCODE: 'bg-brand-50 text-brand-800',
  ALIAS: 'bg-surface-100 text-surface-700',
  COMPOSITION: 'bg-surface-100 text-surface-700',
  TOKEN: 'bg-surface-100 text-surface-600',
  FUZZY: 'bg-warning-50 text-warning-800',
}

const SCHEDULE_STYLES: Record<string, string> = {
  OTC: 'badge-success',
  SCHEDULE_H: 'badge-warning',
  SCHEDULE_H1: 'badge-danger',
  SCHEDULE_X: 'badge-danger',
}

export default function MedicineSearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [normalized, setNormalized] = useState<NormalizedResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // One debounced searcher for the page's lifetime (state setters are stable).
  const performSearch = useMemo(
    () => debounce(async (q: string) => {
      if (!q.trim()) {
        setResults([])
        setNormalized(null)
        setHasSearched(false)
        return
      }

      setLoading(true)
      try {
        const [searchRes, normalizeRes] = await Promise.all([
          api.post('/medicine-intelligence/search', { query: q, limit: 15 }),
          api.post('/medicine-intelligence/normalize', { inputs: [q] }),
        ])

        setResults(searchRes.data.data)
        setNormalized(normalizeRes.data.data[0])
        setHasSearched(true)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }, 300),
    []
  )

  const handleQueryChange = (value: string) => {
    setQuery(value)
    performSearch(value)
  }

  const exampleSearches = ['Dolo 650', 'Paracetamol 650mg', 'Azithromycin 500', 'Pan-D 40', 'Asthalin Inhaler', 'Metformin']

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title">Medicine search</h1>
        <p className="text-[13px] leading-5 text-surface-500 mt-1">
          AI-powered medicine lookup — handles misspellings, brand/generic names, short forms, and barcodes.
        </p>
      </div>

      {/* Search box */}
      <div>
        <div className="search-field">
          <Search className="left-3! w-4! h-4!" />
          <input
            type="search"
            aria-label="Search medicines"
            className="input min-h-11 pl-10! pr-10 text-[15px]"
            placeholder="Medicine name, generic, barcode… (e.g. Dolo650, Pan 40, 8901234567890)"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
          />
          {loading && (
            <svg className="absolute right-3 animate-spin h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" aria-label="Searching">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Examples */}
        {!hasSearched && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-surface-500 mr-1">Try</span>
            {exampleSearches.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => { setQuery(ex); handleQueryChange(ex) }}
                className="text-xs h-6 px-2 rounded-md border border-surface-200 bg-paper text-surface-700 hover:border-surface-300 hover:text-surface-950 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Normalization result */}
      {normalized && (
        <div className="card px-4 py-3">
          <div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-surface-500 mb-2">Normalized input</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-xs">Input:</span>
                  <code className="bg-surface-100 px-1.5 py-0.5 rounded text-surface-700 text-xs">{normalized.raw}</code>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-xs">→</span>
                  <code className="bg-brand-50 px-1.5 py-0.5 rounded text-brand-800 text-xs font-medium">{normalized.normalized}</code>
                </div>
                {normalized.strength && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Strength:</span>
                    <span className="text-xs font-medium text-slate-700">{normalized.strength}</span>
                  </div>
                )}
                {normalized.dosageForm && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Form:</span>
                    <span className="text-xs font-medium text-slate-700">{normalized.dosageForm}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 text-xs">Confidence:</span>
                  <span className={cn('text-xs font-medium', normalized.confidence > 0.7 ? 'text-green-600' : normalized.confidence > 0.5 ? 'text-amber-600' : 'text-red-500')}>
                    {Math.round(normalized.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] text-surface-500">
              {results.length > 0 ? `${results.length} results` : 'No medicines found'}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="card px-6 py-12 text-center">
              <p className="text-[13px] font-semibold text-surface-800">No medicines matched &ldquo;{query}&rdquo;</p>
              <p className="text-[13px] text-surface-500 mt-1">Try a different name, generic, or barcode.</p>
            </div>
          ) : (
            <div className="card divide-y divide-surface-100 overflow-hidden">
              {results.map((result, index) => (
                <div
                  key={result.id}
                  className={cn(
                    'px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-surface-50 transition-colors',
                    index === 0 && 'bg-brand-50/40'
                  )}
                >
                  {/* Rank */}
                  <div className={cn(
                    'w-5 text-xs font-medium tabular-nums shrink-0 text-center',
                    index === 0 ? 'text-brand-700' : 'text-surface-400'
                  )} title={index === 0 ? 'Best match' : undefined}>
                    {index === 0 ? <CheckCircle className="w-4 h-4 mx-auto" aria-label="Best match" /> : index + 1}
                  </div>

                  {/* Medicine info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{result.name}</span>
                      <span className="text-slate-400 text-xs">by</span>
                      <span className="text-sm text-slate-600">{result.manufacturerName}</span>
                      {result.schedule !== 'OTC' && (
                        <span className={SCHEDULE_STYLES[result.schedule] ?? 'badge-neutral'}>
                          {result.schedule.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {result.genericName} • {result.strength} • {result.dosageForm} • {result.packSize}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn('text-[10.5px] px-1.5 h-5 inline-flex items-center rounded-sm font-medium', MATCH_TYPE_STYLES[result.matchType])}>
                        {result.matchType}
                      </span>
                      <span className="text-xs text-slate-400">
                        matched on: <span className="text-slate-600 font-mono">{result.matchedOn}</span>
                      </span>
                    </div>
                  </div>

                  {/* Price + score */}
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-slate-900">{formatCurrency(result.mrp)}</p>
                    <p className="text-xs text-slate-400">MRP</p>
                    <div className="mt-1 flex items-center gap-1 justify-end">
                      <div className="w-14 h-1 bg-surface-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-600 rounded-full"
                          style={{ width: `${Math.round(result.matchScore * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{Math.round(result.matchScore * 100)}%</span>
                    </div>
                  </div>

                  <button className="btn-secondary shrink-0">Add to bill</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions when empty */}
      {!hasSearched && !loading && (
        <div className="border-t border-surface-200 pt-6">
          <p className="text-[13px] font-semibold text-surface-900">Intelligent medicine lookup</p>
          <p className="text-[13px] text-surface-500 mt-1 max-w-lg">
            Works with brand names, generic names, short forms, misspellings, compositions, and barcodes.
          </p>
          <ol className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-px bg-surface-200 border border-surface-200 rounded-lg overflow-hidden text-[13px]">
            {[
              ['Brand name', 'Whatever is typed or scanned'],
              ['Normalize', 'Spelling, strength and form'],
              ['Match', 'Brand, generic and barcode'],
              ['Results', 'Ranked by confidence'],
            ].map(([title, hint], i) => (
              <li key={title} className="bg-paper px-4 py-3">
                <span className="text-xs text-surface-400 tabular-nums">{i + 1}</span>
                <p className="font-medium text-surface-900 mt-0.5">{title}</p>
                <p className="text-xs text-surface-500">{hint}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
