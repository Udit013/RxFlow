import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { getFinancialYear, getFinancialYearBounds, formatFyNumber } from '../utils/financial-year.js'
import { audit } from '../utils/audit.js'

const transferItemSchema = z.object({
  medicineId: z.string(),
  fromBatchId: z.string().optional(),
  quantity: z.number().int().positive(),
})

export async function stockTransferRoutes(app: FastifyInstance) {
  // GET /api/v1/stock-transfers
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = request.query as { page?: string; limit?: string; status?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(q.page), limit: Number(q.limit) })

    const where: Record<string, unknown> = { tenantId }
    if (q.status) where.status = q.status

    const [transfers, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: { items: { select: { id: true, quantity: true } } },
      }),
      prisma.stockTransfer.count({ where }),
    ])

    // Resolve store names
    const storeIds = Array.from(new Set(transfers.flatMap((t) => [t.fromStoreId, t.toStoreId])))
    const stores = storeIds.length > 0
      ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, code: true } })
      : []
    const storeMap = new Map(stores.map((s) => [s.id, s]))

    const enriched = transfers.map((t) => ({
      ...t,
      lineCount: t.items.length,
      totalUnits: t.items.reduce((s, i) => s + i.quantity, 0),
      fromStore: storeMap.get(t.fromStoreId) ?? null,
      toStore: storeMap.get(t.toStoreId) ?? null,
      items: undefined,
    }))

    return reply.send({ success: true, data: enriched, meta: buildPaginationMeta(total, page, limit) })
  })

  // GET /api/v1/stock-transfers/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const transfer = await prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { items: true },
    })
    if (!transfer) return reply.status(404).send({ success: false, error: 'Transfer not found' })

    const [stores, medicines, batches] = await Promise.all([
      prisma.store.findMany({ where: { id: { in: [transfer.fromStoreId, transfer.toStoreId] } } }),
      prisma.medicine.findMany({
        where: { id: { in: transfer.items.map((i) => i.medicineId) } },
        select: { id: true, name: true, strength: true, dosageForm: true, mrp: true },
      }),
      prisma.batch.findMany({
        where: { id: { in: transfer.items.map((i) => i.fromBatchId).filter(Boolean) as string[] } },
        select: { id: true, batchNumber: true, expiryDate: true, purchasePrice: true, mrp: true },
      }),
    ])

    const storeMap = new Map(stores.map((s) => [s.id, s]))
    const medMap = new Map(medicines.map((m) => [m.id, m]))
    const batchMap = new Map(batches.map((b) => [b.id, b]))

    const items = transfer.items.map((i) => ({
      ...i,
      medicine: medMap.get(i.medicineId) ?? null,
      batch: i.fromBatchId ? batchMap.get(i.fromBatchId) ?? null : null,
    }))

    return reply.send({
      success: true,
      data: {
        ...transfer,
        items,
        fromStore: storeMap.get(transfer.fromStoreId) ?? null,
        toStore: storeMap.get(transfer.toStoreId) ?? null,
      },
    })
  })

  // POST /api/v1/stock-transfers — Create + immediately move stock
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = z.object({
      fromStoreId: z.string(),
      toStoreId: z.string(),
      notes: z.string().optional(),
      items: z.array(transferItemSchema).min(1),
    }).parse(request.body)

    if (body.fromStoreId === body.toStoreId) {
      return reply.status(400).send({ success: false, error: 'From and to stores must differ' })
    }

    const [fromStore, toStore] = await Promise.all([
      prisma.store.findFirst({ where: { id: body.fromStoreId, tenantId } }),
      prisma.store.findFirst({ where: { id: body.toStoreId, tenantId } }),
    ])
    if (!fromStore) return reply.status(400).send({ success: false, error: 'Source store not found' })
    if (!toStore) return reply.status(400).send({ success: false, error: 'Destination store not found' })

    // FY-aware code: TR/2025-26/00001
    const fy = getFinancialYear()
    const { from, to } = getFinancialYearBounds()
    const seq = await prisma.stockTransfer.count({
      where: { tenantId, createdAt: { gte: from, lt: to } },
    })
    const code = formatFyNumber('TR', fy.label, seq + 1)

    // Atomic: validate availability, decrement source, increment dest
    const transfer = await prisma.$transaction(async (tx) => {
      // Pre-validation: every item must have enough source stock
      for (const item of body.items) {
        const sourceInv = await tx.inventoryItem.findUnique({
          where: { tenantId_storeId_medicineId: { tenantId, storeId: body.fromStoreId, medicineId: item.medicineId } },
        })
        if (!sourceInv || sourceInv.availableQuantity < item.quantity) {
          throw new Error(`Insufficient stock at source for medicine ${item.medicineId} (have ${sourceInv?.availableQuantity ?? 0}, need ${item.quantity})`)
        }
        if (item.fromBatchId) {
          const sourceBatch = await tx.batch.findUnique({ where: { id: item.fromBatchId } })
          if (!sourceBatch || sourceBatch.quantity < item.quantity) {
            throw new Error(`Insufficient quantity in batch for medicine ${item.medicineId}`)
          }
        }
      }

      // Create the transfer record (COMPLETED in one shot for now — could be IN_TRANSIT later)
      const t = await tx.stockTransfer.create({
        data: {
          tenantId,
          code,
          fromStoreId: body.fromStoreId,
          toStoreId: body.toStoreId,
          status: 'COMPLETED',
          notes: body.notes,
          createdBy: userId,
          completedBy: userId,
          completedAt: new Date(),
          items: { create: body.items },
        },
      })

      // Move stock
      for (const item of body.items) {
        // Source: decrement inventoryItem + (optionally) specific batch
        const sourceInv = await tx.inventoryItem.findUnique({
          where: { tenantId_storeId_medicineId: { tenantId, storeId: body.fromStoreId, medicineId: item.medicineId } },
        })
        await tx.inventoryItem.update({
          where: { id: sourceInv!.id },
          data: {
            totalQuantity: { decrement: item.quantity },
            availableQuantity: { decrement: item.quantity },
          },
        })

        let sourceBatchRecord = null as null | { batchNumber: string; expiryDate: Date; purchasePrice: number; mrp: number; manufacturingDate: Date | null }
        if (item.fromBatchId) {
          const b = await tx.batch.update({
            where: { id: item.fromBatchId },
            data: { quantity: { decrement: item.quantity } },
          })
          sourceBatchRecord = { batchNumber: b.batchNumber, expiryDate: b.expiryDate, purchasePrice: b.purchasePrice, mrp: b.mrp, manufacturingDate: b.manufacturingDate }
        }

        // Destination: find-or-create inventoryItem; create a new batch row mirroring the source
        let destInv = await tx.inventoryItem.findUnique({
          where: { tenantId_storeId_medicineId: { tenantId, storeId: body.toStoreId, medicineId: item.medicineId } },
        })
        if (!destInv) {
          const med = await tx.medicine.findUnique({ where: { id: item.medicineId } })
          destInv = await tx.inventoryItem.create({
            data: {
              tenantId,
              storeId: body.toStoreId,
              medicineId: item.medicineId,
              sellingPrice: med?.mrp ?? sourceBatchRecord?.mrp ?? 0,
              reorderLevel: 10,
              reorderQuantity: 50,
            },
          })
        }

        await tx.inventoryItem.update({
          where: { id: destInv.id },
          data: {
            totalQuantity: { increment: item.quantity },
            availableQuantity: { increment: item.quantity },
          },
        })

        if (sourceBatchRecord) {
          // Mirror the batch to destination so expiry/price tracking continues
          await tx.batch.create({
            data: {
              inventoryItemId: destInv.id,
              batchNumber: sourceBatchRecord.batchNumber,
              expiryDate: sourceBatchRecord.expiryDate,
              manufacturingDate: sourceBatchRecord.manufacturingDate,
              quantity: item.quantity,
              purchasePrice: sourceBatchRecord.purchasePrice,
              mrp: sourceBatchRecord.mrp,
            },
          })
        }
      }

      return t
    })

    await audit(request, {
      action: 'stock-transfer.complete',
      entityType: 'StockTransfer',
      entityId: transfer.id,
      newValues: {
        code: transfer.code,
        from: fromStore.name,
        to: toStore.name,
        items: body.items.length,
        totalUnits: body.items.reduce((s, i) => s + i.quantity, 0),
      },
      invalidate: ['stock-transfers', 'inventory', 'inventory-insights'],
    })

    return reply.status(201).send({ success: true, data: { id: transfer.id, code: transfer.code } })
  })
}
