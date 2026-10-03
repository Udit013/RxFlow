/**
 * Cross-tenant reference guard.
 *
 * Prisma foreign keys only prove a referenced row EXISTS — not that it belongs to the
 * caller's tenant. Any id taken from a request body (store, customer, supplier, batch…)
 * must be checked before it is written into a relation or used as an update target,
 * otherwise one tenant could attach records to — or mutate — another tenant's data.
 */
import { prisma } from '@rxflow/db'
import { httpError } from './http-error.js'

export interface TenantRefs {
  storeIds?: (string | null | undefined)[]
  customerId?: string | null
  supplierId?: string | null
  prescriptionId?: string | null
  salesRepId?: string | null
  batchIds?: (string | null | undefined)[]
}

const uniq = (ids: (string | null | undefined)[] = []) =>
  [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]

export async function assertTenantRefs(tenantId: string, refs: TenantRefs): Promise<void> {
  const storeIds = uniq(refs.storeIds)
  const batchIds = uniq(refs.batchIds)

  const [stores, customer, supplier, prescription, salesRep, batches] = await Promise.all([
    storeIds.length ? prisma.store.count({ where: { tenantId, id: { in: storeIds } } }) : 0,
    refs.customerId ? prisma.customer.count({ where: { tenantId, id: refs.customerId } }) : 1,
    refs.supplierId ? prisma.supplier.count({ where: { tenantId, id: refs.supplierId } }) : 1,
    refs.prescriptionId ? prisma.prescription.count({ where: { tenantId, id: refs.prescriptionId } }) : 1,
    refs.salesRepId ? prisma.salesRep.count({ where: { tenantId, id: refs.salesRepId } }) : 1,
    batchIds.length ? prisma.batch.count({ where: { id: { in: batchIds }, inventoryItem: { tenantId } } }) : 0,
  ])

  if (stores !== storeIds.length) throw httpError(404, 'Store not found')
  if (!customer) throw httpError(404, 'Customer not found')
  if (!supplier) throw httpError(404, 'Supplier not found')
  if (!prescription) throw httpError(404, 'Prescription not found')
  if (!salesRep) throw httpError(404, 'Sales rep not found')
  if (batches !== batchIds.length) throw httpError(404, 'Batch not found')
}
