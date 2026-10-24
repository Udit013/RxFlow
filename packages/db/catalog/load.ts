/**
 * Loads the committed catalog snapshot (catalog/snapshot/*.json) into the database. Runs on every
 * deploy after the seed; idempotent and cheap when nothing changed:
 *
 *  1. registers the data sources (licence, attribution, snapshot version)
 *  2. upserts ingredient → ATC classifications
 *  3. inserts/updates the shared rows of each source, only when its snapshot version changed
 *  4. backfills composition keys for rows that predate structured compositions
 *  5. classifies any row whose ingredient set has a known ATC code
 *
 * It never deletes rows, never touches tenants' own fields beyond derived composition keys, and
 * leaves shared rows a tenant has edited alone (tenants edit their private copies).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import {
  deriveIngredients, normalizeIngredientName, canonicalStrength, ingredientKey, compositionKey,
  formatComposition, formatStrength, type Ingredient,
} from '@rxflow/types'
import { prisma, Prisma } from '../src/index.js'
import { SOURCES, type SnapshotClass, type SnapshotMedicine } from './types.js'

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), 'snapshot')
const read = <T>(file: string): T => JSON.parse(readFileSync(join(SNAPSHOT, file), 'utf8')) as T

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

const PACK_UNIT: Record<string, string> = {
  TABLET: 'tablets', CAPSULE: 'capsules', SYRUP: 'ml', SOLUTION: 'ml', SUSPENSION: 'ml', DROPS: 'ml',
  INJECTION: 'ml', CREAM: 'g', OINTMENT: 'g', GEL: 'g', LOTION: 'ml', POWDER: 'g', INHALER: 'units',
}

function medicineData(r: SnapshotMedicine) {
  const first = r.ingredients[0]
  return {
    name: r.name,
    genericName: r.genericName,
    brandName: r.brandName,
    manufacturerName: r.manufacturerName,
    dosageForm: r.dosageForm as Prisma.MedicineCreateInput['dosageForm'],
    dosageFormDetail: r.dosageFormDetail,
    route: r.route,
    strength: r.strength,
    strengthNumeric: first?.strength ?? null,
    strengthUnit: first?.unit ?? null,
    packSize: r.packSize ?? '1',
    packUnit: PACK_UNIT[r.dosageForm] ?? 'units',
    mrp: 0, // neither source publishes prices; pharmacies set their own
    hsn: r.productCode,
    gstRate: 0,
    schedule: r.schedule,
    requiresPrescription: r.schedule !== 'OTC' && r.schedule !== 'SCHEDULE_G',
    composition: formatComposition(r.ingredients),
    category: r.category,
    atcCode: r.atcCode,
    therapeuticClass: r.therapeuticClass ?? null,
    ingredientKey: r.ingredientKey,
    compositionKey: r.compositionKey,
    aliases: r.aliases,
    barcodes: r.barcodes,
    isVerified: r.verified,
    country: r.country,
    dataSource: r.source,
    sourceRef: r.sourceRef,
    sourceUrl: r.sourceUrl,
    sourceRetrievedAt: new Date(r.retrievedAt),
  }
}

function compositionRows(medicineId: string, ingredients: Ingredient[]) {
  return ingredients.map((i) => ({
    medicineId,
    ingredient: i.name,
    salt: i.salt ?? null,
    strength: formatStrength(i.strength, i.unit),
    strengthNum: i.strength,
    unit: i.unit ?? '',
  }))
}

async function loadSource(source: string, file: string, version: string): Promise<number> {
  const current = await prisma.medicineDataSource.findUnique({ where: { id: source }, select: { version: true } })
  const rows = read<SnapshotMedicine[]>(file)
  if (current?.version === version) {
    console.info(`   ${source}: snapshot ${version} already loaded (${rows.length} rows)`)
    return rows.length
  }
  const existing = await prisma.medicine.findMany({
    where: { dataSource: source, ownerTenantId: null },
    select: { id: true, sourceRef: true },
  })
  const idByRef = new Map(existing.map((e) => [e.sourceRef!, e.id]))
  const fresh = rows.filter((r) => !idByRef.has(r.sourceRef))
  const known = rows.filter((r) => idByRef.has(r.sourceRef))

  for (const batch of chunk(fresh, 250)) {
    const withIds = batch.map((r) => ({ id: randomUUID(), r }))
    await prisma.$transaction([
      prisma.medicine.createMany({ data: withIds.map(({ id, r }) => ({ id, ...medicineData(r) })) }),
      prisma.medicineComposition.createMany({ data: withIds.flatMap(({ id, r }) => compositionRows(id, r.ingredients)) }),
    ])
  }
  for (const batch of chunk(known, 100)) {
    const ids = batch.map((r) => idByRef.get(r.sourceRef)!)
    await prisma.$transaction([
      ...batch.map((r) => prisma.medicine.update({ where: { id: idByRef.get(r.sourceRef)! }, data: medicineData(r) })),
      prisma.medicineComposition.deleteMany({ where: { medicineId: { in: ids } } }),
      prisma.medicineComposition.createMany({ data: batch.flatMap((r) => compositionRows(idByRef.get(r.sourceRef)!, r.ingredients)) }),
    ])
  }
  console.info(`   ${source}: ${fresh.length} added, ${known.length} refreshed (snapshot ${version})`)
  return rows.length
}

/** Composition keys for rows created before structured compositions existed (any owner). */
async function backfillKeys(): Promise<number> {
  const rows = await prisma.medicine.findMany({
    where: { ingredientKey: null },
    select: { id: true, name: true, genericName: true, strength: true, composition: true, compositions: true },
  })
  let updated = 0
  for (const m of rows) {
    const structured: Ingredient[] = m.compositions.map((c) => {
      const { name, salt } = normalizeIngredientName(c.ingredient)
      return { name, salt: c.salt ?? salt, ...canonicalStrength(c.strengthNum, c.unit || null) }
    })
    const ingredients = structured.length ? structured : deriveIngredients(m)
    const ik = ingredientKey(ingredients)
    if (!ik) continue
    await prisma.$transaction([
      prisma.medicine.update({
        where: { id: m.id },
        data: {
          ingredientKey: ik,
          compositionKey: compositionKey(ingredients),
          // Only fills a blank composition text; anything a pharmacy typed is kept.
          ...(m.composition ? {} : { composition: formatComposition(ingredients) }),
        },
      }),
      ...(structured.length ? [] : [prisma.medicineComposition.createMany({ data: compositionRows(m.id, ingredients) })]),
    ])
    updated++
  }
  return updated
}

