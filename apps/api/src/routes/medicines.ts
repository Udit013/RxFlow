import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma, type Prisma } from '@rxflow/db'
import { atcLevel4 } from '@rxflow/types'
import { authenticate } from '../middleware/auth.js'
import { parseUpdate } from '../utils/parse-update.js'
import { catalogWhere, globalCatalogWhere, marketsWhere, parseMarkets, usableWhere, updateMedicineForTenant } from '../utils/medicine-scope.js'
import {
  buildSearchWhere, ingredientsForCreate, normalizeInputIngredients, compositionFields, compositionRows,
  textDefaults, groupAlternatives, rowIngredients, type CatalogRow,
} from '../utils/medicine-catalog.js'
import { getTenantRegion } from '../utils/regional.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'

const optStr = (v: unknown) => (v === '' ? undefined : v)
const DOSAGE_FORMS = ['TABLET','CAPSULE','SYRUP','SOLUTION','INJECTION','CREAM','OINTMENT','DROPS','INHALER','PATCH','SUPPOSITORY','POWDER','SUSPENSION','GEL','LOTION','SPRAY','OTHER'] as const
const SCHEDULES = ['OTC','SCHEDULE_H','SCHEDULE_H1','SCHEDULE_X','SCHEDULE_G'] as const
const isOneOf = <T extends string>(list: readonly T[], v: string | undefined): v is T => !!v && (list as readonly string[]).includes(v)

export const createMedicineSchema = z.object({
  // Required essentials
  name: z.string().min(1),
  manufacturerName: z.string().min(1),
  hsn: z.string().min(1),
  // Everything else optional — sensible defaults applied on create.
  genericName: z.preprocess(optStr, z.string().optional()),
  brandName: z.preprocess(optStr, z.string().optional()),
  division: z.preprocess(optStr, z.string().optional()),
  dosageForm: z.enum(DOSAGE_FORMS).default('TABLET'),
  category: z.preprocess(optStr, z.string().optional()),
  strength: z.preprocess(optStr, z.string().optional()),
  strengthNumeric: z.number().optional(),
  strengthUnit: z.preprocess(optStr, z.string().optional()),
  packSize: z.preprocess(optStr, z.string().optional()),
  packSizeNumeric: z.number().int().optional(),
  packUnit: z.string().default('tablets'),
  mrp: z.number().min(0).optional(),
  gstRate: z.number().min(0).max(100).optional(), // default comes from the tenant's country
  schedule: z.enum(SCHEDULES).default('OTC'),
  requiresPrescription: z.boolean().optional(), // default follows the country's rule for the tier
  aliases: z.array(z.string()).default([]),
  barcodes: z.array(z.string()).default([]),
  searchTokens: z.array(z.string()).default([]),
  // ─── Medicine Master (MARG-style) ───
  status: z.enum(['CONTINUE','DISCONTINUE','INACTIVE']).optional(),
  medicineType: z.enum(['NORMAL','CONTROLLED','OTC','PRESCRIPTION']).optional(),
  shortName: z.string().optional(),
  fastSearchName: z.string().optional(),
  description: z.string().optional(),
  composition: z.string().optional(),
  packing: z.string().optional(),
  primaryUnit: z.string().optional(),
  secondaryUnit: z.string().optional(),
  conversionFactor: z.number().positive().optional(),
  boxQuantity: z.number().int().optional(),
  decimalAllowed: z.boolean().optional(),
  rateA: z.number().optional(),
  rateB: z.number().optional(),
  rateC: z.number().optional(),
  defaultPurchasePrice: z.number().optional(),
  defaultCostPrice: z.number().optional(),
  marginPercent: z.number().optional(),
  taxType: z.string().optional(),
  cess: z.number().optional(),
  defaultReorderLevel: z.number().int().optional(),
  minStock: z.number().int().optional(),
  maxStock: z.number().int().optional(),
  negativeAllowed: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  // ─── Composition & classification ───
  // Structured active ingredients; replaces the stored list when sent. Strength is per unit
  // (tablet, mL, dose) in the given unit.
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    strength: z.number().positive().nullable().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    salt: z.string().trim().max(60).nullable().optional(),
  })).max(10).optional(),
  atcCode: z.preprocess(optStr, z.string().trim().toUpperCase().regex(/^[A-Z]\d{2}([A-Z]{1,2}(\d{2})?)?$/, 'ATC code like N02BE01').optional()),
  therapeuticClass: z.preprocess(optStr, z.string().max(120).optional()),
  dosageFormDetail: z.preprocess(optStr, z.string().max(120).optional()),
  route: z.preprocess(optStr, z.string().max(80).optional()),
})

