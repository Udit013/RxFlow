import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { audit } from '../utils/audit.js'

export async function tenantRoutes(app: FastifyInstance) {
  // GET /api/v1/tenant — Current tenant details
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ success: false, error: 'Tenant not found' })
    return reply.send({ success: true, data: tenant })
  })

  // PATCH /api/v1/tenant — Update tenant info (name, address, settings flags)
  app.patch('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }
    const body = z.object({
      name: z.string().min(2).optional(),
      gstin: z.string().optional(),
      drugLicenseNumber: z.string().optional(),
      drugLicenseExpiryDate: z.string().transform((s) => new Date(s)).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
      allowNegativeStock: z.boolean().optional(),
    }).parse(request.body)

    const updated = await prisma.tenant.update({ where: { id: tenantId }, data: body })
    return reply.send({ success: true, data: updated })
  })

  // GET /api/v1/tenant/users
  app.get('/users', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const users = await prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isActive: true, isEmailVerified: true, lastLoginAt: true, createdAt: true,
        stores: { select: { storeId: true, isPrimary: true, store: { select: { name: true, code: true } } } },
      },
    })
    return reply.send({ success: true, data: users })
  })

  // POST /api/v1/tenant/users — Invite (create) a new user
  app.post('/users', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, role: requesterRole } = request.user
    if (requesterRole !== 'TENANT_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }
    const body = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(10),
      password: z.string().min(8),
      role: z.enum(['TENANT_ADMIN', 'STORE_MANAGER', 'PHARMACIST', 'SALES_REP', 'ACCOUNTANT', 'DELIVERY_STAFF', 'VIEWER']),
      storeIds: z.array(z.string()).default([]),
    }).parse(request.body)

    const existing = await prisma.user.findFirst({ where: { email: body.email } })
    if (existing) return reply.status(409).send({ success: false, error: 'Email already in use' })

    const passwordHash = await bcrypt.hash(body.password, 12)
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash,
        role: body.role,
        stores: body.storeIds.length > 0 ? {
          create: body.storeIds.map((sid, i) => ({ storeId: sid, isPrimary: i === 0 })),
        } : undefined,
      },
    })

    return reply.status(201).send({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  })

  // PATCH /api/v1/tenant/users/:id — Update user (role, active, name, phone)
  app.patch('/users/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, role: requesterRole, userId } = request.user
    if (requesterRole !== 'TENANT_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }
    if (id === userId) {
      return reply.status(400).send({ success: false, error: "Can't modify your own role; ask another admin" })
    }
    const body = z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      role: z.enum(['TENANT_ADMIN', 'STORE_MANAGER', 'PHARMACIST', 'SALES_REP', 'ACCOUNTANT', 'DELIVERY_STAFF', 'VIEWER']).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body)

    const target = await prisma.user.findFirst({ where: { id, tenantId } })
    if (!target) return reply.status(404).send({ success: false, error: 'User not found' })

    const updated = await prisma.user.update({ where: { id }, data: body })
    return reply.send({ success: true, data: { id: updated.id, name: updated.name, role: updated.role, isActive: updated.isActive } })
  })

  // ── Stores CRUD ────────────────────────────────────────────────────────────

  // GET /api/v1/tenant/stores
  app.get('/stores', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const stores = await prisma.store.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ success: true, data: stores })
  })

  // POST /api/v1/tenant/stores
  app.post('/stores', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }
    const body = z.object({
      name: z.string().min(1),
      code: z.string().min(1).regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, numbers, hyphens'),
      addressLine1: z.string().min(1, 'Address required'),
      city: z.string().min(1, 'City required'),
      state: z.string().min(1, 'State required'),
      pincode: z.string().min(4, 'Pincode required'),
      phone: z.string().optional(),
      gstin: z.string().optional(),
      drugLicenseNumber: z.string().optional(),
    }).parse(request.body)

    const existing = await prisma.store.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } })
    if (existing) return reply.status(409).send({ success: false, error: 'Store code already in use' })

    const store = await prisma.store.create({ data: { ...body, tenantId } })

    // Auto-grant the creating admin access to the new store
    await prisma.userStore.create({
      data: { userId, storeId: store.id, isPrimary: false },
    }).catch(() => { /* ignore if already exists */ })

    await audit(request, {
      action: 'store.create',
      entityType: 'Store',
      entityId: store.id,
      newValues: { name: store.name, code: store.code },
      invalidate: ['stores', 'tenant-stores'],
    })

    return reply.status(201).send({ success: true, data: store })
  })

  // PATCH /api/v1/tenant/stores/:id
  app.patch('/stores/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }
    const body = z.object({
      name: z.string().min(1).optional(),
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
      phone: z.string().optional(),
      gstin: z.string().optional(),
      drugLicenseNumber: z.string().optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body)

    const store = await prisma.store.findFirst({ where: { id, tenantId } })
    if (!store) return reply.status(404).send({ success: false, error: 'Store not found' })
    const updated = await prisma.store.update({ where: { id }, data: body })

    await audit(request, {
      action: 'store.update',
      entityType: 'Store',
      entityId: id,
      newValues: body,
      invalidate: ['stores', 'tenant-stores'],
    })

    return reply.send({ success: true, data: updated })
  })

  // DELETE /api/v1/tenant/stores/:id — soft delete (isActive=false)
  app.delete('/stores/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Admin only' })
    }
    const store = await prisma.store.findFirst({ where: { id, tenantId } })
    if (!store) return reply.status(404).send({ success: false, error: 'Store not found' })

    const remaining = await prisma.store.count({ where: { tenantId, isActive: true } })
    if (remaining <= 1) {
      return reply.status(400).send({ success: false, error: 'Cannot disable your only active store' })
    }

    await prisma.store.update({ where: { id }, data: { isActive: false } })
    await audit(request, {
      action: 'store.delete',
      entityType: 'Store',
      entityId: id,
      oldValues: { name: store.name, code: store.code },
      invalidate: ['stores', 'tenant-stores'],
    })
    return reply.send({ success: true })
  })

  // DELETE /api/v1/tenant — permanently delete the whole workspace + all data.
  // Admin-only. Requires the caller to confirm by sending the exact tenant name.
  app.delete('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, role } = request.user
    if (role !== 'TENANT_ADMIN' && role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Only the workspace admin can delete the account' })
    }
    const body = z.object({ confirmName: z.string() }).parse(request.body)

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ success: false, error: 'Workspace not found' })
    if (body.confirmName.trim() !== tenant.name.trim()) {
      return reply.status(400).send({ success: false, error: 'Confirmation text does not match the workspace name' })
    }

    // Delete every tenant-scoped row in dependency order (children first), then the tenant.
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { tenantId } }),
      prisma.ledgerEntry.deleteMany({ where: { tenantId } }),
      prisma.invoiceItem.deleteMany({ where: { invoice: { tenantId } } }),
      prisma.invoice.deleteMany({ where: { tenantId } }),
      prisma.orderItem.deleteMany({ where: { order: { tenantId } } }),
      prisma.order.deleteMany({ where: { tenantId } }),
      prisma.batch.deleteMany({ where: { inventoryItem: { tenantId } } }),
      prisma.inventoryItem.deleteMany({ where: { tenantId } }),
      prisma.payslip.deleteMany({ where: { payrollRun: { tenantId } } }),
      prisma.payrollRun.deleteMany({ where: { tenantId } }),
      prisma.attendance.deleteMany({ where: { tenantId } }),
      prisma.employee.deleteMany({ where: { tenantId } }),
      prisma.stockTakeLine.deleteMany({ where: { stockTake: { tenantId } } }),
      prisma.stockTake.deleteMany({ where: { tenantId } }),
      prisma.stockTransferItem.deleteMany({ where: { transfer: { tenantId } } }),
      prisma.stockTransfer.deleteMany({ where: { tenantId } }),
      prisma.expense.deleteMany({ where: { tenantId } }),
      prisma.salesRep.deleteMany({ where: { tenantId } }),
      prisma.prescription.deleteMany({ where: { tenantId } }),
      prisma.alert.deleteMany({ where: { tenantId } }),
      prisma.auditLog.deleteMany({ where: { tenantId } }),
      prisma.medicineCategory.deleteMany({ where: { tenantId } }),
      prisma.customer.deleteMany({ where: { tenantId } }),
      prisma.supplier.deleteMany({ where: { tenantId } }),
      prisma.userStore.deleteMany({ where: { user: { tenantId } } }),
      prisma.user.deleteMany({ where: { tenantId } }),
      prisma.store.deleteMany({ where: { tenantId } }),
      prisma.tenant.delete({ where: { id: tenantId } }),
    ])

    return reply.send({ success: true })
  })
}
