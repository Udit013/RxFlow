'use client'

import { useEffect, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { authService } from '@/lib/auth'
import { NotificationBell } from '@/components/notification-bell'

export function TopBar() {
  const [user, setUser] = useState<ReturnType<typeof authService.getStoredUser>>(null)
  useEffect(() => { setUser(authService.getStoredUser()) }, [])

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

        {/* User */}
        <button className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium text-slate-900 leading-none">{user?.name ?? 'User'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user?.tenant?.name ?? 'Pharmacy'}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </header>
  )
}
