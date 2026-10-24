import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Which edge a dropdown should align to so it stays on screen: 'left' (opens rightwards) unless
 * the trigger sits too close to the right edge of the viewport, then 'right' (opens leftwards).
 * Measured each time the menu opens, since toolbars wrap differently at every width.
 */
export function useMenuAlign(triggerRef: RefObject<HTMLElement | null>, open: boolean, menuWidth: number): 'left' | 'right' {
  const [align, setAlign] = useState<'left' | 'right'>('left')
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setAlign(rect.left + menuWidth > window.innerWidth - 16 ? 'right' : 'left')
  }, [open, triggerRef, menuWidth])
  return align
}
