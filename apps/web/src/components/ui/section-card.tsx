'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title?: ReactNode
  description?: string
  /** Accepted for compatibility; section titles are type-only. */
  icon?: LucideIcon
  /** Right-side header action (button, link, count) */
  action?: ReactNode
  /** Footer content rendered inside a divided strip at the bottom */
  footer?: ReactNode
  /** Render children without internal padding — useful for tables */
  flush?: boolean
  className?: string
  children: ReactNode
}

export function SectionCard({
  title, description, action, footer, flush, className, children,
}: SectionCardProps) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || action) && (
        <div className="card-header">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-surface-900 truncate">{title}</h2>}
            {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
          </div>
          {action && <div className="shrink-0 text-xs">{action}</div>}
        </div>
      )}
      <div className={flush ? '' : 'card-body'}>{children}</div>
      {footer && <div className="px-4 py-2.5 border-t border-surface-200 bg-surface-50/60 flex items-center justify-between gap-3">{footer}</div>}
    </section>
  )
}
