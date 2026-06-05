'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface Notification {
  id: string
  type: string             // 'order.sale.create', etc.
  entityType: string
  entityId?: string
  actorId?: string
  actorName?: string       // resolved on receipt where possible
  message: string          // human-readable summary
  at: Date | string        // ISO when rehydrated
  read: boolean
}

interface NotificationStore {
  notifications: Notification[]
  unreadCount: number
  /** Most recent server event timestamp we've consumed — used to rehydrate after reload. */
  lastSeenAt: string | null
  add: (n: Omit<Notification, 'id' | 'read'>) => void
  setLastSeen: (ts: string) => void
  markAllRead: () => void
  clear: () => void
}

let counter = 0

export const useNotifications = create<NotificationStore>()(
  persist(
    (set) => ({
      notifications: [],
      unreadCount: 0,
      lastSeenAt: null,
      add: (n) => set((state) => {
        const next: Notification = { ...n, id: `n-${Date.now()}-${counter++}`, read: false }
        const all = [next, ...state.notifications].slice(0, 50)
        return {
          notifications: all,
          unreadCount: all.filter((x) => !x.read).length,
          lastSeenAt: new Date(n.at).toISOString(),
        }
      }),
      setLastSeen: (ts) => set({ lastSeenAt: ts }),
      markAllRead: () => set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      })),
      clear: () => set({ notifications: [], unreadCount: 0 }),
    }),
    {
      name: 'rxflow_notifications',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : ({} as any))),
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
        lastSeenAt: state.lastSeenAt,
      }),
    }
  )
)

/** Turn a raw SSE event into a human-readable notification message. */
export function formatEventMessage(evt: { type: string; entityType: string; entityId?: string }): string {
  const t = evt.type
  if (t === 'order.sale.create') return 'Sale completed'
  if (t === 'order.purchase.create') return 'Purchase order created'
  if (t === 'order.status.update') return 'Order status updated'
  if (t === 'invoice.sale.create') return 'Invoice generated'
  if (t === 'invoice.purchase.create') return 'Purchase invoice received'
  if (t === 'invoice.payment.record') return 'Payment recorded'
  if (t === 'invoice.credit-note.create') return 'Credit note issued'
  if (t === 'inventory.batch.add') return 'Stock added'
  if (t === 'inventory.batch.write-off') return 'Batch written off'
  if (t === 'stock-take.create') return 'Stock count started'
  if (t === 'stock-take.complete') return 'Stock count completed'
  if (t === 'customer.create') return 'New customer added'
  if (t === 'customer.update') return 'Customer updated'
  if (t === 'customer.delete') return 'Customer removed'
  if (t === 'supplier.create') return 'New supplier added'
  if (t === 'supplier.update') return 'Supplier updated'
  if (t === 'customer.bulk-import') return 'Customers imported'
  if (t === 'supplier.bulk-import') return 'Suppliers imported'
  if (t === 'backup.export') return 'Backup downloaded'
  if (t === 'backup.import') return 'Backup restored'
  return t
}

export function entityHref(entityType: string, entityId: string | undefined): string | null {
  if (!entityId) return null
  switch (entityType) {
    case 'Order': return `/dashboard/orders/${entityId}`
    case 'Invoice': return `/dashboard/invoices/${entityId}`
    case 'Customer': return `/dashboard/customers/${entityId}`
    case 'Supplier': return `/dashboard/suppliers/${entityId}`
    case 'StockTake': return `/dashboard/stock-takes/${entityId}`
    case 'Batch': return `/dashboard/inventory`
    default: return null
  }
}
