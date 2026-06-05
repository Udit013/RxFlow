'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, Pill, Users, Truck, ShoppingCart, Receipt, X, ArrowRight, ShoppingBag } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, debounce, formatCurrency, formatDate } from '@/lib/utils'

interface Result {
  kind: 'medicine' | 'customer' | 'supplier' | 'order' | 'invoice'
  id: string
  primary: string
  secondary?: string
  meta?: string
  href: string
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // Global keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Focus input when opened, reset on close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setDebouncedQuery('')
      setActiveIdx(0)
    }
  }, [open])

  // Debounce
  useEffect(() => {
    const fn = debounce((v: string) => setDebouncedQuery(v), 200)
    fn(query)
  }, [query])

  const { data, isFetching } = useQuery({
    queryKey: ['cmdk', debouncedQuery],
    queryFn: () => api.get('/search', { params: { q: debouncedQuery, limit: 5 } }).then((r) => r.data),
    enabled: debouncedQuery.length >= 2,
  })

  // Flatten results into one ordered list for keyboard nav
  const results = useMemo<Result[]>(() => {
    const d = data?.data
    if (!d) return []
    const out: Result[] = []
    for (const m of d.medicines ?? []) {
      out.push({
        kind: 'medicine', id: m.id,
        primary: m.name,
        secondary: `${m.strength} · ${m.dosageForm}`,
        meta: `MRP ${formatCurrency(m.mrp)}`,
        href: `/dashboard/medicines/${m.id}`,
      })
    }
    for (const c of d.customers ?? []) {
      out.push({
        kind: 'customer', id: c.id,
        primary: c.name,
        secondary: c.phone,
        meta: c.outstandingBalance > 0 ? `${formatCurrency(c.outstandingBalance)} due` : '',
        href: `/dashboard/customers/${c.id}`,
      })
    }
    for (const s of d.suppliers ?? []) {
      out.push({
        kind: 'supplier', id: s.id,
        primary: s.name,
        secondary: s.companyName,
        meta: s.phone,
        href: `/dashboard/suppliers/${s.id}`,
      })
    }
    for (const o of d.orders ?? []) {
      out.push({
        kind: 'order', id: o.id,
        primary: o.orderNumber,
        secondary: `${o.type} · ${o.customer?.name ?? o.supplier?.name ?? '—'}`,
        meta: `${formatCurrency(o.total)} · ${formatDate(o.createdAt)}`,
        href: `/dashboard/orders/${o.id}`,
      })
    }
    for (const inv of d.invoices ?? []) {
      out.push({
        kind: 'invoice', id: inv.id,
        primary: inv.invoiceNumber,
        secondary: `${inv.type} · ${inv.customer?.name ?? '—'}`,
        meta: `${formatCurrency(inv.grandTotal)} · ${inv.paymentStatus}`,
        href: `/dashboard/invoices/${inv.id}`,
      })
    }
    return out
  }, [data])

  // Reset active when results change
  useEffect(() => { setActiveIdx(0) }, [results.length])

  // Keyboard nav within palette
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const r = results[activeIdx]
        if (r) navigate(r)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, activeIdx])

  function navigate(r: Result) {
    setOpen(false)
    router.push(r.href)
  }

  if (!open) return null

  // Group results by kind for display
  const groups: Array<{ kind: Result['kind']; label: string; icon: any; items: Result[] }> = []
  const grouped: Record<string, Result[]> = {}
  for (const r of results) {
    if (!grouped[r.kind]) grouped[r.kind] = []
    grouped[r.kind]!.push(r)
  }
  const groupConfig: Array<[Result['kind'], string, any]> = [
    ['medicine', 'Medicines', Pill],
    ['customer', 'Customers', Users],
    ['supplier', 'Suppliers', Truck],
    ['order', 'Orders', ShoppingCart],
    ['invoice', 'Invoices', Receipt],
  ]
  for (const [kind, label, icon] of groupConfig) {
    if (grouped[kind]?.length) groups.push({ kind, label, icon, items: grouped[kind]! })
  }

  // Quick actions when no query
  const quickActions = [
    { label: 'New Sale (POS)', href: '/dashboard/billing', icon: ShoppingBag },
    { label: 'New Purchase', href: '/dashboard/purchases/new', icon: Truck },
    { label: 'Customers', href: '/dashboard/customers', icon: Users },
    { label: 'Reports', href: '/dashboard/reports', icon: Receipt },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-start justify-center pt-[12vh] p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicines, customers, suppliers, orders, invoices..."
            className="flex-1 outline-none text-sm placeholder:text-slate-400"
          />
          {isFetching && debouncedQuery.length >= 2 && (
            <span className="text-xs text-slate-400">Searching...</span>
          )}
          <kbd className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">ESC</kbd>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {/* No query → quick actions */}
          {debouncedQuery.length < 2 && (
            <div className="p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 py-2">Quick actions</p>
              {quickActions.map((a) => (
                <button
                  key={a.href}
                  onClick={() => { setOpen(false); router.push(a.href) }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left',
                    'hover:bg-brand-50 text-slate-700'
                  )}
                >
                  <a.icon className="w-4 h-4 text-slate-400" />
                  {a.label}
                  <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-300" />
                </button>
              ))}
              <p className="text-[11px] text-slate-400 px-3 pt-3">
                Tip: Type 2+ characters to search. ↑↓ to navigate, ⏎ to open.
              </p>
            </div>
          )}

          {/* Results */}
          {debouncedQuery.length >= 2 && results.length === 0 && !isFetching && (
            <div className="p-12 text-center text-slate-400 text-sm">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {groups.map((g) => {
            let baseIdx = 0
            for (const gg of groups) {
              if (gg.kind === g.kind) break
              baseIdx += gg.items.length
            }
            return (
              <div key={g.kind} className="py-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 py-2 flex items-center gap-1.5">
                  <g.icon className="w-3 h-3" /> {g.label}
                </p>
                {g.items.map((r, i) => {
                  const globalIdx = baseIdx + i
                  const isActive = globalIdx === activeIdx
                  return (
                    <button
                      key={r.id}
                      onClick={() => navigate(r)}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-left text-sm',
                        isActive ? 'bg-brand-50' : 'hover:bg-slate-50'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{r.primary}</p>
                        {r.secondary && <p className="text-xs text-slate-500 truncate">{r.secondary}</p>}
                      </div>
                      {r.meta && <p className="text-xs text-slate-500 shrink-0">{r.meta}</p>}
                      <ArrowRight className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-brand-500' : 'text-slate-300')} />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