async function main() {
  const manifest = read<{ version: string; generatedAt: string; counts: Record<string, number> }>('manifest.json')
  console.info(`==> catalog snapshot ${manifest.version}`)

  const counts: Record<string, number> = {}
  counts.OPENFDA_NDC = await loadSource('OPENFDA_NDC', 'us-openfda.json', manifest.version)
  counts.HC_DPD = await loadSource('HC_DPD', 'ca-dpd.json', manifest.version)
  counts.DEMO_SEED = await prisma.medicine.count({ where: { dataSource: 'DEMO_SEED' } })

  for (const s of SOURCES) {
    const snapshotSource = s.id === 'OPENFDA_NDC' || s.id === 'HC_DPD'
    const data = {
      name: s.name, publisher: s.publisher, country: s.country, url: s.url, license: s.license,
      licenseUrl: s.licenseUrl, attribution: s.attribution, notes: s.notes,
      version: snapshotSource ? manifest.version : null,
      retrievedAt: snapshotSource || s.id === 'NLM_RXNAV' ? new Date(manifest.generatedAt) : null,
      recordCount: counts[s.id] ?? 0,
    }
    await prisma.medicineDataSource.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data })
  }

  const classes = read<SnapshotClass[]>('classes.json')
  for (const batch of chunk(classes, 100)) {
    await prisma.$transaction(batch.map((c) => prisma.ingredientClass.upsert({
      where: { ingredientKey: c.ingredientKey },
      create: c,
      update: { atcCode: c.atcCode, className: c.className, source: c.source },
    })))
  }

  const backfilled = await backfillKeys()
  // Rows with a known ingredient set but no classification yet (manual entries, demo rows).
  const classified = await prisma.$executeRaw`
    UPDATE "Medicine" m SET "atcCode" = c."atcCode", "therapeuticClass" = c."className"
    FROM "IngredientClass" c
    WHERE m."ingredientKey" = c."ingredientKey" AND m."atcCode" IS NULL`
  console.info(`   ${classes.length} classifications, ${backfilled} rows given composition keys, ${classified} rows classified`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
