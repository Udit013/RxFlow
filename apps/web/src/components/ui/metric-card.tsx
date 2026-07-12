'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

// Each stat carries a colored "tick" — a short ledger rule above the label —
// instead of an icon chip. Color means something; it never decorates.
const TONE_TICK: Record<Tone, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  accent: 'bg-accent-500',
  neutral: 'bg-surface-400',
}

interface MetricCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
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

export function MetricCard({
  label, value, sub, icon: Icon, tone = 'neutral', trend, countUp, href, className, loading,
}: MetricCardProps) {
  const valueRef = useRef<HTMLDivElement>(null)

  // CountUp animation if requested
  useEffect(() => {
    if (typeof countUp !== 'number' || !valueRef.current) return
    const node = valueRef.current
    const obj = { v: 0 }
    const tween = gsap.to(obj, {
      v: countUp,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => {
        const formatted = countUp >= 1000
          ? new Intl.NumberFormat('en-IN').format(Math.round(obj.v))
          : Math.round(obj.v).toString()
        node.textContent = formatted
      },
    })
    return () => { tween.kill() }
  }, [countUp])

  const inner = (
    <div className={cn('card-hover px-4 pt-3 pb-3.5 h-full', className)}>
      {/* ledger tick */}
      <div className={cn('h-[3px] w-5 rounded-full mb-2.5', TONE_TICK[tone])} />

      <div className="flex items-start justify-between gap-2">
        <p className="microlabel">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-surface-400 shrink-0 mt-px" />}
      </div>

      {loading ? (
        <div className="h-7 w-24 skeleton mt-1.5" />
      ) : (
        <div className="flex items-baseline gap-2 mt-1">
          <div
            ref={valueRef}
            className="font-display text-[22px] leading-7 font-semibold text-surface-900 tracking-tight tabular-nums"
          >
            {countUp != null ? '0' : value}
          </div>
          {trend && (
            <span className={cn(
              'text-[11px] font-mono font-medium tabular-nums',
              trend.value >= 0 ? 'text-success-600' : 'text-danger-600'
            )}>
              {trend.value >= 0 ? '+' : '−'}{Math.abs(trend.value)}%
              {trend.label && <span className="text-surface-400 ml-1">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
      {sub && <div className="text-xs text-surface-500 mt-1">{sub}</div>}
    </div>
  )

  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}
