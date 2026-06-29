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
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
      {/* Search trigger — opens command palette (Cmd+K) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-80 text-left hover:bg-slate-100 transition-colors"
      >
        <Search className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-400 flex-1">Search medicines, orders, customers...</span>
        <kbd className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <NotificationBell />

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-3 border-l border-slate-200 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-900 leading-none">{user?.name ?? 'User'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{user?.tenant?.name ?? 'Pharmacy'}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                <span className="inline-block mt-1.5 text-[10px] font-medium uppercase tracking-wide text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>
              <div className="py-1">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Settings className="w-4 h-4 text-slate-400" /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="w-4 h-4 text-slate-400" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
