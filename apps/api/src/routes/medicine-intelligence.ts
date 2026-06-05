import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { normalizeMedicineName, extractMedicinesFromText } from '@rxflow/medicine-intelligence'
import { initializeMatcher } from '@rxflow/medicine-intelligence'
import { env } from '../utils/env.js'

// Cache the matcher in memory
let matcherReady = false

async function ensureMatcherLoaded() {
  if (matcherReady) return
  const medicines = await prisma.medicine.findMany({
    where: { isActive: true },
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

  matcherReady = true
}

export async function medicineIntelligenceRoutes(app: FastifyInstance) {
  // Initialize matcher on plugin load
  app.addHook('onReady', async () => {
    try {
      await ensureMatcherLoaded()
      app.log.info('✅ Medicine Intelligence matcher loaded')
    } catch (err) {
      app.log.warn('⚠️  Medicine Intelligence matcher failed to initialize:', err)
    }
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
    const results = matcher.searchWithStrengthFilter(query, limit)

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

    const results = extracted.map((name) => ({
      extracted: name,
      normalized: normalizeMedicineName(name),
      matches: matcher.search(name, 3),
    }))

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
      const results = matcher.search(q, Number(limit))
      return reply.send({
        success: true,
        data: results.map((r) => r.medicine),
        meta: { source: 'fuzzy-fallback' },
      })
    }
  })

  // POST /api/v1/medicine-intelligence/reload
  // Reload matcher (call after importing new medicines)
  app.post('/reload', { preHandler: [authenticate] }, async (request, reply) => {
    matcherReady = false
    await ensureMatcherLoaded()
    return reply.send({ success: true, message: 'Matcher reloaded' })
  })
}
