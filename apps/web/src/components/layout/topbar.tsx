'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ChevronDown, Settings, LogOut, Trash2, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { authService } from '@/lib/auth'
import { NotificationBell } from '@/components/notification-bell'

export function TopBar() {
  const router = useRouter()
  const [user, setUser] = useState<ReturnType<typeof authService.getStoredUser>>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
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

  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN'

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
              {isAdmin && (
                <div className="py-1 border-t border-slate-100">
                  <button
                    onClick={() => { setMenuOpen(false); setShowDelete(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" /> Delete account
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showDelete && (
        <DeleteAccountModal
          tenantName={user?.tenant?.name ?? ''}
          onClose={() => setShowDelete(false)}
          onDeleted={() => router.push('/login')}
        />
      )}
    </header>
  )
}

function DeleteAccountModal({ tenantName, onClose, onDeleted }: { tenantName: string; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const matches = confirm.trim() === tenantName.trim()

  const handleDelete = async () => {
    if (!matches) return
    setLoading(true)
    try {
      await authService.deleteAccount(confirm)
      toast.success('Account deleted')
      onDeleted()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Failed to delete account')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Delete account
          </h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
            This permanently deletes <strong>{tenantName}</strong> and <strong>all</strong> of its data — inventory,
            invoices, customers, suppliers, staff, accounts, and every other record. This <strong>cannot be undone</strong>.
          </div>
          <p className="text-xs text-slate-500">
            💡 Want a copy first? Cancel and use <strong>Backup &amp; Import → Export</strong> to download everything.
          </p>
          <div>
            <label className="label">Type <span className="font-mono font-semibold">{tenantName}</span> to confirm</label>
            <input
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={tenantName}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={!matches || loading}
              className="btn-danger"
            >
              <Trash2 className="w-4 h-4" /> {loading ? 'Deleting...' : 'Delete forever'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
