'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Database, ExternalLink, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { CountryTag } from '@/components/medicines/catalog-labels'

interface Source {
  id: string
  name: string
  publisher: string
  country: string | null
  url: string
  license: string
  licenseUrl: string | null
  attribution: string
  notes: string | null
  version: string | null
  retrievedAt: string | null
  recordCount: number
}

export default function MedicineSourcesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['medicine-sources'],
    queryFn: () => api.get('/medicines/sources').then((r) => r.data.data),
  })
  const sources: Source[] = data?.sources ?? []
  const catalog: { country: string | null; dataSource: string | null; count: number }[] = data?.catalog ?? []
  const byCountry = new Map<string, number>()
  for (const c of catalog) byCountry.set(c.country ?? '', (byCountry.get(c.country ?? '') ?? 0) + c.count)

  return (
    <div className="space-y-5">
      <Link href="/dashboard/medicines" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to medicines
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medicine data sources</h1>
          <p className="text-sm text-slate-500">Where the shared catalog comes from, under which licence, and how it is checked.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([country, count]) => (
          <div key={country || 'intl'} className="metric-card">
            <p className="text-xs text-slate-500"><CountryTag code={country || null} /></p>
            <p className="text-lg font-bold text-slate-900">{count.toLocaleString()}</p>
            <p className="text-xs text-slate-500">shared products</p>
          </div>
        ))}
      </div>

      <div className="card p-4 text-sm text-slate-600 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0" />
        <div className="space-y-1">
          <p><strong>How the data is checked.</strong> Products come only from regulators&apos; official open datasets. Every active-ingredient name is resolved against the U.S. National Library of Medicine&apos;s RxNorm vocabulary, every strength must parse, and the build fails on any contradiction between route and dosage form (an inhaled product shown as a tablet, an injectable shown as a syrup).</p>
          <p>The data is a reference, not a substitute for the product label. Same composition does not mean interchangeable, and prices are not published by these sources — set your own.</p>
          <p>Missing or different in your market? Add the medicine manually or edit any entry — edits of shared rows are saved as your pharmacy&apos;s own copy.</p>
        </div>
      </div>

      {isLoading ? <div className="p-8 text-slate-400">Loading…</div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sources.map((s) => (
            <div key={s.id} className="card p-4 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 flex items-center gap-2"><Database className="w-4 h-4 text-brand-600" /> {s.name}</p>
                  <p className="text-xs text-slate-500">{s.publisher} · <CountryTag code={s.country} /></p>
                </div>
                {s.recordCount > 0 && <span className="badge-neutral">{s.recordCount.toLocaleString()} rows</span>}
              </div>
              <p className="text-slate-600">{s.attribution}</p>
              {s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}
              <p className="text-xs text-slate-500">
                Licence: {s.licenseUrl ? <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{s.license}</a> : s.license}
                {s.retrievedAt && <> · snapshot {formatDate(s.retrievedAt)}</>}
              </p>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs">
                <ExternalLink className="w-3 h-3" /> {s.url.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
