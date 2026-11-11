'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ChevronDown, Settings, LogOut, Menu } from 'lucide-react'
import { authService } from '@/lib/auth'
import { NotificationBell } from '@/components/notification-bell'
import { useUi } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

export function TopBar() {
  const t = useT()
  const router = useRouter()
  const [user, setUser] = useState<ReturnType<typeof authService.getStoredUser>>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const mobileNavOpen = useUi((s) => s.mobileNavOpen)
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen)

  useEffect(() => { setUser(authService.getStoredUser()) }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    if (menuOpen) {
      document.addEventListener('mousedown', handler)
      document.addEventListener('keydown', onKey)
      return () => {
        document.removeEventListener('mousedown', handler)
        document.removeEventListener('keydown', onKey)
      }
    }
    return undefined
  }, [menuOpen])

  const handleLogout = async () => {
    await authService.logout()
    router.push('/login')
  }

  return (
    <header className="bg-surface-50/95 border-b border-surface-200 px-3 sm:px-6 h-12 flex items-center justify-between shrink-0 gap-2 sm:gap-4 relative z-10">
      {/* Drawer toggle — the sidebar is off-canvas below the lg breakpoint */}
      <button
        type="button"
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        className="lg:hidden p-1.5 -ml-1 rounded-md text-surface-600 hover:bg-surface-200/70 hover:text-surface-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600"
        aria-label={t('Open navigation')}
        aria-controls="app-sidebar"
        aria-expanded={mobileNavOpen}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search trigger — opens command palette (Cmd+K) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        aria-label="Search (⌘K)"
        className="group flex items-center gap-2 h-8 bg-paper border border-surface-200 rounded-md pl-2.5 pr-1.5 flex-1 min-w-0 max-w-96 text-left hover:border-surface-300 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <Search className="w-3.5 h-3.5 text-surface-400 shrink-0" aria-hidden="true" />
        <span className="text-[13px] text-surface-400 group-hover:text-surface-500 flex-1 truncate">{t('Find anything…')}</span>
        <kbd className="hidden sm:inline text-[10px] text-surface-500 border border-surface-200 bg-surface-50 px-1.5 py-0.5 rounded-sm font-mono">⌘K</kbd>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-1 shrink-0">
        <NotificationBell />

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('Account menu')}
            className="flex items-center gap-2 ml-1 pl-1 pr-1.5 py-1 rounded-md hover:bg-surface-200/50 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <div className="w-6 h-6 bg-brand-800 rounded-full flex items-center justify-center text-brand-50 text-[11px] font-semibold">
              <span aria-hidden="true">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-medium text-surface-900 leading-4">{user?.name ?? 'User'}</p>
              <p className="text-[11px] text-surface-500 leading-3.5">{user?.tenant?.name ?? 'Pharmacy'}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-surface-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1.5 w-60 bg-paper rounded-lg shadow-dropdown z-50 overflow-hidden animate-fade-in">
              <div className="px-3 py-2.5 border-b border-surface-200">
                <p className="text-sm font-semibold text-surface-900 truncate">{user?.name}</p>
                <p className="text-xs text-surface-500 truncate">{user?.email}</p>
                <span className="badge-info mt-1.5">
                  {user?.role?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="py-1">
                <Link
                  href="/dashboard/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 mx-1 px-2 py-1.5 rounded-md text-[13px] text-surface-700 hover:bg-surface-100 focus:outline-hidden focus-visible:bg-surface-100"
                >
                  <Settings className="w-4 h-4 text-surface-400" aria-hidden="true" /> {t('Settings')}
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="w-[calc(100%-0.5rem)] flex items-center gap-2.5 mx-1 px-2 py-1.5 rounded-md text-[13px] text-surface-700 hover:bg-surface-100 focus:outline-hidden focus-visible:bg-surface-100"
                >
                  <LogOut className="w-4 h-4 text-surface-400" aria-hidden="true" /> {t('Sign out')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
