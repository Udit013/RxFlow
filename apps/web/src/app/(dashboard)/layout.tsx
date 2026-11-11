'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authService } from '@/lib/auth'
import { ensureSession, clearLocalSession } from '@/lib/api'
import { AppLoader } from '@/components/splash-screen'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/topbar'
import { CommandPalette } from '@/components/command-palette'
import { LiveSync } from '@/components/live-sync'
import { useT } from '@/lib/i18n'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  const router = useRouter()
  // Gate the shell on a valid session. The access token lives only in memory, so a page load
  // first trades the httpOnly refresh cookie for a new one. Pages render only after that —
  // otherwise every page query fires unauthenticated (a burst of 401s) and the dashboard
  // flashes before redirecting. While waiting (the free-tier API may be waking up) the user
  // sees the same branded loader as the first-load splash.
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!authService.hasSession()) {
      router.replace('/login')
      return
    }
    ensureSession().then((ok) => {
      if (cancelled) return
      if (ok) {
        setAuthed(true)
        void authService.refreshProfile() // regional settings may have changed elsewhere
      }
      else {
        clearLocalSession()
        router.replace('/login')
      }
    })
    return () => { cancelled = true }
  }, [router])

  if (!authed) return <AppLoader />

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-surface-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-60 focus:px-3 focus:py-2 focus:rounded-md focus:bg-ink focus:text-paper focus:text-sm"
      >
        {t('Skip to content')}
      </a>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-hidden">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
      <LiveSync />
    </div>
  )
}
