import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'

const createMedicineSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().min(1),
  brandName: z.string().min(1),
  manufacturerName: z.string().min(1),
  dosageForm: z.enum(['TABLET','CAPSULE','SYRUP','INJECTION','CREAM','OINTMENT','DROPS','INHALER','PATCH','SUPPOSITORY','POWDER','SUSPENSION','GEL','LOTION','SPRAY','OTHER']),
  category: z.string().optional(),
  strength: z.string().min(1),
  strengthNumeric: z.number().optional(),
  strengthUnit: z.string().optional(),
  packSize: z.string().min(1),
  packSizeNumeric: z.number().int().optional(),
  packUnit: z.string().default('tablets'),
  mrp: z.number().positive(),
  hsn: z.string().min(1),
  gstRate: z.number().default(12),
  schedule: z.enum(['OTC','SCHEDULE_H','SCHEDULE_H1','SCHEDULE_X','SCHEDULE_G']).default('OTC'),
  requiresPrescription: z.boolean().default(false),
  aliases: z.array(z.string()).default([]),
  barcodes: z.array(z.string()).default([]),
  searchTokens: z.array(z.string()).default([]),
})

export async function medicineRoutes(app: FastifyInstance) {
  // GET /api/v1/medicines
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const query = request.query as {
      page?: string; limit?: string; search?: string;
      dosageForm?: string; schedule?: string; requiresPrescription?: string; category?: string;
    }

    const { page, limit, skip, take } = getPaginationParams({
      page: Number(query.page),
      limit: Number(query.limit),
    })

    const where: Record<string, unknown> = { isActive: true }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { genericName: { contains: query.search, mode: 'insensitive' } },
        { brandName: { contains: query.search, mode: 'insensitive' } },
        { manufacturerName: { contains: query.search, mode: 'insensitive' } },
        { aliases: { has: query.search } },
      ]
    }

    if (query.dosageForm) where.dosageForm = query.dosageForm
    if (query.category) where.category = query.category
    if (query.schedule) where.schedule = query.schedule
    if (query.requiresPrescription !== undefined) {
      where.requiresPrescription = query.requiresPrescription === 'true'
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        skip,
        take,
        include: { compositions: true },
        orderBy: { name: 'asc' },
      }),
      prisma.medicine.count({ where }),
    ])

    return reply.send({
      success: true,
      data: medicines,
      meta: buildPaginationMeta(total, page, limit),
    })
  })

  // GET /api/v1/medicines/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const medicine = await prisma.medicine.findUnique({
      where: { id },
      include: {
        compositions: true,
        substitutes: { include: { substitute: true } },
        manufacturer: true,
      },
    })

    if (!medicine) {
      return reply.status(404).send({ success: false, error: 'Medicine not found' })
    }

    return reply.send({ success: true, data: medicine })
  })

  // POST /api/v1/medicines
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const body = createMedicineSchema.parse(request.body)

    const medicine = await prisma.medicine.create({
      data: {
        ...body,
        isVerified: false,
      },
    })

    return reply.status(201).send({ success: true, data: medicine })
  })

  // PUT /api/v1/medicines/:id
  app.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createMedicineSchema.partial().parse(request.body)

    const medicine = await prisma.medicine.update({
      where: { id },
      data: body,
    })

    return reply.send({ success: true, data: medicine })
  })

  // GET /api/v1/medicines/:id/substitutes
  app.get('/:id/substitutes', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const substitutes = await prisma.medicineSubstitute.findMany({
      where: { medicineId: id },
      include: { substitute: { include: { compositions: true } } },
      orderBy: { confidence: 'desc' },
    })

    return reply.send({
      success: true,
      data: substitutes.map((s) => ({ ...s.substitute, confidence: s.confidence })),
    })
  })

  // POST /api/v1/medicines/bulk-import — Bulk import medicines from JSON array
  app.post('/bulk-import', { preHandler: [authenticate] }, async (request, reply) => {
    const bulkSchema = z.object({
      medicines: z.array(createMedicineSchema.partial({
        gstRate: true, schedule: true, requiresPrescription: true, aliases: true, barcodes: true, searchTokens: true,
      })).min(1).max(2000),
    })
    const { medicines } = bulkSchema.parse(request.body)

    let created = 0
    let skipped = 0
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < medicines.length; i++) {
      const m = medicines[i]!
      try {
        const existing = await prisma.medicine.findFirst({
          where: {
            name: { equals: m.name, mode: 'insensitive' },
            strength: m.strength,
            manufacturerName: { equals: m.manufacturerName, mode: 'insensitive' },
          },
          select: { id: true },
        })
        if (existing) { skipped++; continue }

        await prisma.medicine.create({
          data: {
            name: m.name,
            genericName: m.genericName,
            brandName: m.brandName,
            manufacturerName: m.manufacturerName,
            dosageForm: m.dosageForm,
            strength: m.strength,
            packSize: m.packSize,
            packUnit: m.packUnit ?? 'tablets',
            mrp: m.mrp,
            hsn: m.hsn,
            gstRate: m.gstRate ?? 12,
            schedule: m.schedule ?? 'OTC',
            requiresPrescription: m.requiresPrescription ?? false,
            aliases: m.aliases ?? [],
            barcodes: m.barcodes ?? [],
            searchTokens: m.searchTokens ?? [],
            isVerified: false,
          },
        })
        created++
      } catch (err: any) {
        errors.push({ row: i + 1, error: err?.message ?? 'Unknown error' })
      }
    }

    return reply.send({
      success: true,
      data: { created, skipped, errors, total: medicines.length },
    })
  })

  // GET /api/v1/medicines/:id/purchase-history — past batches with supplier + price
  app.get('/:id/purchase-history', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const batches = await prisma.batch.findMany({
      where: {
        inventoryItem: { tenantId, medicineId: id },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    if (batches.length === 0) {
      return reply.send({ success: true, data: { batches: [], suppliers: [], stats: null } })
    }

    const supplierIds = Array.from(new Set(batches.map((b) => b.supplierId).filter(Boolean) as string[]))
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true, companyName: true },
        })
      : []
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

    const enriched = batches.map((b) => ({
      ...b,
      supplier: b.supplierId ? supplierMap.get(b.supplierId) ?? null : null,
    }))

    // Per-supplier rollup
    const bySupplier: Record<string, {
      supplierId: string
      supplierName: string
      lastPurchasePrice: number
      lastPurchaseDate: Date
      avgPurchasePrice: number
      minPurchasePrice: number
      maxPurchasePrice: number
      totalQuantity: number
      batchCount: number
    }> = {}

    for (const b of enriched) {
      if (!b.supplier) continue
      const key = b.supplier.id
      const existing = bySupplier[key]
      if (!existing) {
        bySupplier[key] = {
          supplierId: b.supplier.id,
          supplierName: b.supplier.name,
          lastPurchasePrice: b.purchasePrice,
          lastPurchaseDate: b.createdAt,
          avgPurchasePrice: b.purchasePrice,
          minPurchasePrice: b.purchasePrice,
          maxPurchasePrice: b.purchasePrice,
          totalQuantity: b.quantity,
          batchCount: 1,
        }
      } else {
        existing.batchCount += 1
        existing.totalQuantity += b.quantity
        existing.minPurchasePrice = Math.min(existing.minPurchasePrice, b.purchasePrice)
        existing.maxPurchasePrice = Math.max(existing.maxPurchasePrice, b.purchasePrice)
        existing.avgPurchasePrice =
          (existing.avgPurchasePrice * (existing.batchCount - 1) + b.purchasePrice) / existing.batchCount
      }
    }

    const prices = enriched.map((b) => b.purchasePrice)
    const stats = {
      lastPurchasePrice: enriched[0]!.purchasePrice,
      lastPurchaseDate: enriched[0]!.createdAt,
      lastSupplierName: enriched[0]!.supplier?.name ?? null,
      avgPurchasePrice: prices.reduce((s, p) => s + p, 0) / prices.length,
      minPurchasePrice: Math.min(...prices),
      maxPurchasePrice: Math.max(...prices),
      totalBatches: enriched.length,
      totalQuantityPurchased: enriched.reduce((s, b) => s + b.quantity, 0),
    }

    return reply.send({
      success: true,
      data: {
        batches: enriched,
        suppliers: Object.values(bySupplier).sort((a, b) => a.avgPurchasePrice - b.avgPurchasePrice),
        stats,
      },
    })
  })

  // GET /api/v1/medicines/barcode/:barcode
  app.get('/barcode/:barcode', { preHandler: [authenticate] }, async (request, reply) => {
    const { barcode } = request.params as { barcode: string }

    const medicine = await prisma.medicine.findFirst({
      where: { barcodes: { has: barcode }, isActive: true },
      include: { compositions: true },
    })

    if (!medicine) {
      return reply.status(404).send({ success: false, error: 'Medicine not found for barcode' })
    }

    return reply.send({ success: true, data: medicine, matchType: 'BARCODE' })
  })
}
