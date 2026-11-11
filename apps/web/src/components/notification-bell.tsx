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
        className="relative p-1.5 text-surface-500 hover:text-surface-900 hover:bg-surface-200/50 rounded-md transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600"
        aria-label="Notifications"
      >
        <Bell className="w-[18px] h-[18px]" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute top-0 right-0 bg-danger-600 text-paper text-[9.5px] font-semibold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center ring-2 ring-surface-50 tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-w-[calc(100vw-1.5rem)] bg-paper rounded-lg shadow-dropdown z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-3 h-10 border-b border-surface-200">
            <h3 className="font-semibold text-[13px]">Notifications</h3>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    aria-label="Mark all as read"
                    className="p-1.5 rounded-md text-surface-400 hover:text-surface-900 hover:bg-surface-100"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={clearAll}
                    aria-label="Clear all"
                    className="p-1.5 rounded-md text-surface-400 hover:text-surface-900 hover:bg-surface-100"
                    title="Clear all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[13px] font-medium text-surface-700">No notifications yet</p>
              <p className="text-xs text-surface-500 mt-1">Activity from other devices will appear here</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-surface-100">
              {notifications.map((n) => {
                const href = entityHref(n.entityType, n.entityId)
                const inner = (
                  <div className={`px-3 py-2.5 hover:bg-surface-50 transition-colors ${!n.read ? 'bg-brand-50/50' : ''}`}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 bg-brand-600 rounded-full mt-[7px] shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-surface-800 truncate">{n.message}</p>
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

          <div className="px-3 py-2 text-xs text-surface-500 border-t border-surface-200">
            <Link href="/dashboard/audit" onClick={() => setOpen(false)} className="font-medium hover:text-surface-900">
              View full audit log →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
