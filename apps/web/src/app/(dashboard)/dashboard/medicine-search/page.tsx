'use client'

import { useState, useCallback } from 'react'
import { Search, Pill, Zap, Barcode, CheckCircle } from 'lucide-react'
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
  EXACT: 'bg-green-100 text-green-700',
  ALIAS: 'bg-blue-100 text-blue-700',
  BARCODE: 'bg-purple-100 text-purple-700',
  FUZZY: 'bg-amber-100 text-amber-700',
  COMPOSITION: 'bg-cyan-100 text-cyan-700',
  TOKEN: 'bg-slate-100 text-slate-600',
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

  const performSearch = useCallback(
    debounce(async (q: string) => {
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
        <h1 className="page-title">Medicine Intelligence Search</h1>
        <p className="text-sm text-slate-500 mt-1">
          AI-powered medicine lookup — handles misspellings, brand/generic names, short forms, and barcodes.
        </p>
      </div>

      {/* Search box */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
            <Search className="w-5 h-5 text-brand-600" />
          </div>
          <input
            type="text"
            className="flex-1 text-lg text-slate-900 placeholder:text-slate-400 outline-none"
            placeholder="Type medicine name, generic, barcode... (e.g. Dolo650, Pan 40, 8901234567890)"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
          />
          {loading && (
            <svg className="animate-spin h-5 w-5 text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Examples */}
        {!hasSearched && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-400">Try:</span>
            {exampleSearches.map((ex) => (
              <button
                key={ex}
                onClick={() => { setQuery(ex); handleQueryChange(ex) }}
                className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 rounded-full transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Normalization result */}
      {normalized && (
        <div className="card p-4 border-brand-100 bg-brand-50/30">
          <div className="flex items-start gap-3">
            <Zap className="w-4.5 h-4.5 text-brand-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-brand-700 mb-2">Normalized input</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-xs">Input:</span>
                  <code className="bg-white px-2 py-0.5 rounded text-slate-700 text-xs">{normalized.raw}</code>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-xs">→</span>
                  <code className="bg-white px-2 py-0.5 rounded text-brand-700 text-xs font-medium">{normalized.normalized}</code>
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
            <p className="text-sm text-slate-600">
              {results.length > 0 ? `${results.length} results found` : 'No medicines found'}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="card p-10 text-center">
              <Pill className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No medicines matched &quot;{query}&quot;</p>
              <p className="text-xs text-slate-400 mt-1">Try a different name, generic, or barcode</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((result, index) => (
                <div
                  key={result.id}
                  className={cn(
                    'card p-4 flex items-center gap-4 cursor-pointer hover:border-brand-200 transition-colors',
                    index === 0 && 'border-brand-300 bg-brand-50/30'
                  )}
                >
                  {/* Rank */}
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                    index === 0 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                  )}>
                    {index === 0 ? <CheckCircle className="w-4 h-4" /> : index + 1}
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
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', MATCH_TYPE_STYLES[result.matchType])}>
                        {result.matchType}
                      </span>
                      <span className="text-xs text-slate-400">
                        matched on: <span className="text-slate-600 font-mono">{result.matchedOn}</span>
                      </span>
                    </div>
                  </div>

                  {/* Price + score */}
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">{formatCurrency(result.mrp)}</p>
                    <p className="text-xs text-slate-400">MRP</p>
                    <div className="mt-1 flex items-center gap-1 justify-end">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${Math.round(result.matchScore * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{Math.round(result.matchScore * 100)}%</span>
                    </div>
                  </div>

                  <button className="btn-secondary text-xs px-3 py-1.5 shrink-0">Add to Bill</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions when empty */}
      {!hasSearched && !loading && (
        <div className="card p-8 text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="text-center">
              <Pill className="w-8 h-8 text-brand-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Brand name</p>
            </div>
            <div className="text-slate-300">→</div>
            <div className="text-center">
              <Zap className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Normalize</p>
            </div>
            <div className="text-slate-300">→</div>
            <div className="text-center">
              <Search className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Match</p>
            </div>
            <div className="text-slate-300">→</div>
            <div className="text-center">
              <Barcode className="w-8 h-8 text-purple-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Results</p>
            </div>
          </div>
          <p className="text-slate-600 font-medium">Intelligent Medicine Lookup</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Works with brand names, generic names, short forms, misspellings, compositions, and barcodes.
          </p>
        </div>
      )}
    </div>
  )
}
