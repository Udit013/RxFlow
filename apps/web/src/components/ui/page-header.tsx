'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  /** Accepted for compatibility; page titles are type-only. */
  icon?: LucideIcon
  /** Right-side actions (buttons, etc.) */
  actions?: ReactNode
  /** Optional secondary info row beneath the title */
  meta?: ReactNode
  className?: string
}

/**
 * Type carries the hierarchy: a quiet context line, a display-face title and a
 * one-line description. Actions align to the title's baseline on the right.
 */
export function PageHeader({
  title, description, eyebrow, actions, meta, className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col sm:flex-row sm:items-end sm:justify-between gap-x-6 gap-y-3 mb-6', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title truncate">{title}</h1>
        {description && (
          <p className="text-[13px] leading-5 text-surface-500 mt-1 max-w-2xl">{description}</p>
        )}
        {meta && <div className="mt-2.5">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  )
}
