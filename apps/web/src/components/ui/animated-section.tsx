'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { cn } from '@/lib/utils'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

interface AnimatedSectionProps {
  children: ReactNode
  /** CSS selector (relative to this container) for staggered child entrance */
  stagger?: string
  /** Delay before the section animates in (seconds) */
  delay?: number
  /** Animation distance in pixels */
  rise?: number
  /** Disable scroll trigger; animate immediately on mount */
  immediate?: boolean
  className?: string
  as?: 'div' | 'section' | 'article' | 'header' | 'main'
}

/**
 * AnimatedSection — wraps content with a GSAP scroll-triggered fade+rise.
 *
 * Defaults are tuned for ERP density: short distance (16px), fast (400ms),
 * single ease curve. Respects prefers-reduced-motion via global CSS.
 *
 * Pass `stagger=".stagger-item"` to animate matching children in sequence.
 */
export function AnimatedSection({
  children,
  stagger,
  delay = 0,
  rise = 16,
  immediate = false,
  className,
  as: Tag = 'div',
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Skip animation entirely under reduced-motion (CSS also guards)
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      el.classList.add('gsap-anim-ready')
      const items = stagger ? el.querySelectorAll(stagger) : []
      items.forEach((n) => (n as HTMLElement).classList.add('gsap-anim-ready'))
      return
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { duration: 0.45, ease: 'power3.out' },
        scrollTrigger: immediate
          ? undefined
          : {
              trigger: el,
              start: 'top 90%',
              once: true,
            },
      })

      tl.fromTo(
        el,
        { opacity: 0, y: rise },
        { opacity: 1, y: 0, delay }
      )

      if (stagger) {
        const items = el.querySelectorAll(stagger)
        if (items.length > 0) {
          tl.fromTo(
            items,
            { opacity: 0, y: rise * 0.6 },
            { opacity: 1, y: 0, stagger: 0.06 },
            '-=0.25'
          )
        }
      }

      el.classList.add('gsap-anim-ready')
    }, ref)

    return () => ctx.revert()
  }, [stagger, delay, rise, immediate])

  return (
    <Tag ref={ref as any} className={cn('gsap-anim-init', className)}>
      {children}
    </Tag>
  )
}
