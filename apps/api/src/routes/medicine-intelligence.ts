import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { normalizeMedicineName, extractMedicinesFromText } from '@rxflow/medicine-intelligence'
import { initializeMatcher } from '@rxflow/medicine-intelligence'
import { env } from '../utils/env.js'
import { catalogWhere } from '../utils/medicine-scope.js'

// Cache the matcher in memory. One shared promise, so the background warm-up and a request
// arriving mid-load don't both query and index the catalog.
let matcherLoad: Promise<void> | null = null

function ensureMatcherLoaded(): Promise<void> {
  if (!matcherLoad) {
    matcherLoad = loadMatcher().catch((err) => {
      matcherLoad = null // allow a retry on the next request
      throw err
    })
  }
  return matcherLoad
}

async function loadMatcher() {
  // The matcher is one process-wide index shared by all tenants, so it holds only the shared
  // catalog — never any tenant's private medicines.
  const medicines = await prisma.medicine.findMany({
    where: { isActive: true, ownerTenantId: null },
    include: { compositions: true },
    take: 10000,
  })

  await initializeMatcher(
    medicines.map((m) => ({
      id: m.id,
      name: m.name,
      genericName: m.genericName,
      brandName: m.brandName,
      manufacturerName: m.manufacturerName,
      strength: m.strength,
      dosageForm: m.dosageForm,
      packSize: m.packSize,
      mrp: m.mrp,
      schedule: m.schedule,
      aliases: m.aliases,
      barcodes: m.barcodes,
      searchTokens: m.searchTokens,
    }))
  )
}

/**
 * The matcher is one index of the shared catalog across ALL markets. Keep only results this
 * tenant's catalog shows (its country's shared rows + international ones, minus rows it has
 * replaced with a private copy), preserving the matcher's ranking.
 */
async function visibleToTenant<T extends { medicine: { id: string } }>(tenantId: string, results: T[]): Promise<T[]> {
  if (results.length === 0) return results
  const allowed = await prisma.medicine.findMany({
    where: { id: { in: results.map((r) => r.medicine.id) }, ...(await catalogWhere(tenantId)) },
    select: { id: true },
  })
  const ok = new Set(allowed.map((m) => m.id))
  return results.filter((r) => ok.has(r.medicine.id))
}

export async function medicineIntelligenceRoutes(app: FastifyInstance) {
  // Initialize matcher on plugin load
  // Warm the matcher in the BACKGROUND. Awaiting it here held the server from listening
  // until the whole catalog had been fetched and indexed — on a cold start that stacked a
  // database wake-up and a cross-region query on top of the boot. Routes that need the
  // matcher await the same shared promise.
  app.addHook('onReady', async () => {
    ensureMatcherLoaded()
      .then(() => app.log.info('✅ Medicine Intelligence matcher loaded'))
      .catch((err) => app.log.warn({ err }, '⚠️  Medicine Intelligence matcher failed to initialize'))
  })

  // POST /api/v1/medicine-intelligence/search
  app.post('/search', { preHandler: [authenticate] }, async (request, reply) => {
    const { query, limit = 10 } = z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(10),
    }).parse(request.body)

    await ensureMatcherLoaded()

    const { getMatcher } = await import('@rxflow/medicine-intelligence')
    const matcher = getMatcher()
    // Over-fetch, then drop other markets' entries, so the caller still gets up to `limit`.
    const results = (await visibleToTenant(request.user.tenantId, matcher.searchWithStrengthFilter(query, limit * 3))).slice(0, limit)

    // Log sync event
    await prisma.medicineSyncLog.create({
      data: {
        source: 'api',
        inputText: query,
        normalizedName: normalizeMedicineName(query).normalized,
        resolvedMedicineId: results[0]?.medicine.id,
        confidence: results[0]?.score,
      },
    }).catch(() => {}) // Non-critical

    return reply.send({
      success: true,
      data: results.map((r) => ({
        ...r.medicine,
        matchScore: r.score,
        matchType: r.matchType,
        matchedOn: r.matchedOn,
      })),
      meta: { query, normalized: normalizeMedicineName(query) },
    })
  })

  // POST /api/v1/medicine-intelligence/normalize
  app.post('/normalize', { preHandler: [authenticate] }, async (request, reply) => {
    const { inputs } = z.object({
      inputs: z.array(z.string()).min(1).max(100),
    }).parse(request.body)

    const results = inputs.map((input) => normalizeMedicineName(input))

    return reply.send({ success: true, data: results })
  })

  // POST /api/v1/medicine-intelligence/extract
  // Extract medicine names from free text (prescription, order note, etc.)
  app.post('/extract', { preHandler: [authenticate] }, async (request, reply) => {
    const { text } = z.object({ text: z.string().min(1) }).parse(request.body)

    const extracted = extractMedicinesFromText(text)
    await ensureMatcherLoaded()
    const { getMatcher } = await import('@rxflow/medicine-intelligence')
    const matcher = getMatcher()

    const results = await Promise.all(extracted.map(async (name) => ({
      extracted: name,
      normalized: normalizeMedicineName(name),
      matches: (await visibleToTenant(request.user.tenantId, matcher.search(name, 9))).slice(0, 3),
    })))

    return reply.send({ success: true, data: results })
  })

  // GET /api/v1/medicine-intelligence/search-meilisearch?q=...
  // Meilisearch-powered search (requires Meilisearch running)
  app.get('/search-meilisearch', { preHandler: [authenticate] }, async (request, reply) => {
    const { q, limit = '20', offset = '0' } = request.query as {
      q?: string; limit?: string; offset?: string
    }

    if (!q) return reply.status(400).send({ success: false, error: 'Query parameter q is required' })

    try {
      const { searchMeilisearch } = await import('@rxflow/medicine-intelligence')
      const results = await searchMeilisearch(
        env.MEILISEARCH_HOST,
        env.MEILISEARCH_KEY,
        q,
        { limit: Number(limit), offset: Number(offset) }
      )
      return reply.send({ success: true, data: results.hits, meta: { total: results.estimatedTotalHits } })
    } catch {
      // Fallback to fuzzy search if Meilisearch unavailable
      await ensureMatcherLoaded()
      const { getMatcher } = await import('@rxflow/medicine-intelligence')
      const matcher = getMatcher()
      const results = (await visibleToTenant(request.user.tenantId, matcher.search(q, Number(limit) * 3))).slice(0, Number(limit))
      return reply.send({
        success: true,
        data: results.map((r) => r.medicine),
        meta: { source: 'fuzzy-fallback' },
      })
    }
  })

  // POST /api/v1/medicine-intelligence/reload
  // Reload matcher (call after importing new medicines)
  app.post('/reload', { preHandler: [authenticate] }, async (_request, reply) => {
    matcherLoad = null
    await ensureMatcherLoaded()
    return reply.send({ success: true, message: 'Matcher reloaded' })
  })
}
