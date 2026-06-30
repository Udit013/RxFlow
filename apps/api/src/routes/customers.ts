import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { audit } from '../utils/audit.js'

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional()),
  dateOfBirth: z.preprocess((v) => (v === '' ? undefined : v), z.string().transform((d) => new Date(d)).optional()),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format').optional().or(z.literal('').transform(() => undefined)),
  creditLimit: z.number().default(0),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  salesRepId: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
})

export async function customerRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { page?: string; limit?: string; search?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(query.page), limit: Number(query.limit) })

    const where: Record<string, unknown> = { tenantId, isActive: true }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.customer.count({ where }),
    ])

    return reply.send({ success: true, data: customers, meta: buildPaginationMeta(total, page, limit) })
  })

  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        orders: { take: 10, orderBy: { createdAt: 'desc' }, include: { items: true } },
        prescriptions: { take: 5, orderBy: { createdAt: 'desc' } },
        ledgerEntries: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    })

    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })
    return reply.send({ success: true, data: customer })
  })

  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = customerSchema.parse(request.body)

    const existing = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: body.phone } },
    })
    if (existing) return reply.status(409).send({ success: false, error: 'Customer with this phone already exists' })

    const customer = await prisma.customer.create({ data: { ...body, tenantId } })
    await audit(request, {
      action: 'customer.create', entityType: 'Customer', entityId: customer.id,
      newValues: { name: customer.name, phone: customer.phone, gstin: customer.gstin },
      invalidate: ['customers'],
    })
    return reply.status(201).send({ success: true, data: customer })
  })

  app.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = customerSchema.partial().parse(request.body)
    const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })
    const updated = await prisma.customer.update({ where: { id }, data: body })
    await audit(request, {
      action: 'customer.update', entityType: 'Customer', entityId: id,
      oldValues: { name: customer.name }, newValues: body,
      invalidate: ['customers', 'customer'],
    })
    return reply.send({ success: true, data: updated })
  })

  // GET /api/v1/customers/:id/refill-suggestions
  // Returns medicines previously bought, with last-bought date + likely-needed-soon flag.
  app.get('/:id/refill-suggestions', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    const items = await prisma.orderItem.findMany({
      where: {
        order: { tenantId, customerId: id, type: 'SALE', status: { not: 'CANCELLED' } },
      },
      include: {
        medicine: { select: { id: true, name: true, strength: true, dosageForm: true, mrp: true, requiresPrescription: true } },
        order: { select: { id: true, createdAt: true, orderNumber: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
    })

    // Group by medicine
    const byMed: Record<string, {
      medicine: typeof items[number]['medicine']
      purchases: Array<{ date: Date; quantity: number; orderId: string; orderNumber: string; unitPrice: number }>
    }> = {}
    for (const it of items) {
      const key = it.medicineId
      if (!byMed[key]) byMed[key] = { medicine: it.medicine, purchases: [] }
      byMed[key].purchases.push({
        date: it.order.createdAt,
        quantity: it.quantity,
        orderId: it.order.id,
        orderNumber: it.order.orderNumber,
        unitPrice: it.unitPrice,
      })
    }

    const now = Date.now()
    const suggestions = Object.values(byMed).map((entry) => {
      const purchases = entry.purchases.sort((a, b) => b.date.getTime() - a.date.getTime())
      const lastBought = purchases[0]!.date
      const daysSinceLast = Math.floor((now - lastBought.getTime()) / (1000 * 60 * 60 * 24))

      // Estimate typical purchase interval (median of gaps between consecutive purchases)
      let medianInterval: number | null = null
      if (purchases.length >= 2) {
        const intervals: number[] = []
        for (let i = 0; i < purchases.length - 1; i++) {
          const gap = Math.floor((purchases[i]!.date.getTime() - purchases[i + 1]!.date.getTime()) / (1000 * 60 * 60 * 24))
          if (gap > 0) intervals.push(gap)
        }
        if (intervals.length > 0) {
          intervals.sort((a, b) => a - b)
          medianInterval = intervals[Math.floor(intervals.length / 2)]!
        }
      }

      // Typical quantity (median of last 3 purchases)
      const recentQtys = purchases.slice(0, 3).map((p) => p.quantity).sort((a, b) => a - b)
      const typicalQty = recentQtys[Math.floor(recentQtys.length / 2)] ?? 1

      const totalQty = purchases.reduce((s, p) => s + p.quantity, 0)

      // Likely needed soon = interval known AND days since last >= interval*0.8
      const dueSoon = medianInterval !== null && daysSinceLast >= medianInterval * 0.8
      // Overdue = days since last > interval * 1.2
      const overdue = medianInterval !== null && daysSinceLast > medianInterval * 1.2

      return {
        medicineId: entry.medicine.id,
        medicineName: entry.medicine.name,
        strength: entry.medicine.strength,
        dosageForm: entry.medicine.dosageForm,
        requiresPrescription: entry.medicine.requiresPrescription,
        mrp: entry.medicine.mrp,
        purchaseCount: purchases.length,
        totalQuantity: totalQty,
        typicalQuantity: typicalQty,
        lastBoughtAt: lastBought,
        daysSinceLast,
        medianIntervalDays: medianInterval,
        status: overdue ? 'OVERDUE' : dueSoon ? 'DUE_SOON' : 'ON_TRACK',
        recentPurchases: purchases.slice(0, 5),
      }
    })

    // Sort: overdue first, then due-soon by days-since, then on-track most-recent
    const statusRank = { OVERDUE: 0, DUE_SOON: 1, ON_TRACK: 2 } as const
    suggestions.sort((a, b) => {
      const sa = statusRank[a.status as keyof typeof statusRank]
      const sb = statusRank[b.status as keyof typeof statusRank]
      if (sa !== sb) return sa - sb
      return b.daysSinceLast - a.daysSinceLast
    })

    return reply.send({ success: true, data: suggestions })
  })

  // DELETE /api/v1/customers/:id — soft delete (isActive=false)
  app.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })
    await prisma.customer.update({ where: { id }, data: { isActive: false } })
    await audit(request, {
      action: 'customer.delete', entityType: 'Customer', entityId: id,
      oldValues: { name: customer.name, phone: customer.phone },
      invalidate: ['customers'],
    })
    return reply.send({ success: true })
  })

  // GET /api/v1/customers/:id/purchase-history
  app.get('/:id/purchase-history', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const query = request.query as { page?: string; limit?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(query.page), limit: Number(query.limit) })

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId, customerId: id, type: 'SALE' },
        skip, take, orderBy: { createdAt: 'desc' },
        include: { items: { include: { medicine: { select: { name: true, strength: true, dosageForm: true } } } } },
      }),
      prisma.order.count({ where: { tenantId, customerId: id, type: 'SALE' } }),
    ])

    return reply.send({ success: true, data: orders, meta: buildPaginationMeta(total, page, limit) })
  })
}