const CATALOG_SELECT = {
  id: true, name: true, brandName: true, genericName: true, manufacturerName: true, dosageForm: true,
  dosageFormDetail: true, route: true, strength: true, packSize: true, mrp: true, country: true,
  ownerTenantId: true, dataSource: true, sourceUrl: true, isVerified: true, atcCode: true, therapeuticClass: true,
  composition: true, compositions: { select: { ingredient: true, salt: true, strengthNum: true, unit: true } },
} as const

/** ATC code + group name for an ingredient set the open-data classification knows. */
async function classify(ingredientKey: string | null) {
  if (!ingredientKey) return null
  const c = await prisma.ingredientClass.findUnique({ where: { ingredientKey } })
  return c ? { atcCode: c.atcCode, therapeuticClass: c.className } : null
}

export async function medicineRoutes(app: FastifyInstance) {
  // GET /api/v1/medicines
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as {
      page?: string; limit?: string; search?: string;
      dosageForm?: string; schedule?: string; requiresPrescription?: string; category?: string;
      ingredient?: string; atc?: string; source?: string; market?: string; markets?: string;
    }

    const { page, limit, skip, take } = getPaginationParams({
      page: Number(query.page),
      limit: Number(query.limit),
    })

    // markets=IN,US,… picks which countries' shared catalogs to show (one, several or all);
    // market=all is the older spelling of "every market". Default: the pharmacy's own market.
    const markets = parseMarkets(query.markets)
    const scope = markets
      ? marketsWhere(tenantId, (await getTenantRegion(tenantId)).country, markets)
      : query.market === 'all' ? globalCatalogWhere(tenantId) : await catalogWhere(tenantId)
    const and: Prisma.MedicineWhereInput[] = [scope]
    const search = query.search ? buildSearchWhere(query.search) : null
    if (search) and.push(search)
    if (query.ingredient) {
      const ingredientSearch = buildSearchWhere(query.ingredient)
      if (ingredientSearch) and.push(ingredientSearch)
    }
    if (query.atc) and.push({ atcCode: { startsWith: query.atc.trim().toUpperCase() } })
    if (query.source) and.push({ dataSource: query.source })
    const where: Prisma.MedicineWhereInput = { isActive: true, AND: and }

    if (isOneOf(DOSAGE_FORMS, query.dosageForm)) where.dosageForm = query.dosageForm
    if (query.category) where.category = query.category
    if (isOneOf(SCHEDULES, query.schedule)) where.schedule = query.schedule
    if (query.requiresPrescription !== undefined) {
      where.requiresPrescription = query.requiresPrescription === 'true'
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        skip,
        take,
        include: { compositions: true },
        // Own market first when browsing every market, then alphabetical.
        orderBy: [{ name: 'asc' }],
      }),
      prisma.medicine.count({ where }),
    ])

    return reply.send({
      success: true,
      data: medicines.map((m) => ({ ...m, isShared: m.ownerTenantId === null })),
      meta: buildPaginationMeta(total, page, limit),
    })
  })

  // GET /api/v1/medicines/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const medicine = await prisma.medicine.findFirst({
      where: { id, ...usableWhere(tenantId) },
      include: {
        compositions: true,
        substitutes: { include: { substitute: true } },
        manufacturer: true,
      },
    })

    if (!medicine) {
      return reply.status(404).send({ success: false, error: 'Medicine not found' })
    }

    const [source, forkedFrom] = await Promise.all([
      medicine.dataSource ? prisma.medicineDataSource.findUnique({ where: { id: medicine.dataSource } }) : null,
      medicine.forkedFromId
        ? prisma.medicine.findUnique({ where: { id: medicine.forkedFromId }, select: { id: true, name: true, dataSource: true, sourceUrl: true } })
        : null,
    ])

    return reply.send({ success: true, data: { ...medicine, isShared: medicine.ownerTenantId === null, source, forkedFrom } })
  })

  // GET /api/v1/medicines/sources — open-data sources behind the shared catalog, with licences
  app.get('/sources', { preHandler: [authenticate] }, async (_request, reply) => {
    const [sources, byCountry] = await Promise.all([
      prisma.medicineDataSource.findMany({ orderBy: { id: 'asc' } }),
      prisma.medicine.groupBy({ by: ['country', 'dataSource'], where: { ownerTenantId: null, isActive: true }, _count: { _all: true } }),
    ])
    return reply.send({
      success: true,
      data: {
        sources,
        catalog: byCountry.map((r) => ({ country: r.country, dataSource: r.dataSource, count: r._count._all })),
      },
    })
  })

  // GET /api/v1/medicines/:id/alternatives — same composition, variants, and similar-use products
  app.get('/:id/alternatives', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const base = await prisma.medicine.findFirst({ where: { id, ...usableWhere(tenantId) }, select: CATALOG_SELECT })
    if (!base) return reply.status(404).send({ success: false, error: 'Medicine not found' })

    const region = await getTenantRegion(tenantId)
    const ingredients = rowIngredients(base)
    const ingredientKey = compositionFields(ingredients).ingredientKey
    const group4 = atcLevel4(base.atcCode)
    const visible = globalCatalogWhere(tenantId)

    const names = ingredients.map((i) => i.name)
    const [sameIngredients, combinations, similar, availability] = await Promise.all([
      ingredientKey
        ? prisma.medicine.findMany({ where: { AND: [visible, { isActive: true, ingredientKey }] }, select: CATALOG_SELECT, take: 300 })
        : [],
      // Combinations that share at least one active ingredient.
      names.length
        ? prisma.medicine.findMany({
            where: { AND: [visible, { isActive: true, compositions: { some: { ingredient: { in: names } } } }, ...(ingredientKey ? [{ NOT: { ingredientKey } }] : [])] },
            select: CATALOG_SELECT,
            orderBy: { name: 'asc' },
            take: 120,
          })
        : [],
      // Similar therapeutic use: same ATC level-4 group, different ingredients. Other markets are
      // included as reference (flagged), since a small local catalog may hold none.
      group4
        ? prisma.medicine.findMany({
            where: { AND: [visible, { isActive: true, atcCode: { startsWith: group4 } }, ...(ingredientKey ? [{ NOT: { ingredientKey } }] : [])] },
            select: CATALOG_SELECT,
            orderBy: { name: 'asc' },
            take: 80,
          })
        : [],
      ingredientKey
        ? prisma.medicine.groupBy({ by: ['country'], where: { ownerTenantId: null, isActive: true, ingredientKey }, _count: { _all: true } })
        : [],
    ])
    const candidates = [...sameIngredients, ...combinations, ...similar] as CatalogRow[]
    const stockRows = candidates.length
      ? await prisma.inventoryItem.groupBy({
          by: ['medicineId'],
          where: { tenantId, medicineId: { in: candidates.map((c) => c.id) }, isActive: true },
          _sum: { availableQuantity: true },
        })
      : []
    const stock = new Map(stockRows.map((s) => [s.medicineId, s._sum.availableQuantity ?? 0]))
    const groups = groupAlternatives(base as CatalogRow, candidates, { tenantId, country: region.country, stock })

    return reply.send({
      success: true,
      data: {
        ...groups,
        base: { id: base.id, name: base.name, ingredientKey, atcCode: base.atcCode, therapeuticClass: base.therapeuticClass },
        countryAvailability: availability
          .map((a) => ({ country: a.country, products: a._count._all }))
          .sort((a, b) => b.products - a.products),
        notice:
          'Shown for reference only. Same composition does not mean interchangeable: salt, release mechanism, excipients and ' +
          'bioequivalence can differ, and substitution must follow local law and a pharmacist\'s or prescriber\'s judgement. ' +
          'Combinations and similar-use products contain different active ingredients and are not substitutes.',
      },
    })
  })

  // POST /api/v1/medicines
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { ingredients: ingredientInput, ...body } = createMedicineSchema.parse(request.body)
    const region = await getTenantRegion(request.user.tenantId)
    const ingredients = ingredientsForCreate({ ...body, ingredients: ingredientInput })
    const keys = compositionFields(ingredients)
    const cls = body.atcCode ? null : await classify(keys.ingredientKey)
    const derived = textDefaults(ingredients, body)

    const medicine = await prisma.medicine.create({
      data: {
        ...body,
        ...derived,
        ...keys,
        ...(cls ?? {}),
        dataSource: 'MANUAL',
        ownerTenantId: request.user.tenantId, // private to the creating tenant
        country: region.country,
        gstRate: body.gstRate ?? region.tax.defaultRate,
        requiresPrescription: body.requiresPrescription ?? region.drugSchedules[body.schedule].requiresPrescription,
        // Fill DB-required columns the form may leave blank, derived from essentials.
        genericName: body.genericName || body.name,
        brandName: body.brandName || body.name,
        strength: body.strength || derived.strength || 'NA',
        packSize: body.packSize || body.packing || '1',
        mrp: body.mrp ?? 0,
        isVerified: false,
        compositions: { create: compositionRows('', ingredients).map(({ medicineId: _m, ...c }) => c) },
      },
      include: { compositions: true },
    })

    return reply.status(201).send({ success: true, data: medicine })
  })

  // PUT /api/v1/medicines/:id
  app.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { ingredients: ingredientInput, ...body } = parseUpdate(createMedicineSchema, request.body)
    const { tenantId, role } = request.user

    // A new ingredient list, or a composition text that actually changed, re-derives the
    // structured composition. Re-sending the same text (forms post every field) changes nothing.
    let ingredients = ingredientInput ? normalizeInputIngredients(ingredientInput) : null
    if (!ingredients && body.composition !== undefined) {
      const current = await prisma.medicine.findFirst({ where: { id, ...usableWhere(tenantId) }, select: { composition: true } })
      if (current && (current.composition ?? '') !== body.composition) {
        ingredients = ingredientsForCreate({ name: '', composition: body.composition })
      }
    }
    const changes = ingredients
      ? { ...body, ...textDefaults(ingredients, body), ...compositionFields(ingredients), ...(body.atcCode ? {} : (await classify(compositionFields(ingredients).ingredientKey)) ?? {}) }
      : body

    // Shared catalog rows are never edited in place by a tenant — the edit lands on that
    // tenant's private copy (created on first edit) so other pharmacies are unaffected.
    const { medicine, forked } = await updateMedicineForTenant(tenantId, role, id, changes)
    if (ingredients) {
      await prisma.$transaction([
        prisma.medicineComposition.deleteMany({ where: { medicineId: medicine.id } }),
        prisma.medicineComposition.createMany({ data: compositionRows(medicine.id, ingredients) }),
      ])
    }
    const fresh = await prisma.medicine.findUnique({ where: { id: medicine.id }, include: { compositions: true } })

    return reply.send({ success: true, data: { ...fresh!, isShared: fresh!.ownerTenantId === null }, forked })
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
  app.post('/bulk-import', { preHandler: [authenticate], bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    const bulkSchema = z.object({
      medicines: z.array(createMedicineSchema.partial({
        gstRate: true, schedule: true, requiresPrescription: true, aliases: true, barcodes: true, searchTokens: true,
      })).min(1).max(2000),
    })
    const { medicines } = bulkSchema.parse(request.body)
    const region = await getTenantRegion(request.user.tenantId)

    let created = 0
    let skipped = 0
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < medicines.length; i++) {
      const m = medicines[i]!
      try {
        const existing = await prisma.medicine.findFirst({
          where: {
            ...(await catalogWhere(request.user.tenantId)),
            name: { equals: m.name, mode: 'insensitive' },
            strength: m.strength,
            manufacturerName: { equals: m.manufacturerName, mode: 'insensitive' },
          },
          select: { id: true },
        })
        if (existing) { skipped++; continue }

        const ingredients = ingredientsForCreate({ name: m.name, genericName: m.genericName, strength: m.strength, composition: m.composition, ingredients: m.ingredients })
        const keys = compositionFields(ingredients)
        await prisma.medicine.create({
          data: {
            ...keys,
            ...((await classify(keys.ingredientKey)) ?? {}),
            composition: m.composition,
            dataSource: 'BULK_IMPORT',
            compositions: { create: compositionRows('', ingredients).map(({ medicineId: _m, ...c }) => c) },
            name: m.name,
            genericName: m.genericName || m.name,
            brandName: m.brandName || m.name,
            manufacturerName: m.manufacturerName,
            dosageForm: m.dosageForm,
            strength: m.strength || 'NA',
            packSize: m.packSize || m.packing || '1',
            packUnit: m.packUnit ?? 'tablets',
            mrp: m.mrp ?? 0,
            hsn: m.hsn,
            gstRate: m.gstRate ?? region.tax.defaultRate,
            schedule: m.schedule ?? 'OTC',
            requiresPrescription: m.requiresPrescription ?? region.drugSchedules[m.schedule ?? 'OTC'].requiresPrescription,
            aliases: m.aliases ?? [],
            barcodes: m.barcodes ?? [],
            searchTokens: m.searchTokens ?? [],
            isVerified: false,
            ownerTenantId: request.user.tenantId,
            country: region.country,
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
      where: { barcodes: { has: barcode }, isActive: true, ...(await catalogWhere(request.user.tenantId)) },
      include: { compositions: true },
    })

    if (!medicine) {
      return reply.status(404).send({ success: false, error: 'Medicine not found for barcode' })
    }

    return reply.send({ success: true, data: medicine, matchType: 'BARCODE' })
  })
}
