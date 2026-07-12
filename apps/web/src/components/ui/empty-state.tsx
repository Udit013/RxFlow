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

export function EmptyState({
  icon: Icon, title, description, action, className, size = 'default',
}: EmptyStateProps) {
  const py = size === 'compact' ? 'py-8' : size === 'large' ? 'py-20' : 'py-14'
  const iconSize = size === 'compact' ? 'w-10 h-10' : size === 'large' ? 'w-16 h-16' : 'w-12 h-12'

  return (
    <div className={cn('flex flex-col items-center text-center px-6', py, className)}>
      {Icon && (
        <div className={cn(
          // an empty ledger cell: dashed hairline frame, nothing inside yet
          'mb-3 rounded-sm border border-dashed border-surface-300 bg-surface-50',
          'flex items-center justify-center',
          iconSize
        )}>
          <Icon className="w-1/2 h-1/2 text-surface-400" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="font-display font-semibold text-surface-800">{title}</h3>
      {description && <p className="text-sm text-surface-500 mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
