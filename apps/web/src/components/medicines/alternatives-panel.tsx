'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, GitCompare, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CountryTag, SourceBadge, formLabel } from './catalog-labels'

interface Alternative {
  id: string
  name: string
  brandName: string
  manufacturerName: string
  dosageForm: string
  dosageFormDetail: string | null
  route: string | null
  composition: string
  country: string | null
  dataSource: string | null
  sourceUrl: string | null
  isVerified: boolean
  therapeuticClass: string | null
  atcCode: string | null
  inYourMarket: boolean
  inStock: number
  differences: string[]
}

type GroupId = 'sameComposition' | 'variants' | 'combinations' | 'similarUse'

const GROUPS: { id: GroupId; label: string; help: string }[] = [
  { id: 'sameComposition', label: 'Same composition', help: 'Same active ingredients, strengths, dosage form, release and route. Brands can still differ in excipients and bioequivalence.' },
  { id: 'variants', label: 'Variants', help: 'Same active ingredients in another strength, form, release mechanism or route — not a like-for-like swap.' },
  { id: 'combinations', label: 'Combinations', help: 'Products that share an active ingredient but add or lack others. Not interchangeable.' },
  { id: 'similarUse', label: 'Similar use', help: 'Different active ingredients in the same therapeutic (ATC) group. Not interchangeable — a prescriber decision.' },
]

export function AlternativesPanel({ medicineId, composition }: { medicineId: string; composition: string }) {
  const [group, setGroup] = useState<GroupId>('sameComposition')
  const [marketOnly, setMarketOnly] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['medicine-alternatives', medicineId],
    queryFn: () => api.get(`/medicines/${medicineId}/alternatives`).then((r) => r.data.data),
  })

  const rows: Alternative[] = useMemo(() => {
    const list: Alternative[] = data?.[group] ?? []
    return marketOnly ? list.filter((a) => a.inYourMarket) : list
  }, [data, group, marketOnly])
  const active = GROUPS.find((g) => g.id === group)!

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-brand-600" /> Alternatives &amp; variants
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Compared with {composition || 'this product'}</p>
        </div>
        {data?.countryAvailability?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <span>Available as this ingredient in:</span>
            {data.countryAvailability.map((c: { country: string | null; products: number }) => (
              <span key={c.country ?? 'intl'} className="badge-neutral"><CountryTag code={c.country} /> · {c.products}</span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{data?.notice ?? 'Shown for reference only — not a statement that products are interchangeable.'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div role="tablist" className="flex flex-wrap gap-1">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cn('px-3 py-1.5 rounded-md text-sm', group === g.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}
              >
                {g.label} <span className="text-xs text-slate-400">{data?.[g.id]?.length ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={marketOnly} onChange={(e) => setMarketOnly(e.target.checked)} aria-label="Only my market" /> Only my market
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-2">{active.help}</p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Finding alternatives…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {group === 'similarUse' && !data?.base?.atcCode
            ? 'No therapeutic classification for this composition yet — add an ATC code to see similar-use products.'
            : 'Nothing found in this group.'}
        </div>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">Product</th>
                <th className="text-left px-3 py-2">Composition</th>
                <th className="text-left px-3 py-2">Form</th>
                <th className="text-left px-3 py-2">Manufacturer</th>
                <th className="text-left px-3 py-2">Market</th>
                <th className="text-left px-3 py-2">Differences</th>
                <th className="text-right px-3 py-2">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 100).map((a) => (
                <tr key={a.id} className={cn(!a.inYourMarket && 'bg-slate-50/50')}>
                  <td className="px-3 py-2 align-top">
                    <Link href={`/dashboard/medicines/${a.id}`} className="font-medium text-slate-900 hover:text-brand-600">{a.name}</Link>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <SourceBadge source={a.dataSource} verified={a.isVerified} />
                      {a.sourceUrl && (
                        <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-brand-600" aria-label="Open the source record">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{a.composition || '—'}</td>
                  <td className="px-3 py-2 align-top text-slate-600">
                    {formLabel(a.dosageForm)}
                    {(a.dosageFormDetail || a.route) && <p className="text-2xs text-slate-400">{[a.dosageFormDetail, a.route].filter(Boolean).join(' · ')}</p>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600">{a.manufacturerName}</td>
                  <td className="px-3 py-2 align-top text-xs">
                    <CountryTag code={a.country} />
                    {!a.inYourMarket && <p className="text-2xs text-slate-400">other market</p>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {a.differences.length === 0
                      ? <span className="text-2xs text-slate-400">—</span>
                      : <div className="flex flex-wrap gap-1">{a.differences.map((d) => <span key={d} className="badge-warning text-2xs">{d}</span>)}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    {a.inStock > 0 ? <span className="badge-success">{a.inStock}</span> : <span className="text-2xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && <p className="px-3 py-2 text-xs text-slate-400">Showing 100 of {rows.length}.</p>}
        </div>
      )}
    </div>
  )
}
