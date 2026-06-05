import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { getFinancialYear, getFinancialYearBounds, formatFyNumber } from '../utils/financial-year.js'
import { audit } from '../utils/audit.js'

export async function stockTakeRoutes(app: FastifyInstance) {
  // GET /api/v1/stock-takes
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { page?: string; limit?: string; status?: string; storeId?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(query.page), limit: Number(query.limit) })

    const where: Record<string, unknown> = { tenantId }
    if (query.status) where.status = query.status
    if (query.storeId) where.storeId = query.storeId

    const [takes, total] = await Promise.all([
      prisma.stockTake.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: { lines: { select: { id: true, actualQty: true, variance: true } } },
      }),
      prisma.stockTake.count({ where }),
    ])

    const enriched = takes.map((t) => {
      const counted = t.lines.filter((l) => l.actualQty != null).length
      const positiveVariance = t.lines.filter((l) => (l.variance ?? 0) > 0).length
      const negativeVariance = t.lines.filter((l) => (l.variance ?? 0) < 0).length
      return {
        ...t,
        lines: undefined,
        lineCount: t.lines.length,
        countedCount: counted,
        positiveVariance,
        negativeVariance,
      }
    })

    return reply.send({ success: true, data: enriched, meta: buildPaginationMeta(total, page, limit) })
  })

  // GET /api/v1/stock-takes/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const take = await prisma.stockTake.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          orderBy: { id: 'asc' },
        },
      },
    })
    if (!take) return reply.status(404).send({ success: false, error: 'Stock take not found' })

    // Enrich lines with medicine info (resolved separately to keep types simple)
    const medicineIds = Array.from(new Set(take.lines.map((l) => l.medicineId)))
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
      select: { id: true, name: true, strength: true, dosageForm: true, manufacturerName: true },
    })
    const medMap = new Map(medicines.map((m) => [m.id, m]))

    const batchIds = Array.from(new Set(take.lines.map((l) => l.batchId).filter(Boolean) as string[]))
    const batches = batchIds.length
      ? await prisma.batch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, batchNumber: true, expiryDate: true, purchasePrice: true, mrp: true },
        })
      : []
    const batchMap = new Map(batches.map((b) => [b.id, b]))

    const lines = take.lines.map((l) => ({
      ...l,
      medicine: medMap.get(l.medicineId) ?? null,
      batch: l.batchId ? batchMap.get(l.batchId) ?? null : null,
    }))

    return reply.send({ success: true, data: { ...take, lines } })
  })

  // POST /api/v1/stock-takes — Create a new stock take, snapshot inventory
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId, storeIds } = request.user
    const body = z.object({
      storeId: z.string().optional(),
      notes: z.string().optional(),
      scope: z.enum(['all', 'lowStock', 'expiringSoon']).default('all'),
    }).parse(request.body)

    const storeId = body.storeId ?? storeIds[0]
    if (!storeId) return reply.status(400).send({ success: false, error: 'No store available' })

    // Generate FY code: ST/2025-26/00001
    const fy = getFinancialYear()
    const { from, to } = getFinancialYearBounds()
    const seq = await prisma.stockTake.count({
      where: { tenantId, createdAt: { gte: from, lt: to } },
    })
    const code = formatFyNumber('ST', fy.label, seq + 1)

    // Build line snapshots — one row per batch (most precise)
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { tenantId, storeId },
      include: { batches: { where: { quantity: { gt: 0 } } } },
    })

    const lineData: Array<{ medicineId: string; batchId: string | null; systemQty: number }> = []
    for (const inv of inventoryItems) {
      // Apply scope filter
      if (body.scope === 'lowStock' && inv.availableQuantity > inv.reorderLevel) continue
      if (body.scope === 'expiringSoon') {
        const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        const hasExpiring = inv.batches.some((b) => b.expiryDate <= ninetyDaysOut)
        if (!hasExpiring) continue
      }

      if (inv.batches.length === 0) {
        // Track even zero-batch items so user can record any unrecorded stock found
        lineData.push({ medicineId: inv.medicineId, batchId: null, systemQty: inv.availableQuantity })
      } else {
        for (const b of inv.batches) {
          lineData.push({ medicineId: inv.medicineId, batchId: b.id, systemQty: b.quantity })
        }
      }
    }

    if (lineData.length === 0) {
      return reply.status(400).send({ success: false, error: 'No inventory items match the selected scope' })
    }

    const take = await prisma.stockTake.create({
      data: {
        tenantId,
        storeId,
        code,
        status: 'IN_PROGRESS',
        notes: body.notes,
        createdBy: userId,
        lines: { create: lineData },
      },
      include: { lines: { select: { id: true } } },
    })

    await audit(request, {
      action: 'stock-take.create',
      entityType: 'StockTake',
      entityId: take.id,
      newValues: { code: take.code, lineCount: take.lines.length, scope: body.scope },
      invalidate: ['stock-takes'],
    })

    return reply.status(201).send({ success: true, data: { id: take.id, code: take.code, lineCount: take.lines.length } })
  })

  // PATCH /api/v1/stock-takes/:id/lines/:lineId — record actual count for one line
  app.patch('/:id/lines/:lineId', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, lineId } = request.params as { id: string; lineId: string }
    const { tenantId } = request.user
    const body = z.object({
      actualQty: z.number().int().min(0),
      notes: z.string().optional(),
    }).parse(request.body)

    const take = await prisma.stockTake.findFirst({ where: { id, tenantId } })
    if (!take) return reply.status(404).send({ success: false, error: 'Stock take not found' })
    if (take.status === 'COMPLETED' || take.status === 'CANCELLED') {
      return reply.status(400).send({ success: false, error: `Cannot edit a ${take.status} stock take` })
    }

    const line = await prisma.stockTakeLine.findUnique({ where: { id: lineId } })
    if (!line || line.stockTakeId !== id) {
      return reply.status(404).send({ success: false, error: 'Line not found' })
    }

    const updated = await prisma.stockTakeLine.update({
      where: { id: lineId },
      data: {
        actualQty: body.actualQty,
        variance: body.actualQty - line.systemQty,
        notes: body.notes,
        countedAt: new Date(),
      },
    })

    return reply.send({ success: true, data: updated })
  })

  // POST /api/v1/stock-takes/:id/complete — apply variances to inventory
  app.post('/:id/complete', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, userId } = request.user

    const take = await prisma.stockTake.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    })
    if (!take) return reply.status(404).send({ success: false, error: 'Stock take not found' })
    if (take.status === 'COMPLETED') return reply.status(400).send({ success: false, error: 'Already completed' })
    if (take.status === 'CANCELLED') return reply.status(400).send({ success: false, error: 'Cancelled' })

    const counted = take.lines.filter((l) => l.actualQty != null)
    if (counted.length === 0) {
      return reply.status(400).send({ success: false, error: 'No lines counted yet' })
    }

    let positiveAdjustments = 0
    let negativeAdjustments = 0
    let unchangedLines = 0

    await prisma.$transaction(async (tx) => {
      for (const line of counted) {
        const variance = (line.actualQty ?? 0) - line.systemQty
        if (variance === 0) {
          unchangedLines++
          continue
        }

        // Apply to batch (if specified) and to inventory item totals
        if (line.batchId) {
          await tx.batch.update({
            where: { id: line.batchId },
            data: { quantity: line.actualQty! },
          })
        }
        const inventoryItem = await tx.inventoryItem.findFirst({
          where: { tenantId, medicineId: line.medicineId, storeId: take.storeId },
        })
        if (inventoryItem) {
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              totalQuantity: { increment: variance },
              availableQuantity: { increment: variance },
            },
          })
        }
        if (variance > 0) positiveAdjustments++
        else negativeAdjustments++
      }

      await tx.stockTake.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), completedBy: userId },
      })
    })

    await audit(request, {
      action: 'stock-take.complete',
      entityType: 'StockTake',
      entityId: id,
      newValues: { code: take.code, applied: counted.length, positiveAdjustments, negativeAdjustments },
      invalidate: ['stock-takes', 'stock-take', 'inventory', 'inventory-insights'],
    })

    return reply.send({
      success: true,
      data: {
        applied: counted.length,
        positiveAdjustments,
        negativeAdjustments,
        unchangedLines,
        uncountedLinesDropped: take.lines.length - counted.length,
      },
    })
  })

  // POST /api/v1/stock-takes/:id/cancel
  app.post('/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const take = await prisma.stockTake.findFirst({ where: { id, tenantId } })
    if (!take) return reply.status(404).send({ success: false, error: 'Stock take not found' })
    if (take.status === 'COMPLETED') return reply.status(400).send({ success: false, error: 'Already completed' })
    await prisma.stockTake.update({ where: { id }, data: { status: 'CANCELLED' } })
    return reply.send({ success: true })
  })
}
