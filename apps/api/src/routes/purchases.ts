import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getFinancialYear, getFinancialYearBounds, formatFyNumber } from '../utils/financial-year.js'

const importRowSchema = z.object({
  medicineId: z.string(),
  batchNumber: z.string().min(1),
  expiryDate: z.string().transform((d) => new Date(d)),
  quantity: z.number().int().positive(),
  purchasePrice: z.number().positive(),
  mrp: z.number().positive(),
  sellingPrice: z.number().positive().optional(),
  gstRate: z.number().min(0).max(28).default(12),
  discountPercent: z.number().min(0).max(100).default(0),
})

const importSchema = z.object({
  supplierId: z.string(),
  storeId: z.string(),
  notes: z.string().optional(),
  rows: z.array(importRowSchema).min(1),
})

export async function purchaseRoutes(app: FastifyInstance) {
  // POST /api/v1/purchases/bulk-import — Create a PURCHASE order + batches from resolved rows
  app.post('/bulk-import', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = importSchema.parse(request.body)

    // Verify supplier + store belong to tenant
    const [supplier, store] = await Promise.all([
      prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId } }),
      prisma.store.findFirst({ where: { id: body.storeId, tenantId } }),
    ])
    if (!supplier) return reply.status(400).send({ success: false, error: 'Supplier not found' })
    if (!store) return reply.status(400).send({ success: false, error: 'Store not found' })

    // Verify all medicine IDs exist
    const medicineIds = Array.from(new Set(body.rows.map((r) => r.medicineId)))
    const medicines = await prisma.medicine.findMany({ where: { id: { in: medicineIds } } })
    const medicineMap = new Map(medicines.map((m) => [m.id, m]))
    const missing = medicineIds.filter((id) => !medicineMap.has(id))
    if (missing.length > 0) {
      return reply.status(400).send({ success: false, error: `Medicines not found: ${missing.join(', ')}` })
    }

    // Compute order totals
    const totals = body.rows.reduce(
      (acc, r) => {
        const lineTotal = r.quantity * r.purchasePrice
        const discountAmount = (lineTotal * r.discountPercent) / 100
        const taxable = lineTotal - discountAmount
        const tax = (taxable * r.gstRate) / 100
        acc.subtotal += lineTotal
        acc.discountAmount += discountAmount
        acc.taxAmount += tax
        acc.total += taxable + tax
        return acc
      },
      { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 }
    )

    // Generate FY-aware PO number
    const fy = getFinancialYear()
    const { from, to } = getFinancialYearBounds()
    const seq = await prisma.order.count({
      where: { tenantId, type: 'PURCHASE', createdAt: { gte: from, lt: to } },
    })
    const orderNumber = formatFyNumber('PO', fy.label, seq + 1)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create PURCHASE order
      const order = await tx.order.create({
        data: {
          orderNumber,
          tenantId,
          storeId: body.storeId,
          type: 'PURCHASE',
          status: 'CONFIRMED',
          supplierId: body.supplierId,
          ...totals,
          paymentMethod: 'CREDIT',
          notes: body.notes,
          createdBy: userId,
          items: {
            create: body.rows.map((r) => {
              const lineTotal = r.quantity * r.purchasePrice
              const discountAmount = (lineTotal * r.discountPercent) / 100
              const taxable = lineTotal - discountAmount
              const taxAmount = (taxable * r.gstRate) / 100
              return {
                medicineId: r.medicineId,
                quantity: r.quantity,
                unitPrice: r.purchasePrice,
                discountPercent: r.discountPercent,
                taxRate: r.gstRate,
                taxAmount,
                total: taxable + taxAmount,
              }
            }),
          },
        },
      })

      // 2. Create batches + ensure inventory items exist
      const createdBatches: Array<{ batchId: string; medicineId: string; quantity: number }> = []
      for (const r of body.rows) {
        const med = medicineMap.get(r.medicineId)!

        let inventoryItem = await tx.inventoryItem.findUnique({
          where: { tenantId_storeId_medicineId: { tenantId, storeId: body.storeId, medicineId: r.medicineId } },
        })
        if (!inventoryItem) {
          inventoryItem = await tx.inventoryItem.create({
            data: {
              tenantId,
              storeId: body.storeId,
              medicineId: r.medicineId,
              sellingPrice: r.sellingPrice ?? r.mrp,
              reorderLevel: 10,
              reorderQuantity: 50,
            },
          })
        }

        const batch = await tx.batch.create({
          data: {
            inventoryItemId: inventoryItem.id,
            batchNumber: r.batchNumber,
            expiryDate: r.expiryDate,
            quantity: r.quantity,
            purchasePrice: r.purchasePrice,
            mrp: r.mrp,
            supplierId: body.supplierId,
            purchaseOrderId: order.id,
          },
        })

        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: {
            totalQuantity: { increment: r.quantity },
            availableQuantity: { increment: r.quantity },
          },
        })

        createdBatches.push({ batchId: batch.id, medicineId: r.medicineId, quantity: r.quantity })
        void med // keep ref for future logging
      }

      // 3. Bump supplier totals
      await tx.supplier.update({
        where: { id: body.supplierId },
        data: { totalPurchases: { increment: totals.total } },
      })

      return { order, batchCount: createdBatches.length }
    })

    return reply.status(201).send({
      success: true,
      data: { orderId: result.order.id, orderNumber: result.order.orderNumber, batchCount: result.batchCount },
    })
  })

  // POST /api/v1/purchases/match-medicines — bulk fuzzy-match medicine names from CSV
  // Body: { names: string[] } → returns [{ input, candidates: [{ id, name, score }] }]
  app.post('/match-medicines', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({ names: z.array(z.string().min(1)).max(500) }).parse(request.body)

    const allMedicines = await prisma.medicine.findMany({
      where: { isActive: true },
      select: { id: true, name: true, genericName: true, brandName: true, strength: true, manufacturerName: true, mrp: true, hsn: true, gstRate: true, dosageForm: true },
      take: 5000,
    })

    function normalize(s: string): string {
      return s
        .toLowerCase()
        // Insert space between letter and digit transitions: dolo650 → dolo 650
        .replace(/([a-z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-z])/g, '$1 $2')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    }
    const indexed = allMedicines.map((m) => ({
      ...m,
      _idx: normalize(`${m.name} ${m.brandName} ${m.genericName} ${m.strength}`),
    }))

    function scoreMatch(query: string, target: string): number {
      if (target.includes(query)) return 1 - (target.length - query.length) / Math.max(target.length, 1) / 4
      // Token overlap
      const qTokens = new Set(query.split(' ').filter(Boolean))
      const tTokens = new Set(target.split(' ').filter(Boolean))
      if (qTokens.size === 0) return 0
      let hits = 0
      for (const q of qTokens) if (tTokens.has(q)) hits++
      return (hits / qTokens.size) * 0.85
    }

    const results = body.names.map((input) => {
      const q = normalize(input)
      const ranked = indexed
        .map((m) => ({ medicine: m, score: scoreMatch(q, m._idx) }))
        .filter((r) => r.score > 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((r) => ({
          id: r.medicine.id,
          name: r.medicine.name,
          strength: r.medicine.strength,
          manufacturer: r.medicine.manufacturerName,
          mrp: r.medicine.mrp,
          hsn: r.medicine.hsn,
          gstRate: r.medicine.gstRate,
          score: Number(r.score.toFixed(2)),
        }))
      return { input, candidates: ranked }
    })

    return reply.send({ success: true, data: results })
  })
}
