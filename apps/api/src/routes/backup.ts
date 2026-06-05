import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { audit } from '../utils/audit.js'

/**
 * Tenant-scoped JSON backup/restore.
 * - Export: dumps all tenant data as portable JSON (no SQL, no schema lock-in)
 * - Restore: merges JSON back. Existing rows updated by ID, new rows inserted.
 *
 * Deliberately portable: the JSON file works across machines, across DB versions,
 * and could even feed a future migration to a different DB later.
 */

const BACKUP_VERSION = 1

export async function backupRoutes(app: FastifyInstance) {
  // GET /api/v1/backup/export — Download a full backup as JSON
  app.get('/export', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }

    const [
      tenant, users, userStores, stores, customers, suppliers, salesReps,
      medicines, inventoryItems, batches, orders, orderItems, invoices, invoiceItems,
      payments, ledgerEntries,
    ] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.user.findMany({ where: { tenantId } }),
      prisma.userStore.findMany({ where: { user: { tenantId } } }),
      prisma.store.findMany({ where: { tenantId } }),
      prisma.customer.findMany({ where: { tenantId } }),
      prisma.supplier.findMany({ where: { tenantId } }),
      prisma.salesRep.findMany({ where: { tenantId } }),
      // Medicines are global, but we still dump the IDs referenced by this tenant's inventory
      prisma.medicine.findMany({ take: 5000 }),
      prisma.inventoryItem.findMany({ where: { tenantId } }),
      prisma.batch.findMany({ where: { inventoryItem: { tenantId } } }),
      prisma.order.findMany({ where: { tenantId } }),
      prisma.orderItem.findMany({ where: { order: { tenantId } } }),
      prisma.invoice.findMany({ where: { tenantId } }),
      prisma.invoiceItem.findMany({ where: { invoice: { tenantId } } }),
      prisma.payment.findMany({ where: { tenantId } }),
      prisma.ledgerEntry.findMany({ where: { tenantId } }),
    ])

    const dump = {
      meta: {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tenantId,
        tenantName: tenant?.name,
        rowCounts: {
          users: users.length, stores: stores.length, customers: customers.length,
          suppliers: suppliers.length, salesReps: salesReps.length, medicines: medicines.length,
          inventoryItems: inventoryItems.length, batches: batches.length,
          orders: orders.length, orderItems: orderItems.length,
          invoices: invoices.length, invoiceItems: invoiceItems.length,
          payments: payments.length, ledgerEntries: ledgerEntries.length,
        },
      },
      tenant,
      users: users.map((u) => ({ ...u, passwordHash: undefined, refreshToken: undefined })), // never export secrets
      userStores,
      stores,
      customers,
      suppliers,
      salesReps,
      medicines,
      inventoryItems,
      batches,
      orders,
      orderItems,
      invoices,
      invoiceItems,
      payments,
      ledgerEntries,
    }

    await audit(request, {
      action: 'backup.export',
      entityType: 'Tenant',
      entityId: tenantId,
      newValues: dump.meta.rowCounts,
    })

    const filename = `rxflow-backup-${tenant?.slug ?? 'tenant'}-${new Date().toISOString().slice(0, 10)}.json`
    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(JSON.stringify(dump, null, 2))
  })

  // POST /api/v1/backup/import — Restore (merge) from a backup JSON
  app.post('/import', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }

    const body = z.object({
      dump: z.any(),
      mode: z.enum(['merge', 'medicines-only']).default('merge'),
    }).parse(request.body)

    const dump = body.dump
    if (!dump?.meta || dump.meta.version !== BACKUP_VERSION) {
      return reply.status(400).send({ success: false, error: 'Unsupported backup version' })
    }

    const stats = {
      medicinesInserted: 0, medicinesUpdated: 0,
      customersUpserted: 0, suppliersUpserted: 0, salesRepsUpserted: 0,
    }

    // Medicines are global → safe to upsert without rewriting IDs
    if (Array.isArray(dump.medicines)) {
      for (const m of dump.medicines) {
        const existing = await prisma.medicine.findUnique({ where: { id: m.id } })
        if (existing) {
          await prisma.medicine.update({
            where: { id: m.id },
            data: {
              name: m.name, genericName: m.genericName, brandName: m.brandName,
              manufacturerName: m.manufacturerName, dosageForm: m.dosageForm,
              strength: m.strength, packSize: m.packSize, mrp: m.mrp, hsn: m.hsn,
              gstRate: m.gstRate, schedule: m.schedule, requiresPrescription: m.requiresPrescription,
              isActive: m.isActive,
            },
          })
          stats.medicinesUpdated++
        } else {
          try {
            await prisma.medicine.create({ data: m })
            stats.medicinesInserted++
          } catch (e) {
            request.log.warn({ err: e, medicineId: m.id }, 'medicine restore skipped')
          }
        }
      }
    }

    if (body.mode === 'merge') {
      // Customers: upsert by tenantId+phone
      if (Array.isArray(dump.customers)) {
        for (const c of dump.customers) {
          if (c.tenantId !== tenantId) continue // safety: never cross-import
          try {
            await prisma.customer.upsert({
              where: { tenantId_phone: { tenantId, phone: c.phone } },
              update: { name: c.name, email: c.email, gstin: c.gstin, city: c.city, state: c.state, pincode: c.pincode, addressLine1: c.addressLine1, creditLimit: c.creditLimit, notes: c.notes },
              create: { ...c, tenantId },
            })
            stats.customersUpserted++
          } catch (e) {
            request.log.warn({ err: e }, 'customer restore failed')
          }
        }
      }

      if (Array.isArray(dump.suppliers)) {
        for (const s of dump.suppliers) {
          if (s.tenantId !== tenantId) continue
          try {
            // Suppliers have no unique key besides ID + tenant, so create-if-missing by id
            await prisma.supplier.upsert({
              where: { id: s.id },
              update: { name: s.name, companyName: s.companyName, phone: s.phone, email: s.email, gstin: s.gstin, city: s.city, state: s.state, pincode: s.pincode, creditDays: s.creditDays, creditLimit: s.creditLimit, notes: s.notes },
              create: { ...s, tenantId },
            })
            stats.suppliersUpserted++
          } catch (e) {
            request.log.warn({ err: e }, 'supplier restore failed')
          }
        }
      }

      if (Array.isArray(dump.salesReps)) {
        for (const r of dump.salesReps) {
          if (r.tenantId !== tenantId) continue
          try {
            await prisma.salesRep.upsert({
              where: { tenantId_phone: { tenantId, phone: r.phone } },
              update: { name: r.name, email: r.email, employeeCode: r.employeeCode, territory: r.territory, defaultCommissionPercent: r.defaultCommissionPercent, flatBonusAmount: r.flatBonusAmount, isActive: r.isActive },
              create: { ...r, tenantId },
            })
            stats.salesRepsUpserted++
          } catch (e) {
            request.log.warn({ err: e }, 'sales rep restore failed')
          }
        }
      }
    }

    await audit(request, {
      action: 'backup.import',
      entityType: 'Tenant',
      entityId: tenantId,
      newValues: { mode: body.mode, ...stats, sourceMeta: dump.meta },
      invalidate: ['customers', 'suppliers', 'sales-reps', 'medicines'],
    })

    return reply.send({ success: true, data: stats })
  })

  // ─── Generic CSV imports (from other pharmacy apps) ─────────────────────────

  // POST /api/v1/backup/import-customers — bulk customer CSV
  app.post('/import-customers', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = z.object({
      rows: z.array(z.object({
        name: z.string().min(1),
        phone: z.string().min(10),
        email: z.string().optional(),
        gstin: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        addressLine1: z.string().optional(),
        creditLimit: z.number().default(0),
      })).min(1).max(5000),
    }).parse(request.body)

    let inserted = 0, updated = 0
    const errors: Array<{ row: number; name: string; phone: string; reason: string }> = []
    for (let i = 0; i < body.rows.length; i++) {
      const c = body.rows[i]!
      try {
        const existing = await prisma.customer.findUnique({
          where: { tenantId_phone: { tenantId, phone: c.phone } },
        })
        if (existing) {
          await prisma.customer.update({ where: { id: existing.id }, data: c })
          updated++
        } else {
          await prisma.customer.create({ data: { ...c, tenantId } })
          inserted++
        }
      } catch (e: any) {
        const reason = e?.code === 'P2002' ? 'Duplicate (phone conflict)' : (e?.message ?? 'Unknown error').slice(0, 200)
        errors.push({ row: i + 1, name: c.name, phone: c.phone, reason })
        request.log.warn({ err: e, customer: c.phone }, 'customer import failed')
      }
    }

    await audit(request, {
      action: 'customer.bulk-import',
      entityType: 'Customer',
      newValues: { inserted, updated, errorCount: errors.length, total: body.rows.length },
      invalidate: ['customers'],
    })

    return reply.send({ success: true, data: { inserted, updated, errors } })
  })

  // POST /api/v1/backup/import-suppliers — bulk supplier CSV
  app.post('/import-suppliers', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = z.object({
      rows: z.array(z.object({
        name: z.string().min(1),
        companyName: z.string().min(1),
        phone: z.string().min(10),
        email: z.string().optional(),
        gstin: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        creditDays: z.number().int().default(30),
      })).min(1).max(5000),
    }).parse(request.body)

    let inserted = 0
    const errors: Array<{ row: number; name: string; phone: string; reason: string }> = []
    for (let i = 0; i < body.rows.length; i++) {
      const s = body.rows[i]!
      try {
        await prisma.supplier.create({ data: { ...s, tenantId, creditLimit: 0, tags: [] } })
        inserted++
      } catch (e: any) {
        const reason = e?.code === 'P2002' ? 'Duplicate (already exists)' : (e?.message ?? 'Unknown error').slice(0, 200)
        errors.push({ row: i + 1, name: s.name, phone: s.phone, reason })
        request.log.warn({ err: e, supplier: s.name }, 'supplier import failed')
      }
    }

    await audit(request, {
      action: 'supplier.bulk-import',
      entityType: 'Supplier',
      newValues: { inserted, errorCount: errors.length, total: body.rows.length },
      invalidate: ['suppliers'],
    })

    return reply.send({ success: true, data: { inserted, errors } })
  })
}
