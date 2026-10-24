'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp, TrendingDown, Package, Pill, Award, Pencil, FlaskConical, Database, ExternalLink, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { useRegion } from '@/lib/region'
import { scheduleLabel, type DrugScheduleCode } from '@rxflow/regional'
import { displayIngredient, formatComposition, formatStrength } from '@rxflow/types'
import { MedicineMasterModal } from '@/components/medicines/medicine-master-modal'
import { AlternativesPanel } from '@/components/medicines/alternatives-panel'
import { CountryTag, SourceBadge, formLabel } from '@/components/medicines/catalog-labels'

export default function MedicineDetailPage() {
  const region = useRegion()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id
  const [editing, setEditing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['medicine', id],
    queryFn: () => api.get(`/medicines/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: historyData } = useQuery({
    queryKey: ['medicine-purchase-history', id],
    queryFn: () => api.get(`/medicines/${id}/purchase-history`).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>
  if (!data?.data) return <div className="p-8 text-slate-400">Medicine not found</div>

  const m = data.data
  const history = historyData?.data
  const stats = history?.stats
  const suppliers = history?.suppliers ?? []
  const batches = history?.batches ?? []
  const compositions: { ingredient: string; salt: string | null; strengthNum: number | null; unit: string }[] = m.compositions ?? []
  const otherMarket = m.ownerTenantId === null && m.country && m.country !== region.country

  return (
    <div className="space-y-5">
      <Link href="/dashboard/medicines" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to medicines
      </Link>

      <div className="card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Pill className="w-5 h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{m.name}</h1>
                <p className="text-sm text-slate-500">{m.genericName} • {m.strength} • {formLabel(m.dosageForm)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-sm">
              <span className="text-slate-600">By <strong>{m.manufacturerName}</strong></span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">{region.fields.productCode.label} <span className="font-mono">{m.hsn}</span></span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">{region.tax.label} {m.gstRate}%</span>
              <span className={m.schedule === 'OTC' ? 'badge-success' : 'badge-warning'} title={region.drugSchedules[m.schedule as DrugScheduleCode]?.description}>
                {scheduleLabel(region, m.schedule)}
              </span>
              <span className="badge-neutral"><CountryTag code={m.country} /></span>
              <SourceBadge source={m.dataSource} verified={m.isVerified} />
            </div>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
            <div className="sm:text-right">
              <p className="text-xs text-slate-500">MRP</p>
              <p className="text-2xl font-bold text-slate-900">{m.mrp > 0 ? formatCurrency(m.mrp) : <span className="text-base font-medium text-slate-400">Not set</span>}</p>
              <p className="text-xs text-slate-500 mt-1">{m.packSize}</p>
            </div>
            <button onClick={() => setEditing(true)} className="btn-secondary">
              <Pencil className="w-4 h-4" /> Edit
            </button>
          </div>
        </div>
        {otherMarket && (
          <p className="mt-4 text-xs text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> This entry is from another market&apos;s catalog — shown for reference.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-brand-600" /> Composition &amp; classification</h3>
          </div>
          <div className="p-4 space-y-4 text-sm">
            {compositions.length === 0 ? (
              <p className="text-slate-400">No structured composition yet. {m.composition ? `Label text: “${m.composition}”.` : ''} Use Edit to add the active ingredients.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-xs uppercase text-slate-500"><th className="text-left py-1">Active ingredient</th><th className="text-left py-1">Salt / form</th><th className="text-right py-1">Strength</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {compositions.map((c, i) => (
                    <tr key={i}>
                      <td className="py-1.5 font-medium text-slate-900">{displayIngredient(c.ingredient)}</td>
                      <td className="py-1.5 text-slate-500">{c.salt ?? '—'}</td>
                      <td className="py-1.5 text-right">{formatStrength(c.strengthNum, c.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div><dt className="text-xs text-slate-500">Dosage form</dt><dd>{formLabel(m.dosageForm)}{m.dosageFormDetail ? ` — ${m.dosageFormDetail.toLowerCase()}` : ''}</dd></div>
              <div><dt className="text-xs text-slate-500">Route</dt><dd>{m.route ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">ATC code</dt><dd className="font-mono">{m.atcCode ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Therapeutic class</dt><dd>{m.therapeuticClass ?? m.category ?? '—'}</dd></div>
            </dl>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Database className="w-4 h-4 text-brand-600" /> Data source</h3>
          </div>
          <div className="p-4 space-y-3 text-sm">
            {m.forkedFrom && (
              <p className="text-slate-600">
                Your pharmacy&apos;s edited copy of{' '}
                <Link href={`/dashboard/medicines/${m.forkedFrom.id}`} className="text-brand-600 hover:underline">{m.forkedFrom.name}</Link>.
                The shared entry other pharmacies use is unchanged.
              </p>
            )}
            {m.source ? (
              <>
                <p><strong>{m.source.name}</strong> — {m.source.publisher}</p>
                <p className="text-slate-600">{m.source.attribution}</p>
                <p className="text-xs text-slate-500">
                  Licence: {m.source.licenseUrl ? <a href={m.source.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{m.source.license}</a> : m.source.license}
                  {m.sourceRetrievedAt && <> · retrieved {formatDate(m.sourceRetrievedAt)}</>}
                </p>
                {m.source.notes && <p className="text-xs text-slate-500">{m.source.notes}</p>}
                {m.sourceUrl && (
                  <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs">
                    <ExternalLink className="w-3 h-3" /> View the official record
                  </a>
                )}
              </>
            ) : (
              <p className="text-slate-600">{m.dataSource === 'BULK_IMPORT' ? 'Imported from a CSV by your pharmacy.' : 'Added manually by your pharmacy.'}</p>
            )}
            <p className="text-xs text-slate-500">
              {m.isVerified
                ? 'Active ingredients verified against the U.S. National Library of Medicine RxNorm vocabulary.'
                : 'Not independently verified — check the label before relying on these details.'}
            </p>
          </div>
        </div>
      </div>

      <AlternativesPanel
        medicineId={m.id}
        composition={compositions.length ? formatComposition(compositions.map((c) => ({ name: c.ingredient, strength: c.strengthNum, unit: c.unit || null }))) : (m.composition ?? '')}
      />

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="metric-card">
            <p className="text-xs text-slate-500 uppercase">Last Buy Price</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(stats.lastPurchasePrice)}</p>
            <p className="text-xs text-slate-500 mt-1">from {stats.lastSupplierName ?? '—'}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-slate-500 uppercase">Avg Buy Price</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(stats.avgPurchasePrice)}</p>
            <p className="text-xs text-slate-500 mt-1">over {stats.totalBatches} batches</p>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase">Min</p>
              <TrendingDown className="w-3.5 h-3.5 text-green-500" />
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(stats.minPurchasePrice)}</p>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase">Max</p>
              <TrendingUp className="w-3.5 h-3.5 text-red-500" />
            </div>
            <p className="text-lg font-bold text-red-600">{formatCurrency(stats.maxPurchasePrice)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-brand-600" /> Supplier Comparison
            </h3>
            <span className="text-xs text-slate-500">{suppliers.length} suppliers</span>
          </div>
          {suppliers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No purchase history yet
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Supplier</th>
                  <th className="text-right px-3 py-2">Last</th>
                  <th className="text-right px-3 py-2">Avg</th>
                  <th className="text-center px-3 py-2">Batches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s: any, i: number) => (
                  <tr key={s.supplierId} className={cn(i === 0 && 'bg-green-50')}>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/suppliers/${s.supplierId}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {s.supplierName}
                      </Link>
                      {i === 0 && <span className="ml-2 badge-success text-[10px]">Best avg</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(s.lastPurchasePrice)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(s.avgPurchasePrice)}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{s.batchCount}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-slate-900">Recent Batches</h3>
          </div>
          {batches.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No batches recorded</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {batches.slice(0, 15).map((b: any) => (
                <div key={b.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Batch {b.batchNumber}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(b.createdAt)} • {b.quantity} units • {b.supplier?.name ?? 'no supplier'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 text-sm">{formatCurrency(b.purchasePrice)}</p>
                    <p className="text-xs text-slate-500">Exp {formatDate(b.expiryDate, 'MM/YY')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <MedicineMasterModal
          medicine={m}
          onClose={() => setEditing(false)}
          onSaved={(saved, forked) => { if (forked && saved?.id && saved.id !== m.id) router.push(`/dashboard/medicines/${saved.id}`) }}
        />
      )}
    </div>
  )
}
