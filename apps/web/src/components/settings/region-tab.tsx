'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Globe2, Save } from 'lucide-react'
import {
  listRegionProfiles, regionDefaults, resolveRegion, formatMoney, scheduleLabel,
  DRUG_SCHEDULE_CODES, paymentMethodLabel, getFiscalYear,
} from '@rxflow/regional'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Locales offered for number/date formatting and UI language (English, Hindi and Spanish
// interface translations ship today; other locales format numbers/dates and fall back to English).
const LOCALES: [string, string][] = [
  ['en-IN', 'English (India)'], ['hi-IN', 'हिन्दी (India)'], ['en-US', 'English (US)'], ['es-US', 'Español (US)'],
  ['en-GB', 'English (UK)'], ['en-AE', 'English (UAE)'], ['es-ES', 'Español (España)'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'],
]
const COMMON_CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'SGD', 'AUD', 'CAD', 'NPR', 'BDT', 'LKR', 'KES', 'NGN', 'ZAR']

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

interface RegionForm { country: string; currency: string; locale: string; timezone: string; fiscalYearStartMonth: number }

export function RegionTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['tenant'], queryFn: () => api.get('/tenant').then((r) => r.data.data) })
  const [form, setForm] = useState<RegionForm | null>(null)

  useEffect(() => {
    if (data && !form) {
      setForm({
        country: data.country ?? 'IN', currency: data.currency ?? 'INR', locale: data.locale ?? 'en-IN',
        timezone: data.timezone ?? 'Asia/Kolkata', fiscalYearStartMonth: data.fiscalYearStartMonth ?? 4,
      })
    }
  }, [data, form])

  const preview = useMemo(() => (form ? resolveRegion(form) : null), [form])
  const zones = useMemo(timeZones, [])

  const save = useMutation({
    mutationFn: () => api.patch('/tenant', form),
    onSuccess: async () => {
      await authService.refreshProfile() // updates currency, labels and formats across the app
      queryClient.invalidateQueries()
      toast.success('Regional settings saved')
    },
    onError: (e: any) => {
      const err = e.response?.data
      toast.error(err?.details?.[0]?.message ?? err?.error ?? 'Failed to save')
    },
  })

  if (!form || !preview) return <div className="p-8 text-slate-400">Loading...</div>

  const set = (patch: Partial<RegionForm>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const onCountry = (country: string) => {
    // A new country brings its defaults; anything can still be adjusted afterwards.
    const d = regionDefaults(country)
    set({ country: d.country, currency: d.currency, locale: d.locale, timezone: d.timezone, fiscalYearStartMonth: d.fiscalYearStartMonth })
  }
  const changedCountry = data?.country && data.country !== form.country

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="card p-5 space-y-4 lg:col-span-3">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-slate-900">Region & tax</h3>
        </div>
        <p className="text-xs text-slate-500">
          Your country decides the tax system, invoice labels, drug classifications and registers. Currency,
          formats, timezone and fiscal year default from it and can be adjusted.
        </p>

        <div>
          <label className="label" htmlFor="region-country">Country</label>
          <select id="region-country" className="input" value={form.country} disabled={!canEdit} onChange={(e) => onCountry(e.target.value)}>
            {listRegionProfiles().map((p) => <option key={p.code} value={p.code}>{p.flag} {p.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="region-currency">Currency</label>
            <input id="region-currency" className="input font-mono uppercase" list="region-currencies" maxLength={3} value={form.currency}
              disabled={!canEdit} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
            <datalist id="region-currencies">{COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label" htmlFor="region-locale">Language & formats</label>
            <select id="region-locale" className="input" value={form.locale} disabled={!canEdit} onChange={(e) => set({ locale: e.target.value })}>
              {LOCALES.some(([v]) => v === form.locale) ? null : <option value={form.locale}>{form.locale}</option>}
              {LOCALES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="region-tz">Timezone</label>
            {zones.length ? (
              <select id="region-tz" className="input" value={form.timezone} disabled={!canEdit} onChange={(e) => set({ timezone: e.target.value })}>
                {zones.includes(form.timezone) ? null : <option value={form.timezone}>{form.timezone}</option>}
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            ) : (
              <input id="region-tz" className="input" value={form.timezone} disabled={!canEdit} onChange={(e) => set({ timezone: e.target.value })} />
            )}
            <p className="help-text">Defines “today” on the dashboard and month boundaries in reports.</p>
          </div>
          <div>
            <label className="label" htmlFor="region-fy">Fiscal year starts</label>
            <select id="region-fy" className="input" value={form.fiscalYearStartMonth} disabled={!canEdit}
              onChange={(e) => set({ fiscalYearStartMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <p className="help-text">Document numbers restart each fiscal year (e.g. INV/{getFiscalYear(new Date(), form.fiscalYearStartMonth, form.timezone).label}/00001).</p>
          </div>
        </div>

        {changedCountry && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Changing country switches the tax system and labels for <strong>new</strong> documents. Existing invoices keep
            the tax they were issued with. Check your medicines&apos; tax rates and classifications afterwards.
          </div>
        )}

        {canEdit ? (
          <div className="flex justify-end">
            <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              <Save className="w-4 h-4" /> {save.isPending ? 'Saving…' : 'Save regional settings'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Only workspace admins can change regional settings.</p>
        )}
      </div>

      <div className="card p-5 space-y-3 lg:col-span-2 text-sm">
        <h3 className="font-semibold text-slate-900">Preview</h3>
        <dl className="space-y-2">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Money</dt><dd className="font-mono">{formatMoney(1234567.5, preview)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Date</dt>
            <dd>{new Intl.DateTimeFormat(preview.locale, { dateStyle: 'medium', timeZone: preview.timezone }).format(new Date())}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Tax</dt><dd>{preview.tax.label} · default {preview.tax.defaultRate}%</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Tax ID field</dt><dd>{preview.fields.taxId.label}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Licence field</dt><dd className="text-right">{preview.fields.license.label}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Register</dt><dd className="text-right">{preview.register.name}</dd></div>
          <div>
            <dt className="text-slate-500 mb-1">Drug classifications</dt>
            <dd className="flex flex-wrap gap-1">
              {DRUG_SCHEDULE_CODES.map((c) => <span key={c} className="chip">{scheduleLabel(preview, c)}</span>)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 mb-1">Payment methods</dt>
            <dd className="flex flex-wrap gap-1">
              {preview.paymentMethods.map((m) => <span key={m} className="chip">{paymentMethodLabel(preview, m)}</span>)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
