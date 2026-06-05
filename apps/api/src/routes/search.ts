import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'

export async function searchRoutes(app: FastifyInstance) {
  // GET /api/v1/search?q=...&limit=5
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = z.object({
      q: z.string().min(1).max(100),
      limit: z.coerce.number().min(1).max(20).default(5),
    }).parse(request.query)

    const term = q.q.trim()
    const limit = q.limit

    const [medicines, customers, suppliers, orders, invoices] = await Promise.all([
      prisma.medicine.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { genericName: { contains: term, mode: 'insensitive' } },
            { brandName: { contains: term, mode: 'insensitive' } },
            { manufacturerName: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, strength: true, dosageForm: true, manufacturerName: true, mrp: true },
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.customer.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, email: true, outstandingBalance: true },
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { companyName: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
            { gstin: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, companyName: true, phone: true },
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.order.findMany({
        where: {
          tenantId,
          OR: [
            { orderNumber: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
            { supplier: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true, orderNumber: true, type: true, status: true, total: true, createdAt: true,
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [
            { invoiceNumber: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
            { supplier: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true, invoiceNumber: true, type: true, paymentStatus: true, grandTotal: true, createdAt: true,
          customer: { select: { name: true } },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return reply.send({
      success: true,
      data: {
        query: term,
        medicines,
        customers,
        suppliers,
        orders,
        invoices,
        total: medicines.length + customers.length + suppliers.length + orders.length + invoices.length,
      },
    })
  })
}
