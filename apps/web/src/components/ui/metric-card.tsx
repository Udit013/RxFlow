'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

const TONE_STYLES: Record<Tone, { iconBg: string; iconText: string; accent: string }> = {
  brand:   { iconBg: 'bg-brand-50',    iconText: 'text-brand-600',   accent: 'before:bg-brand-500' },
  success: { iconBg: 'bg-success-50',  iconText: 'text-success-600', accent: 'before:bg-success-500' },
  warning: { iconBg: 'bg-warning-50',  iconText: 'text-warning-600', accent: 'before:bg-warning-500' },
  danger:  { iconBg: 'bg-danger-50',   iconText: 'text-danger-600',  accent: 'before:bg-danger-500' },
  accent:  { iconBg: 'bg-accent-50',   iconText: 'text-accent-600',  accent: 'before:bg-accent-500' },
  neutral: { iconBg: 'bg-surface-100', iconText: 'text-surface-600', accent: 'before:bg-surface-400' },
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
  label, value, sub, icon: Icon, tone = 'brand', trend, countUp, href, className, loading,
}: MetricCardProps) {
  const tones = TONE_STYLES[tone]
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
    <div
      className={cn(
        'relative overflow-hidden group',
        'card-hover p-5 flex flex-col gap-1.5',
        // left accent stripe
        'before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:rounded-r-full',
        tones.accent,
        'before:opacity-0 hover:before:opacity-100 before:transition-opacity',
        className
      )}
    >
      <div className="flex items-start justify-between mb-1">
        {Icon && (
          <span className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            tones.iconBg, tones.iconText,
            'transition-transform group-hover:scale-110'
          )}>
            <Icon className="w-4.5 h-4.5" />
          </span>
        )}
        {trend && (
          <span className={cn(
            'text-[11px] font-semibold px-2 py-0.5 rounded-full',
            trend.value >= 0 ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
          )}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
            {trend.label && <span className="font-normal opacity-70 ml-1">{trend.label}</span>}
          </span>
        )}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">{label}</p>
      {loading ? (
        <div className="h-7 w-24 skeleton mt-0.5" />
      ) : (
        <div
          ref={valueRef}
          className="text-2xl font-bold text-surface-900 tracking-tight tabular-nums"
        >
          {countUp != null ? '0' : value}
        </div>
      )}
      {sub && <div className="text-xs text-surface-500 mt-0.5">{sub}</div>}
    </div>
  )

  return href ? <Link href={href} className="block">{inner}</Link> : inner
}
