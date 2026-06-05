import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma, Prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { audit } from '../utils/audit.js'

const supplierSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().min(1),
  gstin: z.string().optional(),
  panNumber: z.string().optional(),
  drugLicenseNumber: z.string().optional(),
  drugLicenseExpiryDate: z.string().transform((s) => new Date(s)).optional(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  creditDays: z.number().int().default(30),
  creditLimit: z.number().default(0),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
})

export async function supplierRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { page?: string; limit?: string; search?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(query.page), limit: Number(query.limit) })

    const where: Record<string, unknown> = { tenantId, isActive: true }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { gstin: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.supplier.count({ where }),
    ])

    return reply.send({ success: true, data: suppliers, meta: buildPaginationMeta(total, page, limit) })
  })

  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId },
      include: {
        orders: { take: 10, orderBy: { createdAt: 'desc' } },
        ledgerEntries: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    })

    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })
    return reply.send({ success: true, data: supplier })
  })

  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = supplierSchema.parse(request.body)
    const supplier = await prisma.supplier.create({ data: { ...body, tenantId } })
    await audit(request, {
      action: 'supplier.create', entityType: 'Supplier', entityId: supplier.id,
      newValues: { name: supplier.name, companyName: supplier.companyName },
      invalidate: ['suppliers'],
    })
    return reply.status(201).send({ success: true, data: supplier })
  })

  app.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = supplierSchema.partial().parse(request.body)
    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } })
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })
    const updated = await prisma.supplier.update({ where: { id }, data: body })
    await audit(request, {
      action: 'supplier.update', entityType: 'Supplier', entityId: id,
      newValues: body, invalidate: ['suppliers', 'supplier'],
    })
    return reply.send({ success: true, data: updated })
  })

  // PATCH /api/v1/suppliers/:id/csv-preset — Save column mapping for this supplier
  app.patch('/:id/csv-preset', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = z.object({
      mapping: z.record(z.string(), z.string().nullable()),
    }).parse(request.body)

    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } })
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })

    const updated = await prisma.supplier.update({
      where: { id },
      data: { csvPreset: body.mapping as any },
    })
    return reply.send({ success: true, data: { csvPreset: updated.csvPreset } })
  })

  // DELETE /api/v1/suppliers/:id/csv-preset — Clear the saved mapping
  app.delete('/:id/csv-preset', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } })
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })
    await prisma.supplier.update({ where: { id }, data: { csvPreset: Prisma.DbNull } })
    return reply.send({ success: true })
  })

  // DELETE /api/v1/suppliers/:id — soft delete
  app.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } })
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })
    await prisma.supplier.update({ where: { id }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  app.get('/:id/ledger', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const query = request.query as { page?: string; limit?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(query.page), limit: Number(query.limit) })

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { tenantId, entityId: id, entityType: 'SUPPLIER' },
        skip, take, orderBy: { createdAt: 'desc' },
      }),
      prisma.ledgerEntry.count({ where: { tenantId, entityId: id, entityType: 'SUPPLIER' } }),
    ])

    return reply.send({ success: true, data: entries, meta: buildPaginationMeta(total, page, limit) })
  })
}
