/**
 * Medicine catalog scoping.
 *
 *  - Medicine.country = the market a SHARED row belongs to (NULL = international).
 *
 * `Medicine` is one table shared by every tenant:
 *  - ownerTenantId = NULL  → shared catalog row (seeded / pre-existing). Read-only to tenants.
 *  - ownerTenantId = T     → private to tenant T (created by T, or T's edited copy of a shared row).
 * When tenant T edits a shared row we "fork" it: create T's private copy (forkedFromId → original),
 * move T's stock onto the copy, and hide the original from T's catalog views. Other tenants keep
 * seeing the untouched original. Historical order/invoice lines keep pointing at the original.
 */
import type { Prisma } from '@rxflow/db'
import { prisma } from '@rxflow/db'
import { httpError } from './http-error.js'
import { getTenantRegion } from './regional.js'

/**
 * Catalog listing/search filter: the tenant's own rows, plus shared rows for its market
 * (country, or international = NULL) that it hasn't replaced with a private copy. Brand names
 * differ by country, so a US pharmacy is not shown India's catalog and vice versa.
 */
export async function catalogWhere(tenantId: string): Promise<Prisma.MedicineWhereInput> {
  const { country } = await getTenantRegion(tenantId)
  return {
    OR: [
      { ownerTenantId: tenantId },
      {
        ownerTenantId: null,
        forks: { none: { ownerTenantId: tenantId } },
        OR: [{ country }, { country: null }],
      },
    ],
  }
}

/**
 * Every market's shared catalog plus the tenant's own rows (minus shared rows it replaced with a
 * copy). Used for cross-country reference views — other markets' rows stay read-only.
 */
export function globalCatalogWhere(tenantId: string): Prisma.MedicineWhereInput {
  return {
    OR: [
      { ownerTenantId: tenantId },
      { ownerTenantId: null, forks: { none: { ownerTenantId: tenantId } } },
    ],
  }
}

/**
 * The shared catalogs of the chosen markets (country codes; 'INTL' = rows with no country), minus
 * shared rows this tenant replaced with a copy. The tenant's own rows belong to its home market,
 * so they are included whenever that market is chosen.
 */
export function marketsWhere(tenantId: string, homeCountry: string, markets: string[]): Prisma.MedicineWhereInput {
  const countries = markets.filter((m) => m !== 'INTL')
  const sharedIn: Prisma.MedicineWhereInput[] = []
  if (countries.length) sharedIn.push({ country: { in: countries } })
  if (markets.includes('INTL')) sharedIn.push({ country: null })
  const or: Prisma.MedicineWhereInput[] = [{ ownerTenantId: null, forks: { none: { ownerTenantId: tenantId } }, OR: sharedIn }]
  if (markets.includes(homeCountry)) or.push({ ownerTenantId: tenantId })
  return { OR: or }
}

/** "in, us,INTL,xx1" → ['IN', 'US', 'INTL'] — anything that isn't a country code or INTL is dropped. */
export function parseMarkets(raw: string | undefined): string[] | null {
  if (!raw) return null
  const list = [...new Set(raw.split(',').map((m) => m.trim().toUpperCase()).filter((m) => /^[A-Z]{2}$/.test(m) || m === 'INTL'))]
  return list.length ? list : null
}

/** Looser filter for direct lookups by id: any row this tenant may reference (shared or own). */
export function usableWhere(tenantId: string): Prisma.MedicineWhereInput {
  return { OR: [{ ownerTenantId: null }, { ownerTenantId: tenantId }] }
}

/** Throws 404 unless every id is a shared medicine or one owned by this tenant. */
export async function assertMedicinesUsable(tenantId: string, ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  if (unique.length === 0) return
  const count = await prisma.medicine.count({ where: { id: { in: unique }, ...usableWhere(tenantId) } })
  if (count !== unique.length) throw httpError(404, 'Medicine not found')
}

/** Fields copied when a tenant forks a shared medicine (everything except identity/ownership/timestamps). */
// sourceRef stays on the original: (dataSource, sourceRef) identifies one open-data record.
const NON_COPIED = new Set(['id', 'ownerTenantId', 'forkedFromId', 'createdAt', 'updatedAt', 'isVerified', 'sourceRef'])

/**
 * Apply `changes` to medicine `id` on behalf of `tenantId`.
 * Own rows (and, for SUPER_ADMIN, shared rows) are updated in place; a shared row is forked.
 * Returns the row the tenant should use from now on.
 */
export async function updateMedicineForTenant(
  tenantId: string,
  role: string,
  id: string,
  changes: Prisma.MedicineUpdateInput & Record<string, unknown>,
) {
  const medicine = await prisma.medicine.findFirst({ where: { id, ...usableWhere(tenantId) } })
  if (!medicine) throw httpError(404, 'Medicine not found')

  if (medicine.ownerTenantId === tenantId || (medicine.ownerTenantId === null && role === 'SUPER_ADMIN')) {
    return { medicine: await prisma.medicine.update({ where: { id }, data: changes }), forked: false }
  }

  // Shared row → reuse this tenant's existing copy if one exists, else create it.
  const existingFork = await prisma.medicine.findFirst({ where: { forkedFromId: id, ownerTenantId: tenantId } })
  if (existingFork) {
    return { medicine: await prisma.medicine.update({ where: { id: existingFork.id }, data: changes }), forked: true }
  }

  const base = Object.fromEntries(Object.entries(medicine).filter(([k]) => !NON_COPIED.has(k)))
  const fork = await prisma.$transaction(async (tx) => {
    const created = await tx.medicine.create({
      data: {
        ...(base as unknown as Prisma.MedicineUncheckedCreateInput),
        ...(changes as unknown as Prisma.MedicineUncheckedCreateInput),
        ownerTenantId: tenantId,
        forkedFromId: id,
        isVerified: false,
      },
    })
    const compositions = await tx.medicineComposition.findMany({ where: { medicineId: id } })
    if (compositions.length > 0) {
      await tx.medicineComposition.createMany({
        data: compositions.map(({ id: _id, medicineId: _m, ...c }) => ({ ...c, medicineId: created.id })),
      })
    }
    // Move this tenant's live stock onto its copy. (tenantId, storeId, medicineId) stays unique
    // because the copy is brand new. Past orders/invoices intentionally keep the original id.
    await tx.inventoryItem.updateMany({ where: { tenantId, medicineId: id }, data: { medicineId: created.id } })
    return created
  })
  return { medicine: fork, forked: true }
}
