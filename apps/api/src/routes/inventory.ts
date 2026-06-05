import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { audit } from '../utils/audit.js'

const addBatchSchema = z.object({
  medicineId: z.string(),
  batchNumber: z.string().min(1),
  expiryDate: z.string().transform((d) => new Date(d)),
  manufacturingDate: z.string().transform((d) => new Date(d)).optional(),
  quantity: z.number().int().positive(),
  purchasePrice: z.number().positive(),
  mrp: z.number().positive(),
  supplierId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  sellingPrice: z.number().positive().optional(),
})

const updateStockSchema = z.object({
  reorderLevel: z.number().int().optional(),
  reorderQuantity: z.number().int().optional(),
  sellingPrice: z.number().positive().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  rackNumber: z.string().optional().or(z.literal('').transform(() => null)),
  shelfNumber: z.string().optional().or(z.literal('').transform(() => null)),
})

export async function inventoryRoutes(app: FastifyInstance) {
  // GET /api/v1/inventory
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as {
      page?: string; limit?: string; search?: string; storeId?: string;
      lowStock?: string; expiringSoon?: string; expired?: string;
    }

    const { page, limit, skip, take } = getPaginationParams({
      page: Number(query.page),
      limit: Number(query.limit),
    })

    const where: Record<string, unknown> = { tenantId, isActive: true }
    if (query.storeId) where.storeId = query.storeId

    // Medicine search — name / generic / brand / manufacturer / barcode
    const searchTerm = (query.search ?? '').trim()
    if (searchTerm.length > 0) {
      where.medicine = {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { genericName: { contains: searchTerm, mode: 'insensitive' } },
          { brandName: { contains: searchTerm, mode: 'insensitive' } },
          { manufacturerName: { contains: searchTerm, mode: 'insensitive' } },
          { barcodes: { has: searchTerm } },
        ],
      }
    }

    if (query.lowStock === 'true') {
      // Items below reorder level
      where.availableQuantity = { lte: prisma.inventoryItem.fields.reorderLevel }
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take,
        include: {
          medicine: { select: { id: true, name: true, genericName: true, dosageForm: true, strength: true, packSize: true, mrp: true, schedule: true } },
          batches: {
            where: { quantity: { gt: 0 } },
            orderBy: { expiryDate: 'asc' },
          },
        },
        orderBy: { medicine: { name: 'asc' } },
      }),
      prisma.inventoryItem.count({ where }),
    ])

    // Add flags
    const today = new Date()
    const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)

    const enriched = items.map((item) => ({
      ...item,
      isLowStock: item.availableQuantity <= item.reorderLevel,
      hasExpiredBatches: item.batches.some((b) => b.expiryDate < today),
      hasExpiringSoonBatches: item.batches.some(
        (b) => b.expiryDate >= today && b.expiryDate <= ninetyDaysFromNow
      ),
    }))

    // Filter if needed
    const filtered = query.expired === 'true'
      ? enriched.filter((i) => i.hasExpiredBatches)
      : query.expiringSoon === 'true'
      ? enriched.filter((i) => i.hasExpiringSoonBatches)
      : enriched

    return reply.send({
      success: true,
      data: filtered,
      meta: buildPaginationMeta(total, page, limit),
    })
  })

  // GET /api/v1/inventory/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const item = await prisma.inventoryItem.findFirst({
      where: { id, tenantId },
      include: {
        medicine: { include: { compositions: true, substitutes: { include: { substitute: true } } } },
        batches: { orderBy: { expiryDate: 'asc' } },
      },
    })

    if (!item) {
      return reply.status(404).send({ success: false, error: 'Inventory item not found' })
    }

    return reply.send({ success: true, data: item })
  })

  // POST /api/v1/inventory/batches — Add new stock batch (Purchase)
  app.post('/batches', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = addBatchSchema.parse(request.body)
    const storeId = (request.query as { storeId?: string }).storeId ?? request.user.storeIds[0]

    const result = await prisma.$transaction(async (tx) => {
      // Find or create inventory item
      let inventoryItem = await tx.inventoryItem.findUnique({
        where: { tenantId_storeId_medicineId: { tenantId, storeId, medicineId: body.medicineId } },
      })

      if (!inventoryItem) {
        const medicine = await tx.medicine.findUnique({ where: { id: body.medicineId } })
        if (!medicine) throw new Error('Medicine not found')

        inventoryItem = await tx.inventoryItem.create({
          data: {
            tenantId,
            storeId,
            medicineId: body.medicineId,
            sellingPrice: body.sellingPrice ?? medicine.mrp,
            reorderLevel: 10,
            reorderQuantity: 50,
          },
        })
      }

      // Create batch
      const batch = await tx.batch.create({
        data: {
          inventoryItemId: inventoryItem.id,
          batchNumber: body.batchNumber,
          expiryDate: body.expiryDate,
          manufacturingDate: body.manufacturingDate,
          quantity: body.quantity,
          purchasePrice: body.purchasePrice,
          mrp: body.mrp,
          supplierId: body.supplierId,
          purchaseOrderId: body.purchaseOrderId,
        },
      })

      // Update quantities
      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          totalQuantity: { increment: body.quantity },
          availableQuantity: { increment: body.quantity },
          ...(body.sellingPrice && { sellingPrice: body.sellingPrice }),
        },
      })

      return { inventoryItem, batch }
    })

    await audit(request, {
      action: 'inventory.batch.add',
      entityType: 'Batch',
      entityId: result.batch.id,
      newValues: { batchNumber: body.batchNumber, quantity: body.quantity, medicineId: body.medicineId, purchasePrice: body.purchasePrice },
      invalidate: ['inventory', 'inventory-insights', 'medicine-purchase-history'],
    })

    return reply.status(201).send({ success: true, data: result })
  })

  // PATCH /api/v1/inventory/:id — Update stock settings
  app.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = updateStockSchema.parse(request.body)

    const item = await prisma.inventoryItem.findFirst({ where: { id, tenantId } })
    if (!item) {
      return reply.status(404).send({ success: false, error: 'Inventory item not found' })
    }

    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: body,
    })

    return reply.send({ success: true, data: updated })
  })

  // GET /api/v1/inventory/alerts/low-stock
  app.get('/alerts/low-stock', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user

    const items = await prisma.inventoryItem.findMany({
      where: {
        tenantId,
        isActive: true,
        availableQuantity: { lte: prisma.inventoryItem.fields.reorderLevel },
      },
      include: {
        medicine: { select: { id: true, name: true, strength: true, dosageForm: true, manufacturerName: true, mrp: true } },
      },
      take: 50,
    })

    // Sort: most-depleted first (smallest ratio of available/reorderLevel)
    items.sort((a, b) => {
      const ra = a.reorderLevel > 0 ? a.availableQuantity / a.reorderLevel : 0
      const rb = b.reorderLevel > 0 ? b.availableQuantity / b.reorderLevel : 0
      return ra - rb
    })

    return reply.send({ success: true, data: items })
  })

  // GET /api/v1/inventory/alerts/expiry
  app.get('/alerts/expiry', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const days = Number((request.query as { days?: string }).days ?? 90)
    const cutoffDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const batches = await prisma.batch.findMany({
      where: {
        inventoryItem: { tenantId },
        expiryDate: { lte: cutoffDate },
        quantity: { gt: 0 },
        isQuarantined: false,
      },
      include: {
        inventoryItem: {
          include: { medicine: { select: { name: true, genericName: true } } },
        },
      },
      orderBy: { expiryDate: 'asc' },
      take: 100,
    })

    const today = new Date()
    const enriched = batches.map((b) => ({
      ...b,
      isExpired: b.expiryDate < today,
      daysUntilExpiry: Math.ceil((b.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    }))

    return reply.send({ success: true, data: enriched })
  })

  // GET /api/v1/inventory/insights — top movers, slow movers, breakdowns
  app.get('/insights', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { days?: string }
    const days = Math.max(7, Math.min(180, Number(query.days) || 30))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Top movers — most units sold in last N days
    const topMoversRaw = await prisma.$queryRaw<{ medicineId: string; medicineName: string; totalSold: bigint; revenue: number }[]>`
      SELECT
        oi."medicineId",
        m.name AS "medicineName",
        SUM(oi.quantity) AS "totalSold",
        SUM(oi.total) AS revenue
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "Medicine" m ON oi."medicineId" = m.id
      WHERE o."tenantId" = ${tenantId}
        AND o.type = 'SALE'
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."createdAt" >= ${since}
      GROUP BY oi."medicineId", m.name
      ORDER BY "totalSold" DESC
      LIMIT 10
    `
    const topMovers = topMoversRaw.map((r) => ({
      medicineId: r.medicineId,
      medicineName: r.medicineName,
      unitsSold: Number(r.totalSold),
      revenue: Number(r.revenue),
    }))

    // Slow movers — medicines in stock but no sales in last N days
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { tenantId, availableQuantity: { gt: 0 } },
      include: {
        medicine: { select: { id: true, name: true, strength: true, mrp: true } },
        batches: { where: { quantity: { gt: 0 } } },
      },
    })

    const recentSales = await prisma.orderItem.findMany({
      where: {
        order: { tenantId, type: 'SALE', createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      },
      select: { medicineId: true },
    })
    const recentlySoldIds = new Set(recentSales.map((s) => s.medicineId))

    const slowMovers = inventoryItems
      .filter((inv) => !recentlySoldIds.has(inv.medicineId))
      .map((inv) => {
        const value = inv.batches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0)
        const oldestBatch = inv.batches.reduce<Date | null>((oldest, b) => !oldest || b.createdAt < oldest ? b.createdAt : oldest, null)
        const daysInStock = oldestBatch ? Math.floor((Date.now() - oldestBatch.getTime()) / (1000 * 60 * 60 * 24)) : 0
        return {
          medicineId: inv.medicine.id,
          medicineName: inv.medicine.name,
          strength: inv.medicine.strength,
          quantity: inv.availableQuantity,
          valueAtCost: value,
          daysInStock,
        }
      })
      .sort((a, b) => b.valueAtCost - a.valueAtCost)
      .slice(0, 10)

    // Breakdown by manufacturer
    const allInv = await prisma.inventoryItem.findMany({
      where: { tenantId },
      include: {
        medicine: { select: { manufacturerName: true, schedule: true } },
        batches: { where: { quantity: { gt: 0 } } },
      },
    })
    const byManufacturer: Record<string, { manufacturer: string; quantity: number; valueAtCost: number; skus: number }> = {}
    const byScheduleMap: Record<string, { schedule: string; quantity: number; valueAtCost: number; skus: number }> = {}
    for (const inv of allInv) {
      const totalQty = inv.batches.reduce((s, b) => s + b.quantity, 0)
      const valueAtCost = inv.batches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0)
      if (totalQty === 0) continue

      const mfr = inv.medicine.manufacturerName || 'Unknown'
      if (!byManufacturer[mfr]) byManufacturer[mfr] = { manufacturer: mfr, quantity: 0, valueAtCost: 0, skus: 0 }
      byManufacturer[mfr].quantity += totalQty
      byManufacturer[mfr].valueAtCost += valueAtCost
      byManufacturer[mfr].skus += 1

      const sched = inv.medicine.schedule || 'OTC'
      if (!byScheduleMap[sched]) byScheduleMap[sched] = { schedule: sched, quantity: 0, valueAtCost: 0, skus: 0 }
      byScheduleMap[sched].quantity += totalQty
      byScheduleMap[sched].valueAtCost += valueAtCost
      byScheduleMap[sched].skus += 1
    }

    // Recent write-offs (last 30 days)
    const writeOffSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const writeOffs = await prisma.batch.findMany({
      where: {
        inventoryItem: { tenantId },
        writtenOffAt: { gte: writeOffSince },
        writeOffQuantity: { gt: 0 },
      },
      include: { inventoryItem: { include: { medicine: { select: { name: true } } } } },
      orderBy: { writtenOffAt: 'desc' },
      take: 20,
    })
    const writeOffStats = writeOffs.reduce(
      (acc, b) => ({
        totalUnits: acc.totalUnits + b.writeOffQuantity,
        totalLoss: acc.totalLoss + b.writeOffQuantity * b.purchasePrice,
      }),
      { totalUnits: 0, totalLoss: 0 }
    )

    return reply.send({
      success: true,
      data: {
        periodDays: days,
        topMovers,
        slowMovers,
        byManufacturer: Object.values(byManufacturer).sort((a, b) => b.valueAtCost - a.valueAtCost).slice(0, 10),
        bySchedule: Object.values(byScheduleMap),
        writeOffs: {
          recentCount: writeOffs.length,
          totalUnits: writeOffStats.totalUnits,
          totalLoss: writeOffStats.totalLoss,
          recent: writeOffs.slice(0, 10).map((b) => ({
            batchId: b.id,
            batchNumber: b.batchNumber,
            medicineName: b.inventoryItem.medicine.name,
            writeOffQuantity: b.writeOffQuantity,
            writeOffReason: b.writeOffReason,
            writtenOffAt: b.writtenOffAt,
            lossValue: b.writeOffQuantity * b.purchasePrice,
          })),
        },
      },
    })
  })

  // POST /api/v1/inventory/batches/:id/write-off — write off some/all units of a batch
  app.post('/batches/:id/write-off', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = z.object({
      quantity: z.number().int().positive(),
      reason: z.string().min(1).default('Expired'),
    }).parse(request.body)

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: { inventoryItem: true },
    })
    if (!batch || batch.inventoryItem.tenantId !== tenantId) {
      return reply.status(404).send({ success: false, error: 'Batch not found' })
    }
    if (body.quantity > batch.quantity) {
      return reply.status(400).send({
        success: false,
        error: `Cannot write off ${body.quantity}; only ${batch.quantity} units in batch`,
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.batch.update({
        where: { id },
        data: {
          quantity: { decrement: body.quantity },
          writeOffQuantity: { increment: body.quantity },
          writeOffReason: body.reason,
          writtenOffAt: new Date(),
        },
      })
      await tx.inventoryItem.update({
        where: { id: batch.inventoryItemId },
        data: {
          totalQuantity: { decrement: body.quantity },
          availableQuantity: { decrement: body.quantity },
        },
      })
      return updated
    })

    await audit(request, {
      action: 'inventory.batch.write-off',
      entityType: 'Batch',
      entityId: result.id,
      newValues: {
        batchNumber: batch.batchNumber,
        writtenOff: body.quantity,
        reason: body.reason,
        lossValue: body.quantity * batch.purchasePrice,
      },
      invalidate: ['inventory', 'inventory-insights', 'alerts-expiry'],
    })

    return reply.send({
      success: true,
      data: {
        batchId: result.id,
        writtenOff: body.quantity,
        remaining: result.quantity,
        lossValue: body.quantity * batch.purchasePrice,
        reason: body.reason,
      },
    })
  })
}
