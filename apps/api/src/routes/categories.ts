import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { audit } from '../utils/audit.js'

export async function categoryRoutes(app: FastifyInstance) {
  // GET /api/v1/categories — list with medicine counts
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const categories = await prisma.medicineCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    })
    // Count medicines per category name (medicines are global; match by category string)
    const counts = await prisma.medicine.groupBy({
      by: ['category'],
      where: { category: { in: categories.map((c) => c.name) }, isActive: true },
      _count: true,
    })
    const countMap = new Map(counts.map((c) => [c.category, c._count]))
    return reply.send({
      success: true,
      data: categories.map((c) => ({ ...c, medicineCount: countMap.get(c.name) ?? 0 })),
    })
  })

  // POST /api/v1/categories
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = z.object({
      name: z.string().min(1).max(60),
      description: z.string().optional(),
      color: z.string().optional(),
    }).parse(request.body)

    const existing = await prisma.medicineCategory.findUnique({ where: { tenantId_name: { tenantId, name: body.name } } })
    if (existing) return reply.status(409).send({ success: false, error: 'Category already exists' })

    const cat = await prisma.medicineCategory.create({ data: { ...body, tenantId } })
    await audit(request, { action: 'category.create', entityType: 'MedicineCategory', entityId: cat.id, newValues: { name: cat.name }, invalidate: ['categories'] })
    return reply.status(201).send({ success: true, data: cat })
  })

  // PATCH /api/v1/categories/:id
  app.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = z.object({
      name: z.string().min(1).max(60).optional(),
      description: z.string().optional(),
      color: z.string().optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body)

    const cat = await prisma.medicineCategory.findFirst({ where: { id, tenantId } })
    if (!cat) return reply.status(404).send({ success: false, error: 'Category not found' })

    // If renaming, propagate to medicines that use the old name
    if (body.name && body.name !== cat.name) {
      await prisma.medicine.updateMany({ where: { category: cat.name }, data: { category: body.name } })
    }
    const updated = await prisma.medicineCategory.update({ where: { id }, data: body })
    await audit(request, { action: 'category.update', entityType: 'MedicineCategory', entityId: id, newValues: body, invalidate: ['categories', 'medicines'] })
    return reply.send({ success: true, data: updated })
  })

  // DELETE /api/v1/categories/:id — unassigns from medicines, then deletes
  app.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const cat = await prisma.medicineCategory.findFirst({ where: { id, tenantId } })
    if (!cat) return reply.status(404).send({ success: false, error: 'Category not found' })

    await prisma.medicine.updateMany({ where: { category: cat.name }, data: { category: null } })
    await prisma.medicineCategory.delete({ where: { id } })
    await audit(request, { action: 'category.delete', entityType: 'MedicineCategory', entityId: id, oldValues: { name: cat.name }, invalidate: ['categories', 'medicines'] })
    return reply.send({ success: true })
  })
}
