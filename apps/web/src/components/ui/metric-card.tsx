'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import type { LucideIcon } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

// Colour only where it carries meaning: a small status dot for figures that need attention.
const TONE_DOT: Partial<Record<Tone, string>> = {
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  accent: 'bg-warning-500',
}

interface MetricCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** Accepted for compatibility; figures are presented without icons. */
  icon?: LucideIcon
  tone?: Tone
  trend?: { value: number; label?: string }
  /** Animate the numeric value from 0 to its final number on mount */
  countUp?: number
  /** Wrap in a Link */
  href?: string
  className?: string
  loading?: boolean
}

/**
 * One figure in a ledger strip. Designed to sit inside <StatGrid>, which draws the
 * hairlines between cells — a row of figures reads as one instrument, not a pile of cards.
 */
export function MetricCard({
  label, value, sub, tone = 'neutral', trend, countUp, href, className, loading,
}: MetricCardProps) {
  const valueRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof countUp !== 'number' || !valueRef.current) return
    const node = valueRef.current
    const obj = { v: 0 }
    const tween = gsap.to(obj, {
      v: countUp,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: () => {
        node.textContent = countUp >= 1000 ? formatNumber(Math.round(obj.v)) : Math.round(obj.v).toString()
      },
    })
    return () => { tween.kill() }
  }, [countUp])

  const dot = TONE_DOT[tone]
  const inner = (
    <div className={cn('h-full px-4 py-3.5', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-surface-500">
        {dot && <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />}
        <span className="truncate">{label}</span>
      </p>

      {loading ? (
        <div className="h-6 w-20 skeleton mt-2" />
      ) : (
        <div className="flex items-baseline gap-2 mt-1">
          <div
            ref={valueRef}
            className="font-display text-[22px] leading-7 font-semibold text-surface-950 tracking-[-0.02em] tabular-nums"
          >
            {countUp != null ? '0' : value}
          </div>
          {trend && (
            <span className={cn(
              'text-xs font-medium tabular-nums',
              trend.value >= 0 ? 'text-success-600' : 'text-danger-600'
            )}>
              {trend.value >= 0 ? '+' : '−'}{Math.abs(trend.value)}%
              {trend.label && <span className="text-surface-400 ml-1">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
      {sub && <div className="text-xs text-surface-500 mt-0.5 truncate">{sub}</div>}
    </div>
  )

  return href
    ? <Link href={href} className="block h-full transition-colors hover:bg-surface-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600">{inner}</Link>
    : inner
}

/**
 * A bordered strip of figures separated by hairlines. Pass the column classes,
 * e.g. `grid-cols-2 lg:grid-cols-4`. Rows that don't fill stay clean.
 */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className={cn('grid -mr-px -mb-px [&>*]:shadow-[inset_-1px_-1px_0_var(--color-surface-200)]', className)}>
        {children}
      </div>
    </div>
  )
}
