'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ChevronDown, Settings, LogOut } from 'lucide-react'
import { authService } from '@/lib/auth'
import { NotificationBell } from '@/components/notification-bell'

export function TopBar() {
  const router = useRouter()
  const [user, setUser] = useState<ReturnType<typeof authService.getStoredUser>>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setUser(authService.getStoredUser()) }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
    return undefined
  }, [menuOpen])

  const handleLogout = async () => {
    await authService.logout()
    router.push('/login')
  }

  return (
    <header className="bg-surface-100 border-b border-surface-300 px-6 h-12 flex items-center justify-between shrink-0 gap-4">
      {/* Search trigger — opens command palette (Cmd+K) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        className="group flex items-center gap-2 bg-paper border border-surface-300 rounded-sm pl-2.5 pr-1.5 py-1.5 w-80 text-left hover:border-surface-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Search className="w-3.5 h-3.5 text-surface-400" />
        <span className="text-[13px] text-surface-400 flex-1">Find anything…</span>
        <kbd className="text-[10px] text-surface-500 border border-surface-300 bg-surface-100 px-1.5 py-0.5 rounded-sm font-mono group-hover:border-surface-400">⌘K</kbd>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-1">
        <NotificationBell />

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-3 ml-2 border-l border-surface-300 py-1 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 bg-ink rounded-sm flex items-center justify-center text-paper text-xs font-semibold font-display">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-medium text-surface-900 leading-none">{user?.name ?? 'User'}</p>
              <p className="text-[11px] text-surface-500 mt-0.5">{user?.tenant?.name ?? 'Pharmacy'}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-surface-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-paper border border-surface-300 rounded-md shadow-dropdown z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-200">
                <p className="text-sm font-semibold text-surface-900 truncate">{user?.name}</p>
                <p className="text-xs text-surface-500 truncate font-mono">{user?.email}</p>
                <span className="badge-info mt-1.5">
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>
              <div className="py-1">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-surface-700 hover:bg-surface-100"
                >
                  <Settings className="w-4 h-4 text-surface-400" /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-surface-700 hover:bg-surface-100"
                >
                  <LogOut className="w-4 h-4 text-surface-400" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
