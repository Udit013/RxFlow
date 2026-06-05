/**
 * Audit logger — writes to AuditLog and publishes a live event in one call.
 * Safe to swallow errors so a logging failure never blocks the real mutation.
 */

import type { FastifyRequest } from 'fastify'
import { prisma } from '@rxflow/db'
import { publish, type ChangeEvent } from './events.js'

export interface AuditEntry {
  action: string             // e.g. 'order.create', 'inventory.write-off'
  entityType: string         // 'Order' | 'Invoice' | 'Batch' | ...
  entityId?: string
  oldValues?: unknown
  newValues?: unknown
  invalidate?: string[]      // Query keys to invalidate on subscribed clients
}

export async function audit(request: FastifyRequest, entry: AuditEntry): Promise<void> {
  try {
    const { tenantId, userId } = request.user
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: entry.oldValues as any,
        newValues: entry.newValues as any,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    })

    const ev: ChangeEvent = {
      type: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      invalidate: entry.invalidate,
      actor: { id: userId },
    }
    publish(tenantId, ev)
  } catch (e) {
    // Never let audit failures fail the main mutation.
    request.log.warn({ err: e, audit: entry }, 'audit log failed')
  }
}
