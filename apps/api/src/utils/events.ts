/**
 * In-memory per-tenant pub/sub for SSE.
 *
 * Limitations:
 * - Process-local: if you scale to multiple API workers, swap this for Redis pub/sub.
 * - For single-host LAN deployments this is exactly right — zero deps, simple, fast.
 */

import type { FastifyReply } from 'fastify'

type Subscriber = (data: string) => void

const subscribers = new Map<string, Set<Subscriber>>()

export function subscribe(tenantId: string, fn: Subscriber): () => void {
  if (!subscribers.has(tenantId)) subscribers.set(tenantId, new Set())
  subscribers.get(tenantId)!.add(fn)
  return () => {
    const set = subscribers.get(tenantId)
    if (set) {
      set.delete(fn)
      if (set.size === 0) subscribers.delete(tenantId)
    }
  }
}

export interface ChangeEvent {
  type: string               // 'order.created', 'invoice.paid', etc.
  entityType: string         // 'Order' | 'Invoice' | 'InventoryItem' | ...
  entityId?: string
  invalidate?: string[]      // React Query keys to refresh, e.g. ['inventory', 'dashboard']
  actor?: { id: string; name?: string }
}

export function publish(tenantId: string, event: ChangeEvent) {
  const set = subscribers.get(tenantId)
  if (!set || set.size === 0) return
  const payload = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`
  for (const fn of set) {
    try { fn(payload) } catch { /* dropped subscriber */ }
  }
}

/** Send SSE headers + flush helper. */
export function openSseStream(reply: FastifyReply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering if proxied
  })
  reply.raw.write(`: connected ${new Date().toISOString()}\n\n`)
  return reply.raw
}
