'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  icon?: LucideIcon
  /** Right-side actions (buttons, etc.) */
  actions?: ReactNode
  /** Optional secondary info row beneath the title */
  meta?: ReactNode
  className?: string
}

/**
 * Typography carries the hierarchy — an eyebrow in the system's smallest
 * voice, a display-face title, and a quiet description. No icon chips.
 */
export function PageHeader({
  title, description, eyebrow, icon: Icon, actions, meta, className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-surface-300', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title flex items-center gap-2">
          {Icon && <Icon className="w-[18px] h-[18px] text-brand-600 shrink-0" strokeWidth={2.25} />}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="text-[13px] text-surface-500 mt-1 max-w-2xl">{description}</p>
        )}
        {meta && <div className="mt-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  )
}
