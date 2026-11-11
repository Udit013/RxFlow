import { Pill } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The RxFlow mark: a viridian tile with the capsule glyph, plus the wordmark. */
export function BrandMark({ inverted, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'grid place-items-center w-6 h-6 rounded-md',
          inverted ? 'bg-brand-300 text-brand-950' : 'bg-brand-800 text-brand-100'
        )}
      >
        <Pill className="w-3.5 h-3.5" strokeWidth={2.25} />
      </span>
      <span className={cn('font-display font-semibold text-[16px] tracking-[-0.01em]', inverted ? 'text-paper' : 'text-surface-950')}>
        RxFlow
      </span>
    </span>
  )
}
