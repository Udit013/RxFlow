'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title?: ReactNode
  description?: string
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
  title, description, icon: Icon, action, footer, flush, className, children,
}: SectionCardProps) {
  return (
    <div className={cn('card overflow-hidden', className)}>
      {(title || action) && (
        <div className="card-header">
          <div className="min-w-0">
            {title && (
              <h3 className="font-semibold text-surface-900 flex items-center gap-2 truncate">
                {Icon && <Icon className="w-4 h-4 text-brand-600 shrink-0" />}
                <span className="truncate">{title}</span>
              </h3>
            )}
            {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flush ? '' : 'card-body'}>{children}</div>
      {footer && <div className="card-header border-t border-b-0 bg-surface-50/40">{footer}</div>}
    </div>
  )
}
