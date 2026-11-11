'use client'

import type { ReactNode } from 'react'

interface AnimatedSectionProps {
  children: ReactNode
  /** Kept for API compatibility — sections no longer animate on scroll. */
  stagger?: string
  delay?: number
  rise?: number
  immediate?: boolean
  className?: string
  as?: 'div' | 'section' | 'article' | 'header' | 'main'
}

/**
 * Page section wrapper. Content is shown immediately: an operations tool shouldn't make
 * people wait for sections to fade in as they scroll. The page itself fades once on load.
 */
export function AnimatedSection({ children, className, as: Tag = 'div' }: AnimatedSectionProps) {
  return <Tag className={className}>{children}</Tag>
}
