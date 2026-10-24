'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Globe2 } from 'lucide-react'
import { getRegionProfile, REGION_PROFILES } from '@rxflow/regional'
import { cn } from '@/lib/utils'
import { useMenuAlign } from '@/hooks/use-menu-align'

export interface MarketOption {
  code: string // country code, or 'INTL' for products with no country
  count?: number
}

export function marketName(code: string): string {
  if (code === 'INTL') return 'International'
  return REGION_PROFILES[code] ? getRegionProfile(code).name : code
}
function marketFlag(code: string): string {
  if (code === 'INTL') return '🌐'
  return REGION_PROFILES[code] ? getRegionProfile(code).flag : ''
}

/**
 * Choose one, several or all markets. The home market is listed first; the summary on the
 * button reads "India", "India + 1" or "All markets".
 */
export function MarketPicker({
  options,
  value,
  onChange,
  home,
  label = 'Markets',
}: {
  options: MarketOption[]
  value: string[]
  onChange: (markets: string[]) => void
  home: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const align = useMenuAlign(ref, open, 256)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const ordered = [...options].sort((a, b) => Number(b.code === home) - Number(a.code === home) || marketName(a.code).localeCompare(marketName(b.code)))
  const all = ordered.map((o) => o.code)
  const allSelected = all.length > 0 && all.every((c) => value.includes(c))
  const summary = allSelected && all.length > 1
    ? 'All markets'
    : value.length === 0
      ? 'No market'
      : `${marketName(value[0]!)}${value.length > 1 ? ` + ${value.length - 1}` : ''}`

  function toggle(code: string) {
    const next = value.includes(code) ? value.filter((c) => c !== code) : [...value, code]
    if (next.length) onChange(next) // keep at least one market selected
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary whitespace-nowrap"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
      >
        <Globe2 className="w-4 h-4" /> {summary} <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full mt-1 w-64 max-w-[calc(100vw-2rem)] bg-white border border-surface-200 rounded-lg shadow-dropdown z-30 p-1.5',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <div className="flex gap-1 px-1 pb-1.5 mb-1 border-b border-surface-100">
            <button type="button" className="text-xs text-brand-600 hover:underline px-1" onClick={() => onChange([home])}>My market</button>
            <span className="text-surface-300">·</span>
            <button type="button" className="text-xs text-brand-600 hover:underline px-1" onClick={() => onChange(all)}>All markets</button>
          </div>
          {ordered.map((o) => (
            <label key={o.code} className={cn('flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-surface-50 cursor-pointer')}>
              <input type="checkbox" checked={value.includes(o.code)} onChange={() => toggle(o.code)} aria-label={marketName(o.code)} />
              <span className="flex-1">{marketFlag(o.code)} {marketName(o.code)}{o.code === home && <span className="text-2xs text-surface-400"> · yours</span>}</span>
              {o.count !== undefined && <span className="text-2xs text-surface-400 tabular-nums">{o.count.toLocaleString()}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
