import { cn } from '@/lib/utils'

interface SkeletonRowProps {
  columns: number
  rows?: number
  /** Cell widths for each column — defaults to 100% */
  widths?: (string | number)[]
}

/** Shimmer-loading rows for tables. Pass column count to match your `<thead>`. */
export function SkeletonRow({ columns, rows = 5, widths }: SkeletonRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div
                className={cn('h-3.5 skeleton')}
                style={{ width: widths?.[c] ?? '80%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
