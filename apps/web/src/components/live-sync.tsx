'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Wifi, WifiOff } from 'lucide-react'
import { useNotifications, formatEventMessage } from '@/lib/notification-store'
import { authService } from '@/lib/auth'

/**
 * LiveSync — opens an SSE connection to /api/v1/events and invalidates
 * React Query caches whenever the backend signals a change.
 *
 * Mount once in the dashboard layout. Shows a discreet status indicator.
 */
export function LiveSync() {
  const queryClient = useQueryClient()
  const addNotification = useNotifications((s) => s.add)
  const lastSeenAt = useNotifications((s) => s.lastSeenAt)
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null)

  // On mount: replay audit entries we may have missed while offline / page closed
  useEffect(() => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('rxflow_access_token')
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const since = lastSeenAt ?? new Date(Date.now() - 60 * 60 * 1000).toISOString() // default: last hour
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
        const res = await fetch(`${apiBase}/audit-logs/since?ts=${encodeURIComponent(since)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const json = await res.json()
        const entries: any[] = json?.data ?? []
        for (const e of entries.reverse()) {
          // Skip our own actions to be safe (the API already filters but double-check)
          if (e.userId === e.currentUserId) continue
          addNotification({
            type: e.action,
            entityType: e.entityType,
            entityId: e.entityId,
            actorId: e.userId,
            actorName: e.user?.name,
            message: `${formatEventMessage({ type: e.action, entityType: e.entityType, entityId: e.entityId })}${e.user?.name ? ` (by ${e.user.name})` : ''}`,
            at: new Date(e.createdAt),
          })
        }
      } catch {
        /* offline, no big deal */
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
    let cancelled = false
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000

    function connect() {
      if (cancelled) return
      const token = localStorage.getItem('rxflow_access_token')
      if (!token) {
        // Not logged in yet — try again in a bit
        retryTimer = setTimeout(connect, 2000)
        return
      }
      const url = `${apiBase}/events?token=${encodeURIComponent(token)}`
      es = new EventSource(url)

      es.onopen = () => {
        setStatus('live')
        backoff = 1000
      }

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data)
          setLastEventAt(new Date())
          // Invalidate the listed query keys (each is a queryKey prefix)
          if (Array.isArray(evt.invalidate)) {
            for (const key of evt.invalidate) {
              queryClient.invalidateQueries({ queryKey: [key] })
            }
          }
          // Skip self-originated notifications (your own actions are loud enough already)
          const currentUserId = authService.getStoredUser()?.id
          if (evt.actor?.id && evt.actor.id !== currentUserId) {
            addNotification({
              type: evt.type,
              entityType: evt.entityType,
              entityId: evt.entityId,
              actorId: evt.actor?.id,
              message: formatEventMessage(evt),
              at: new Date(evt.at ?? Date.now()),
            })
          }
        } catch {
          /* ignore malformed event */
        }
      }

      es.onerror = () => {
        setStatus('offline')
        es?.close()
        if (cancelled) return
        retryTimer = setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 30_000) // exponential up to 30s
      }
    }

    connect()

    return () => {
      cancelled = true
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [queryClient])

  return <LiveSyncBadge status={status} lastEventAt={lastEventAt} />
}

function LiveSyncBadge({ status, lastEventAt }: { status: 'connecting' | 'live' | 'offline'; lastEventAt: Date | null }) {
  const [tick, setTick] = useState(0)
  // Track real browser connectivity separately from the live-sync (SSE) channel.
  const [browserOnline, setBrowserOnline] = useState(true)
  useEffect(() => {
    setBrowserOnline(navigator.onLine)
    const on = () => setBrowserOnline(true)
    const off = () => setBrowserOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => {
    if (!lastEventAt) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [lastEventAt])

  let label = 'Connecting…'
  let color = 'text-surface-400'
  let Icon = WifiOff
  if (status === 'live') { label = 'Live'; color = 'text-secondary-600'; Icon = Wifi }
  // SSE down but the browser is online → live-sync is just paused; don't alarm the user.
  else if (status === 'offline' && browserOnline) { label = 'Sync paused'; color = 'text-surface-400'; Icon = WifiOff }
  // Truly offline (no network) → real warning.
  else if (!browserOnline) { label = 'Offline'; color = 'text-accent-600'; Icon = WifiOff }

  const sinceLast = lastEventAt ? Math.floor((Date.now() - lastEventAt.getTime()) / 1000) : null

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-2.5 py-1 shadow-sm text-xs">
      <Icon className={`w-3 h-3 ${color}`} />
      <span className={color}>{label}</span>
      {sinceLast != null && status === 'live' && (
        <>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500" title={lastEventAt?.toISOString()}>{tick >= 0 ? `${sinceLast}s ago` : ''}</span>
        </>
      )}
    </div>
  )
}
