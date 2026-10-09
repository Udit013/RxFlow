'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n'

/**
 * First-load splash.
 *
 * Server-rendered with the page, so it is the very first thing painted — before the JS bundle
 * downloads — and it lifts the moment React hydrates. There is deliberately no minimum display
 * time: on a warm cache it is a ~300ms cross-fade, on a cold start it covers the blank,
 * unstyled interval. Client-side navigations never show it again (the component stays mounted
 * in the root layout, already `gone`).
 *
 * Fail-safes (see globals.css): hidden for print, hidden without JS (<noscript>), and a CSS-only
 * timeout fades it out even if hydration throws, so it can never trap the user.
 */
export function SplashScreen() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<'visible' | 'leaving' | 'gone'>('visible')

  useEffect(() => {
    // Wait one frame so the hydrated tree has painted underneath before we fade. rAF is
    // paused in background tabs, so a short timer guarantees progress there too.
    const leave = () => setPhase((p) => (p === 'visible' ? 'leaving' : p))
    const raf = requestAnimationFrame(leave)
    const fallback = setTimeout(leave, 120)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'leaving') return
    const t = setTimeout(() => setPhase('gone'), 320)
    return () => clearTimeout(t)
  }, [phase])

  // Thermal-receipt print views open in their own window and print immediately.
  if (phase === 'gone' || pathname?.startsWith('/print')) return null

  return (
    <div
      id="rx-splash"
      className={phase === 'leaving' ? 'rx-splash rx-splash--leaving' : 'rx-splash'}
      role="status"
      aria-live="polite"
      aria-busy={phase === 'visible'}
      aria-hidden={phase === 'leaving'}
    >
      <SplashContent />
    </div>
  )
}

/** Wordmark + progress rule, shared by the first-load splash and the session-restore loader. */
function SplashContent() {
  return (
    <div className="rx-splash__inner">
      <div className="rx-splash__mark" aria-hidden="true">
        {/* Pill glyph — same shape as the lucide `Pill` in the sidebar wordmark */}
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
          <path d="m8.5 8.5 7 7" />
        </svg>
      </div>
      <p className="rx-splash__word">RxFlow</p>
      <p className="rx-splash__tag">Pharmacy OS</p>
      <div className="rx-splash__rule" aria-hidden="true">
        <span />
      </div>
      <span className="sr-only">Loading RxFlow…</span>
    </div>
  )
}

/**
 * Full-screen loader with the splash look, for waits after hydration — e.g. restoring the
 * session on a page load, which can take a while when the free-tier API is waking up.
 */
export function AppLoader() {
  const t = useT()
  // A cold start on the free hosting plan can take up to a minute. After a few seconds, say
  // so — a silent spinner that long reads as "broken".
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="rx-splash" role="status" aria-live="polite" aria-busy="true" style={{ animation: 'none' }}>
      <SplashContent />
      <p className={slow ? 'rx-splash__note rx-splash__note--shown' : 'rx-splash__note'} aria-hidden={!slow}>
        {t('Waking up the server — the first visit after a quiet spell can take up to a minute.')}
      </p>
    </div>
  )
}
