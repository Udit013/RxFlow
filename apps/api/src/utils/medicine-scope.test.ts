import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => {
  const tx = {
    medicine: { create: vi.fn() },
    medicineComposition: { findMany: vi.fn(), createMany: vi.fn() },
    inventoryItem: { updateMany: vi.fn() },
  }
  return {
    tx,
    prisma: {
      medicine: { findFirst: vi.fn(), update: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  }
})
vi.mock('@rxflow/db', () => ({ prisma: db.prisma }))

const { updateMedicineForTenant } = await import('./medicine-scope.js')

const shared = { id: 'm1', name: 'Dolo 650', ownerTenantId: null, forkedFromId: null, isVerified: true, createdAt: new Date(), updatedAt: new Date() }

describe('updateMedicineForTenant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates a tenant-owned medicine in place', async () => {
    db.prisma.medicine.findFirst.mockResolvedValueOnce({ ...shared, ownerTenantId: 't1' })
    db.prisma.medicine.update.mockResolvedValueOnce({ id: 'm1', ownerTenantId: 't1' })
    const r = await updateMedicineForTenant('t1', 'PHARMACIST', 'm1', { mrp: 30 })
    expect(r.forked).toBe(false)
    expect(db.prisma.medicine.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { mrp: 30 } })
  })

  it('forks a shared medicine and moves only this tenant\'s stock onto the copy', async () => {
    db.prisma.medicine.findFirst.mockResolvedValueOnce(shared).mockResolvedValueOnce(null) // no existing fork
    db.tx.medicine.create.mockResolvedValueOnce({ id: 'm1-copy', ownerTenantId: 't1' })
    db.tx.medicineComposition.findMany.mockResolvedValueOnce([])
    const r = await updateMedicineForTenant('t1', 'TENANT_ADMIN', 'm1', { mrp: 30 })
    expect(r.forked).toBe(true)
    expect(db.prisma.medicine.update).not.toHaveBeenCalled() // shared row untouched
    const data = db.tx.medicine.create.mock.calls[0]![0].data
    expect(data).toMatchObject({ name: 'Dolo 650', mrp: 30, ownerTenantId: 't1', forkedFromId: 'm1' })
    expect(data.id).toBeUndefined()
    expect(db.tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', medicineId: 'm1' },
      data: { medicineId: 'm1-copy' },
    })
  })

  it('re-uses an existing copy on later edits', async () => {
    db.prisma.medicine.findFirst.mockResolvedValueOnce(shared).mockResolvedValueOnce({ id: 'm1-copy' })
    db.prisma.medicine.update.mockResolvedValueOnce({ id: 'm1-copy', ownerTenantId: 't1' })
    const r = await updateMedicineForTenant('t1', 'TENANT_ADMIN', 'm1', { mrp: 31 })
    expect(r.forked).toBe(true)
    expect(db.prisma.medicine.update).toHaveBeenCalledWith({ where: { id: 'm1-copy' }, data: { mrp: 31 } })
    expect(db.tx.medicine.create).not.toHaveBeenCalled()
  })

  it('lets a super admin edit the shared row itself', async () => {
    db.prisma.medicine.findFirst.mockResolvedValueOnce(shared)
    db.prisma.medicine.update.mockResolvedValueOnce(shared)
    const r = await updateMedicineForTenant('t1', 'SUPER_ADMIN', 'm1', { mrp: 30 })
    expect(r.forked).toBe(false)
  })

  it('404s for another tenant\'s private medicine', async () => {
    db.prisma.medicine.findFirst.mockResolvedValueOnce(null)
    await expect(updateMedicineForTenant('t1', 'TENANT_ADMIN', 'm9', {})).rejects.toMatchObject({ statusCode: 404 })
  })
})
