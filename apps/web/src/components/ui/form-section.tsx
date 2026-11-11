import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FormSectionProps {
  title: string
  description?: ReactNode
  /** Red title + border for destructive settings */
  tone?: 'default' | 'danger'
  className?: string
  children: ReactNode
}

/**
 * A settings group: what it is and why on the left, the fields on the right.
 * Stacks on narrow screens. Consecutive sections are divided by a hairline.
 */
export function FormSection({ title, description, tone = 'default', className, children }: FormSectionProps) {
  return (
    <section className={cn('grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10 py-6 first:pt-0 border-t border-surface-200 first:border-t-0', className)}>
      <div>
        <h2 className={cn('text-[14px] font-semibold', tone === 'danger' ? 'text-danger-700' : 'text-surface-950')}>{title}</h2>
        {description && <p className="text-[13px] leading-5 text-surface-500 mt-1">{description}</p>}
      </div>
      <div className={cn('card p-5 min-w-0', tone === 'danger' && 'border-danger-200')}>{children}</div>
    </section>
  )
}
