'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotifications, entityHref } from '@/lib/notification-store'
import { formatRelativeTime } from '@/lib/utils'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const notifications = useNotifications((s) => s.notifications)
  const unread = useNotifications((s) => s.unreadCount)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const clearAll = useNotifications((s) => s.clear)
  const ref = useRef<HTMLDivElement>(null)

  // Mark all read when opened
  useEffect(() => {
    if (open && unread > 0) {
      const t = setTimeout(markAllRead, 800)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open, unread, markAllRead])

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
    return undefined
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    className="text-xs text-slate-500 hover:text-brand-600 px-2 py-1 rounded hover:bg-slate-50"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-xs text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-slate-50"
                    title="Clear all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No notifications yet</p>
              <p className="text-xs mt-1">Activity from other devices will appear here</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {notifications.map((n) => {
                const href = entityHref(n.entityType, n.entityId)
                const inner = (
                  <div className={`p-3 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-brand-50/40' : ''}`}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 bg-brand-500 rounded-full mt-2 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 truncate">{n.message}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{n.entityType} · {formatRelativeTime(n.at)}</p>
                      </div>
                    </div>
                  </div>
                )
                return href ? (
                  <Link key={n.id} href={href} onClick={() => setOpen(false)}>{inner}</Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                )
              })}
            </div>
          )}

          <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 text-center border-t">
            <Link href="/dashboard/audit" onClick={() => setOpen(false)} className="hover:text-brand-600">
              View full audit log →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
