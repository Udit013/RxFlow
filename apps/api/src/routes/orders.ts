import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { getFinancialYear, getFinancialYearBounds, formatFyNumber } from '../utils/financial-year.js'
import { audit } from '../utils/audit.js'

const orderItemSchema = z.object({
  medicineId: z.string(),
  batchId: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().default(12),
})

const createOrderSchema = z.object({
  type: z.enum(['SALE', 'PURCHASE']),
  storeId: z.string(),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  prescriptionId: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
  paymentMethod: z.enum(['CASH','UPI','NEFT','RTGS','CHEQUE','CREDIT','CARD']).optional(),
  notes: z.string().optional(),
  // Salesman commission — optional, supported for both SALE and PURCHASE
  salesRepId: z.string().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  // Purchase-only: fixed transport/delivery charge added to the bill
  transportCharge: z.number().min(0).optional(),
  deliveryAddress: z.object({
    line1: z.string(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
  }).optional(),
})

async function generateOrderNumber(tenantId: string, type: string): Promise<string> {
  const prefix = type === 'SALE' ? 'INV' : 'PO'
  const fy = getFinancialYear()
  const { from, to } = getFinancialYearBounds()
  const seq = await prisma.order.count({
    where: { tenantId, type: type as any, createdAt: { gte: from, lt: to } },
  })
  return formatFyNumber(prefix, fy.label, seq + 1)
}

function calculateOrderTotals(items: z.infer<typeof orderItemSchema>[]) {
  return items.reduce(
    (acc, item) => {
      const lineTotal = item.quantity * item.unitPrice
      const discountAmount = (lineTotal * item.discountPercent) / 100
      const taxableAmount = lineTotal - discountAmount
      const taxAmount = (taxableAmount * item.taxRate) / 100
      const total = taxableAmount + taxAmount

      acc.subtotal += lineTotal
      acc.discountAmount += discountAmount
      acc.taxAmount += taxAmount
      acc.total += total
      return acc
    },
    { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 }
  )
}

export async function orderRoutes(app: FastifyInstance) {
  // GET /api/v1/orders
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as {
      page?: string; limit?: string; type?: string; status?: string;
      customerId?: string; supplierId?: string; storeId?: string;
      search?: string;
      from?: string; to?: string;
    }

    const { page, limit, skip, take } = getPaginationParams({
      page: Number(query.page),
      limit: Number(query.limit),
    })

    const where: Record<string, unknown> = { tenantId, parkedAt: null } // Hide parked sales
    if (query.type) where.type = query.type
    if (query.status) where.status = query.status
    if (query.customerId) where.customerId = query.customerId
    if (query.supplierId) where.supplierId = query.supplierId
    if (query.storeId) where.storeId = query.storeId
    if (query.search?.trim()) {
      const term = query.search.trim()
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term } } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
      ]
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          supplier: { select: { id: true, name: true, companyName: true } },
          salesRep: { select: { id: true, name: true } },
          items: { include: { medicine: { select: { name: true, dosageForm: true, strength: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ])

    return reply.send({
      success: true,
      data: orders,
      meta: buildPaginationMeta(total, page, limit),
    })
  })

  // GET /api/v1/orders/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        supplier: true,
        salesRep: true,
        items: {
          include: {
            medicine: { include: { compositions: true } },
          },
        },
        invoices: true,
        payments: true,
      },
    })

    if (!order) {
      return reply.status(404).send({ success: false, error: 'Order not found' })
    }

    return reply.send({ success: true, data: order })
  })

  // POST /api/v1/orders
  app.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = createOrderSchema.parse(request.body)

    const totals = calculateOrderTotals(body.items)
    const transportCharge = body.type === 'PURCHASE' ? (body.transportCharge ?? 0) : 0
    totals.total += transportCharge

    // Commission only when a salesman is attached (direct bills carry none).
    // Supported for both SALE (our rep) and PURCHASE (supplier's salesman).
    let commissionPercent: number | undefined
    let commissionAmount: number | undefined
    if (body.salesRepId) {
      const rep = await prisma.salesRep.findFirst({
        where: { id: body.salesRepId, tenantId, isActive: true },
        select: { defaultCommissionPercent: true, flatBonusAmount: true },
      })
      if (rep) {
        commissionPercent = body.commissionPercent ?? rep.defaultCommissionPercent
        // Commission is on the net value (subtotal − discount), excluding tax & transport.
        const commissionBase = totals.subtotal - totals.discountAmount
        commissionAmount = (commissionBase * commissionPercent) / 100 + (rep.flatBonusAmount ?? 0)
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber: await generateOrderNumber(tenantId, body.type),
          tenantId,
          storeId: body.storeId,
          type: body.type as any,
          status: 'CONFIRMED',
          customerId: body.customerId,
          supplierId: body.supplierId,
          prescriptionId: body.prescriptionId,
          ...totals,
          paymentMethod: body.paymentMethod as any,
          notes: body.notes,
          deliveryAddress: body.deliveryAddress as any,
          createdBy: userId,
          salesRepId: body.salesRepId ?? null,
          commissionPercent,
          commissionAmount,
          commissionStatus: commissionAmount ? 'PENDING' : null,
          transportCharge,
          items: {
            create: body.items.map((item) => {
              const lineTotal = item.quantity * item.unitPrice
              const discountAmount = (lineTotal * item.discountPercent) / 100
              const taxableAmount = lineTotal - discountAmount
              const taxAmount = (taxableAmount * item.taxRate) / 100
              return {
                medicineId: item.medicineId,
                batchId: item.batchId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountPercent: item.discountPercent,
                taxRate: item.taxRate,
                taxAmount,
                total: taxableAmount + taxAmount,
              }
            }),
          },
        },
        include: { items: true },
      })

      // Deduct stock for SALE orders
      if (body.type === 'SALE') {
        // Look up tenant flag once per order
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { allowNegativeStock: true },
        })
        const allowNegative = tenant?.allowNegativeStock ?? false

        for (const item of body.items) {
          let inv = await tx.inventoryItem.findUnique({
            where: { tenantId_storeId_medicineId: { tenantId, storeId: body.storeId, medicineId: item.medicineId } },
          })

          if (!inv) {
            if (!allowNegative) {
              throw new Error(`Insufficient stock for medicine ${item.medicineId}`)
            }
            // Auto-create inventory item when allowing negative stock
            const med = await tx.medicine.findUnique({ where: { id: item.medicineId } })
            inv = await tx.inventoryItem.create({
              data: {
                tenantId,
                storeId: body.storeId,
                medicineId: item.medicineId,
                sellingPrice: item.unitPrice,
                reorderLevel: 10,
                reorderQuantity: 50,
              },
            })
            void med
          } else if (inv.availableQuantity < item.quantity && !allowNegative) {
            throw new Error(`Insufficient stock for medicine ${item.medicineId} (have ${inv.availableQuantity}, need ${item.quantity})`)
          }

          await tx.inventoryItem.update({
            where: { id: inv.id },
            data: {
              availableQuantity: { decrement: item.quantity },
              totalQuantity: { decrement: item.quantity },
            },
          })

          if (item.batchId) {
            await tx.batch.update({
              where: { id: item.batchId },
              data: { quantity: { decrement: item.quantity } },
            })
          }
        }

        // Update customer stats
        if (body.customerId) {
          await tx.customer.update({
            where: { id: body.customerId },
            data: {
              totalPurchases: { increment: totals.total },
              totalOrders: { increment: 1 },
            },
          })
        }
      }

      // Add stock for PURCHASE orders
      if (body.type === 'PURCHASE' && body.supplierId) {
        await tx.supplier.update({
          where: { id: body.supplierId },
          data: { totalPurchases: { increment: totals.total } },
        })
      }

      return newOrder
    })

    await audit(request, {
      action: body.type === 'SALE' ? 'order.sale.create' : 'order.purchase.create',
      entityType: 'Order',
      entityId: order.id,
      newValues: { orderNumber: order.orderNumber, total: order.total, items: body.items.length },
      invalidate: ['orders', 'inventory', 'dashboard', 'customer-refill', 'inventory-insights'],
    })

    return reply.status(201).send({ success: true, data: order })
  })

  // PATCH /api/v1/orders/:id/status
  app.patch('/:id/status', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const { status } = z.object({ status: z.string() }).parse(request.body)

    const order = await prisma.order.findFirst({ where: { id, tenantId } })
    if (!order) {
      return reply.status(404).send({ success: false, error: 'Order not found' })
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: status as any },
    })

    await audit(request, {
      action: 'order.status.update',
      entityType: 'Order',
      entityId: id,
      oldValues: { status: order.status },
      newValues: { status },
      invalidate: ['orders', 'order'],
    })

    return reply.send({ success: true, data: updated })
  })

  // ── Parked sales ───────────────────────────────────────────────────────────

  // POST /api/v1/orders/park — Save a cart as DRAFT without deducting stock
  app.post('/park', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = z.object({
      storeId: z.string(),
      label: z.string().min(1).max(80),
      customerId: z.string().optional(),
      salesRepId: z.string().optional(),
      paymentMethod: z.enum(['CASH','UPI','NEFT','RTGS','CHEQUE','CREDIT','CARD']).optional(),
      notes: z.string().optional(),
      items: z.array(orderItemSchema).min(1),
    }).parse(request.body)

    const totals = calculateOrderTotals(body.items)
    const orderNumber = await generateOrderNumber(tenantId, 'SALE')

    const order = await prisma.order.create({
      data: {
        orderNumber,
        tenantId,
        storeId: body.storeId,
        type: 'SALE',
        status: 'DRAFT',
        customerId: body.customerId,
        salesRepId: body.salesRepId,
        ...totals,
        paymentMethod: body.paymentMethod as any,
        notes: body.notes,
        createdBy: userId,
        parkedAt: new Date(),
        parkedLabel: body.label,
        items: {
          create: body.items.map((item) => {
            const lineTotal = item.quantity * item.unitPrice
            const discountAmount = (lineTotal * item.discountPercent) / 100
            const taxableAmount = lineTotal - discountAmount
            const taxAmount = (taxableAmount * item.taxRate) / 100
            return {
              medicineId: item.medicineId,
              batchId: item.batchId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              taxRate: item.taxRate,
              taxAmount,
              total: taxableAmount + taxAmount,
            }
          }),
        },
      },
    })

    await audit(request, {
      action: 'order.park',
      entityType: 'Order',
      entityId: order.id,
      newValues: { orderNumber: order.orderNumber, label: body.label, items: body.items.length },
      invalidate: ['parked-orders'],
    })

    return reply.status(201).send({ success: true, data: { id: order.id, orderNumber: order.orderNumber, label: body.label } })
  })

  // GET /api/v1/orders/parked — List of parked sales
  app.get('/parked', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const orders = await prisma.order.findMany({
      where: { tenantId, type: 'SALE', status: 'DRAFT', parkedAt: { not: null } },
      orderBy: { parkedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: { include: { medicine: { select: { name: true, strength: true } } } },
      },
    })
    return reply.send({ success: true, data: orders })
  })

  // DELETE /api/v1/orders/:id/parked — Discard a parked sale
  app.delete('/:id/parked', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const order = await prisma.order.findFirst({ where: { id, tenantId, status: 'DRAFT', parkedAt: { not: null } } })
    if (!order) return reply.status(404).send({ success: false, error: 'Parked sale not found' })

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } })
      await tx.order.delete({ where: { id } })
    })

    await audit(request, {
      action: 'order.park.discard',
      entityType: 'Order',
      entityId: id,
      oldValues: { orderNumber: order.orderNumber, label: order.parkedLabel },
      invalidate: ['parked-orders'],
    })

    return reply.send({ success: true })
  })
}
