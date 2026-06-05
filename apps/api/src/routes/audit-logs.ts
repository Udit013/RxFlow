import type { FastifyInstance } from 'fastify'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'

export async function auditLogRoutes(app: FastifyInstance) {
  // GET /api/v1/audit-logs?page=&limit=&action=&entityType=&userId=&from=&to=
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = request.query as {
      page?: string; limit?: string;
      action?: string; entityType?: string; userId?: string;
      from?: string; to?: string;
    }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(q.page), limit: Number(q.limit) })

    const where: Record<string, unknown> = { tenantId }
    if (q.action) where.action = q.action
    if (q.entityType) where.entityType = q.entityType
    if (q.userId) where.userId = q.userId
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from && { gte: new Date(q.from) }),
        ...(q.to && { lte: new Date(q.to) }),
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    return reply.send({ success: true, data: logs, meta: buildPaginationMeta(total, page, limit) })
  })

  // GET /api/v1/audit-logs/since?ts=ISO — for notification rehydration on reload
  app.get('/since', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const q = request.query as { ts?: string }
    const since = q.ts ? new Date(q.ts) : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        createdAt: { gt: since },
        userId: { not: userId }, // exclude your own actions
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    })
    return reply.send({ success: true, data: logs })
  })

  // GET /api/v1/audit-logs/distinct — filter helpers
  app.get('/distinct', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const [actions, entityTypes, users] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId },
        distinct: ['action'],
        select: { action: true },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: { tenantId },
        distinct: ['entityType'],
        select: { entityType: true },
        take: 50,
      }),
      prisma.user.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])
    return reply.send({
      success: true,
      data: {
        actions: actions.map((a) => a.action).sort(),
        entityTypes: entityTypes.map((e) => e.entityType).sort(),
        users,
      },
    })
  })
}
