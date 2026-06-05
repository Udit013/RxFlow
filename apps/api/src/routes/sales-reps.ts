import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'

const salesRepSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  employeeCode: z.string().optional(),
  territory: z.string().optional(),
  defaultCommissionPercent: z.number().min(0).max(100).default(2),
  flatBonusAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
})

export async function salesRepRoutes(app: FastifyInstance) {
  // GET /api/v1/sales-reps
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { page?: string; limit?: string; search?: string; active?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(query.page), limit: Number(query.limit) })

    const where: Record<string, unknown> = { tenantId }
    if (query.active === 'true') where.isActive = true
    if (query.active === 'false') where.isActive = false
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
        { territory: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [reps, total] = await Promise.all([
      prisma.salesRep.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.salesRep.count({ where }),
    ])

    return reply.send({ success: true, data: reps, meta: buildPaginationMeta(total, page, limit) })
  })

  // GET /api/v1/sales-reps/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const rep = await prisma.salesRep.findFirst({
      where: { id, tenantId },
    })
    if (!rep) return reply.status(404).send({ success: false, error: 'Sales rep not found' })

    // Lifetime stats
    const lifetimeStats = await prisma.order.aggregate({
      where: { tenantId, salesRepId: id, type: 'SALE' },
      _sum: { total: true, commissionAmount: true },
      _count: true,
    })

    return reply.send({
      success: true,
      data: {
        ...rep,
        stats: {
          totalOrders: lifetimeStats._count,
          totalSales: lifetimeStats._sum.total ?? 0,
          totalCommission: lifetimeStats._sum.commissionAmount ?? 0,
        },
      },
    })
  })

  // POST /api/v1/sales-reps
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = salesRepSchema.parse(request.body)

    const existing = await prisma.salesRep.findUnique({
      where: { tenantId_phone: { tenantId, phone: body.phone } },
    })
    if (existing) return reply.status(409).send({ success: false, error: 'Sales rep with this phone already exists' })

    const rep = await prisma.salesRep.create({ data: { ...body, tenantId } })
    return reply.status(201).send({ success: true, data: rep })
  })

  // PUT /api/v1/sales-reps/:id
  app.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = salesRepSchema.partial().extend({ isActive: z.boolean().optional() }).parse(request.body)

    const rep = await prisma.salesRep.findFirst({ where: { id, tenantId } })
    if (!rep) return reply.status(404).send({ success: false, error: 'Sales rep not found' })

    const updated = await prisma.salesRep.update({ where: { id }, data: body })
    return reply.send({ success: true, data: updated })
  })

  // GET /api/v1/sales-reps/:id/commission-report?from=&to=
  app.get('/:id/commission-report', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const query = request.query as { from?: string; to?: string }

    const where: any = { tenantId, salesRepId: id, type: 'SALE' }
    if (query.from || query.to) {
      where.createdAt = {}
      if (query.from) where.createdAt.gte = new Date(query.from)
      if (query.to) where.createdAt.lte = new Date(query.to)
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
      },
    })

    const totals = orders.reduce(
      (acc, o) => {
        acc.totalSales += o.total
        acc.totalCommission += o.commissionAmount ?? 0
        if (o.commissionStatus === 'PAID') acc.paidCommission += o.commissionAmount ?? 0
        else acc.pendingCommission += o.commissionAmount ?? 0
        return acc
      },
      { totalSales: 0, totalCommission: 0, paidCommission: 0, pendingCommission: 0 }
    )

    return reply.send({
      success: true,
      data: {
        orders,
        totals: { ...totals, orderCount: orders.length },
      },
    })
  })

  // POST /api/v1/sales-reps/:id/settle — Mark commission as paid for given order IDs
  app.post('/:id/settle', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = z.object({ orderIds: z.array(z.string()).min(1) }).parse(request.body)

    const result = await prisma.order.updateMany({
      where: { tenantId, salesRepId: id, id: { in: body.orderIds } },
      data: { commissionStatus: 'PAID' },
    })

    return reply.send({ success: true, data: { settledCount: result.count } })
  })
}
