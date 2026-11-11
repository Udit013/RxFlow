'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** Use 'compact' inside narrow cards, 'default' for full-page empties */
  size?: 'compact' | 'default' | 'large'
}

/** A calm, left-weighted note — what's missing and the one thing to do about it. */
export function EmptyState({
  icon: Icon, title, description, action, className, size = 'default',
}: EmptyStateProps) {
  const py = size === 'compact' ? 'py-8' : size === 'large' ? 'py-20' : 'py-14'
  return (
    <div className={cn('flex flex-col items-center text-center px-6', py, className)}>
      {Icon && <Icon aria-hidden="true" className="w-5 h-5 mb-3 text-surface-400" strokeWidth={1.75} />}
      <h3 className="text-[13px] font-semibold text-surface-800">{title}</h3>
      {description && <p className="text-[13px] leading-5 text-surface-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
