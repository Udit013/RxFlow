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

export function PageHeader({
  title, description, eyebrow, icon: Icon, actions, meta, className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-50 text-brand-600 border border-brand-200 items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="page-title flex items-center gap-2">
              {Icon && <Icon className="sm:hidden w-5 h-5 text-brand-600" />}
              <span className="truncate">{title}</span>
            </h1>
            {description && (
              <p className="text-sm text-surface-500 mt-1 max-w-2xl">{description}</p>
            )}
            {meta && <div className="mt-2">{meta}</div>}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  )
}
