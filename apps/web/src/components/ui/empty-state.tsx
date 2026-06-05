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
          'mb-3 rounded-2xl bg-gradient-to-br from-surface-100 to-surface-50',
          'border border-surface-200/60 flex items-center justify-center',
          iconSize
        )}>
          <Icon className="w-1/2 h-1/2 text-surface-400" />
        </div>
      )}
      <h3 className="font-semibold text-surface-800">{title}</h3>
      {description && <p className="text-sm text-surface-500 mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
