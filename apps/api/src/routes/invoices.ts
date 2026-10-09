import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { audit } from '../utils/audit.js'
import { computeInvoiceAmounts } from '../utils/order-math.js'
import { getTenantRegion, paymentMethodSchema } from '../utils/regional.js'
import {
  scaleComponents, sumComponents, componentsFromLegacy, formatMoney,
  totalTax as totalTaxOf, type TaxComponent,
} from '@rxflow/regional'
import { Prisma } from '@rxflow/db'

/** A stored line's tax components (rebuilt from the GST columns for lines written before them). */
function lineComponents(item: { taxBreakdown?: unknown } & Parameters<typeof componentsFromLegacy>[0]): TaxComponent[] {
  return Array.isArray(item.taxBreakdown) ? (item.taxBreakdown as TaxComponent[]) : componentsFromLegacy(item)
}
import { httpError } from '../utils/http-error.js'
import { nextFyNumber, withUniqueRetry } from '../utils/numbering.js'

async function generateInvoiceNumber(tenantId: string, type: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    SALE: 'INV',
    PURCHASE: 'BILL',
    CREDIT_NOTE: 'CN',
    DEBIT_NOTE: 'DN',
    RETURN: 'RET',
  }
  const prefix = prefixMap[type] ?? 'INV'
  return nextFyNumber('invoice', tenantId, prefix)
}

export async function invoiceRoutes(app: FastifyInstance) {
  // GET /api/v1/invoices
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as {
      page?: string; limit?: string; type?: string; paymentStatus?: string;
      customerId?: string; supplierId?: string; from?: string; to?: string;
      search?: string;
    }

    const { page, limit, skip, take } = getPaginationParams({
      page: Number(query.page),
      limit: Number(query.limit),
    })

    const where: Record<string, unknown> = { tenantId }
    if (query.type) where.type = query.type
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus
    if (query.customerId) where.customerId = query.customerId
    if (query.supplierId) where.supplierId = query.supplierId
    if (query.search?.trim()) {
      const term = query.search.trim()
      where.OR = [
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
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

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          supplier: { select: { id: true, name: true, companyName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ])

    return reply.send({
      success: true,
      data: invoices,
      meta: buildPaginationMeta(total, page, limit),
    })
  })

  // GET /api/v1/invoices/:id
  app.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { medicine: { select: { name: true, genericName: true, hsn: true } } } },
        customer: true,
        supplier: true,
        store: true,
        order: true,
        payments: true,
      },
    })

    if (!invoice) {
      return reply.status(404).send({ success: false, error: 'Invoice not found' })
    }

    return reply.send({ success: true, data: invoice })
  })

  // POST /api/v1/invoices/from-order/:orderId — Generate invoice from order
  app.post('/from-order/:orderId', { preHandler: [authenticate] }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string }
    const { tenantId } = request.user

    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: { include: { medicine: true } },
        store: true,
        customer: true,
        supplier: true,
      },
    })

    if (!order) {
      return reply.status(404).send({ success: false, error: 'Order not found' })
    }

    // Invoicing is idempotent per order: a second request (double-click, retry, the billing
    // screen and the order page both offering "Generate invoice") returns the existing invoice
    // instead of issuing a duplicate tax document.
    const invoiceType = order.type === 'SALE' ? 'SALE' : 'PURCHASE'
    const existingInvoice = await prisma.invoice.findFirst({
      where: { tenantId, orderId: order.id, type: invoiceType },
      include: { items: true },
    })
    if (existingInvoice) return reply.send({ success: true, data: existingInvoice, existing: true })

    // The tenant's country decides the tax system (India: CGST+SGST vs IGST by state; VAT;
    // sales tax; none) and the cash rounding. Seller/buyer regions only matter to India's GST.
    const region = await getTenantRegion(tenantId)
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { state: true } })
    const buyerRegion = order.type === 'SALE' ? order.customer?.state : order.supplier?.state

    // Carry the order's bill-level special discount and transport charge into the invoice so
    // the tax document matches what was actually billed.
    const special = order.specialDiscountType && order.specialDiscountValue
      ? { type: order.specialDiscountType as 'PERCENT' | 'AMOUNT', value: order.specialDiscountValue }
      : null
    const amounts = computeInvoiceAmounts(
      order.items,
      {
        system: region.tax.system,
        label: region.tax.label,
        context: { sellerRegion: tenant?.state, buyerRegion },
        cashRounding: region.cashRounding,
      },
      special,
      order.transportCharge ?? 0,
    )

    const invoiceItems = order.items.map((item, i) => {
      const l = amounts.lines[i]!
      return {
        medicineId: item.medicineId,
        medicineName: item.medicine.name,
        batchNumber: 'N/A',
        expiryDate: new Date(),
        hsn: item.medicine.hsn,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        discountAmount: l.discountAmount,
        taxableAmount: l.taxableAmount,
        cgstRate: l.cgstRate,
        cgstAmount: l.cgstAmount,
        sgstRate: l.sgstRate,
        sgstAmount: l.sgstAmount,
        igstRate: l.igstRate,
        igstAmount: l.igstAmount,
        taxAmount: l.taxAmount,
        taxBreakdown: l.taxBreakdown as unknown as Prisma.InputJsonValue,
        total: l.total,
      }
    })

    let invoiceNumber = ''
    const invoice = await withUniqueRetry(async () => {
      invoiceNumber = await generateInvoiceNumber(tenantId, invoiceType)
      return prisma.invoice.create({
        data: {
          invoiceNumber,
          tenantId,
          storeId: order.storeId,
          type: invoiceType,
          orderId: order.id,
          customerId: order.customerId,
          supplierId: order.supplierId,
          subtotal: amounts.subtotal,
          discountAmount: amounts.discountAmount,
          cgst: amounts.cgst,
          sgst: amounts.sgst,
          igst: amounts.igst,
          totalTax: amounts.totalTax,
          taxBreakdown: amounts.taxBreakdown as unknown as Prisma.InputJsonValue,
          total: amounts.taxable,
          otherCharges: amounts.otherCharges,
          roundOff: amounts.roundOff,
          grandTotal: amounts.grandTotal,
          paymentStatus: order.paymentStatus as any,
          items: { create: invoiceItems },
        },
        include: { items: true },
      })
    })

    await audit(request, {
      action: order.type === 'SALE' ? 'invoice.sale.create' : 'invoice.purchase.create',
      entityType: 'Invoice',
      entityId: invoice.id,
      newValues: { invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal, orderId: order.id },
      invalidate: ['invoices', 'invoice', 'order', 'dashboard'],
    })

    return reply.status(201).send({ success: true, data: invoice })
  })

  // POST /api/v1/invoices/:id/payment — Record payment
  app.post('/:id/payment', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, userId } = request.user
    const body = z.object({
      amount: z.number().positive(),
      method: paymentMethodSchema,
      reference: z.string().optional(),
    }).parse(request.body)

    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } })
    if (!invoice) {
      return reply.status(404).send({ success: false, error: 'Invoice not found' })
    }
    const region = await getTenantRegion(tenantId)

    const payment = await prisma.$transaction(async (tx) => {
      // Reject overpayments: a payment may settle at most the outstanding balance (under one
      // currency unit of slack absorbs rounding; a fully-paid invoice accepts nothing more). Checked inside the transaction alongside the insert.
      const alreadyPaid = (await tx.payment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } }))._sum.amount ?? 0
      const outstanding = Math.max(0, invoice.grandTotal - alreadyPaid)
      if (outstanding < 0.01 || body.amount > outstanding + 0.99) {
        throw httpError(
          400,
          outstanding <= 0
            ? 'This invoice is already fully paid'
            : `Payment exceeds the outstanding balance of ${formatMoney(outstanding, region)}`,
        )
      }

      const p = await tx.payment.create({
        data: {
          tenantId,
          invoiceId: id,
          customerId: invoice.customerId,
          supplierId: invoice.supplierId,
          amount: body.amount,
          method: body.method as any,
          reference: body.reference,
          createdBy: userId,
        },
      })

      // Compute total paid
      const totalPaid = await tx.payment.aggregate({
        where: { invoiceId: id },
        _sum: { amount: true },
      })

      const paid = totalPaid._sum.amount ?? 0
      const newStatus =
        paid >= invoice.grandTotal ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING'

      await tx.invoice.update({
        where: { id },
        data: { paymentStatus: newStatus as any },
      })

      return p
    })

    await audit(request, {
      action: 'invoice.payment.record',
      entityType: 'Invoice',
      entityId: id,
      newValues: { amount: body.amount, method: body.method, reference: body.reference },
      invalidate: ['invoice', 'invoices', 'customer', 'dashboard'],
    })

    return reply.status(201).send({ success: true, data: payment })
  })

  // POST /api/v1/invoices/:id/credit-note — Issue a credit note for returned items
  app.post('/:id/credit-note', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, userId } = request.user
    const body = z.object({
      reason: z.string().min(1).default('Customer return'),
      items: z.array(z.object({
        invoiceItemId: z.string(),
        quantity: z.number().int().positive(),
        restockBatchId: z.string().optional(),
      })).min(1),
    }).parse(request.body)

    const original = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { items: true, customer: true },
    })
    if (!original) return reply.status(404).send({ success: false, error: 'Invoice not found' })
    if (original.type !== 'SALE') {
      return reply.status(400).send({ success: false, error: 'Credit notes only apply to SALE invoices' })
    }

    // Pull existing credit notes against this invoice to enforce per-item caps
    const priorCredits = await prisma.invoice.findMany({
      where: { tenantId, originalInvoiceId: id, type: 'CREDIT_NOTE' },
      include: { items: true },
    })

    const alreadyReturned = new Map<string, number>()
    for (const cn of priorCredits) {
      for (const it of cn.items) {
        // We tag returned items with medicineId+batchNumber as a soft key (no FK to original item).
        const key = `${it.medicineId}::${it.batchNumber}`
        alreadyReturned.set(key, (alreadyReturned.get(key) ?? 0) + it.quantity)
      }
    }

    // Validate each return line
    const lines: any[] = []
    for (const r of body.items) {
      const origItem = original.items.find((it) => it.id === r.invoiceItemId)
      if (!origItem) {
        return reply.status(400).send({ success: false, error: `Item ${r.invoiceItemId} not in original invoice` })
      }
      const key = `${origItem.medicineId}::${origItem.batchNumber}`
      const returnedSoFar = alreadyReturned.get(key) ?? 0
      if (returnedSoFar + r.quantity > origItem.quantity) {
        return reply.status(400).send({
          success: false,
          error: `Cannot return ${r.quantity} of ${origItem.medicineName}; only ${origItem.quantity - returnedSoFar} returnable`,
        })
      }

      // Pro-rata the original tax/discount across the returned quantity
      const ratio = r.quantity / origItem.quantity
      lines.push({
        orig: origItem,
        returnQty: r.quantity,
        restockBatchId: r.restockBatchId,
        amounts: {
          taxableAmount: origItem.taxableAmount * ratio,
          discountAmount: origItem.discountAmount * ratio,
          cgstAmount: (origItem.cgstAmount ?? 0) * ratio,
          sgstAmount: (origItem.sgstAmount ?? 0) * ratio,
          igstAmount: (origItem.igstAmount ?? 0) * ratio,
          // Country-agnostic tax, pro-rated the same way (older lines rebuilt from GST columns)
          taxBreakdown: scaleComponents(lineComponents(origItem), ratio),
          total: origItem.total * ratio,
        },
      })
    }

    const totals = lines.reduce(
      (acc, l) => ({
        subtotal: acc.subtotal + l.returnQty * l.orig.unitPrice,
        discountAmount: acc.discountAmount + l.amounts.discountAmount,
        cgst: acc.cgst + l.amounts.cgstAmount,
        sgst: acc.sgst + l.amounts.sgstAmount,
        igst: acc.igst + l.amounts.igstAmount,
        taxable: acc.taxable + l.amounts.taxableAmount,
        total: acc.total + l.amounts.total,
      }),
      { subtotal: 0, discountAmount: 0, cgst: 0, sgst: 0, igst: 0, taxable: 0, total: 0 }
    )
    const taxBreakdown = sumComponents(lines.map((l) => l.amounts.taxBreakdown))
    const totalTax = totalTaxOf(taxBreakdown)

    let cnNumber = ''

    const creditNote = await withUniqueRetry(async () => {
      cnNumber = await generateInvoiceNumber(tenantId, 'CREDIT_NOTE')
      return prisma.$transaction(async (tx) => {
        const cn = await tx.invoice.create({
          data: {
            invoiceNumber: cnNumber,
            tenantId,
            storeId: original.storeId,
            type: 'CREDIT_NOTE',
            orderId: original.orderId,
            customerId: original.customerId,
            originalInvoiceId: original.id,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            cgst: totals.cgst,
            sgst: totals.sgst,
            igst: totals.igst,
            totalTax,
            taxBreakdown: taxBreakdown as unknown as Prisma.InputJsonValue,
            total: totals.taxable,
            grandTotal: totals.total,
            paymentStatus: 'PAID', // credit notes are immediately settled against original
            notes: body.reason,
            items: {
              create: lines.map((l) => ({
                medicineId: l.orig.medicineId,
                medicineName: l.orig.medicineName,
                batchNumber: l.orig.batchNumber,
                expiryDate: l.orig.expiryDate,
                hsn: l.orig.hsn,
                quantity: l.returnQty,
                unitPrice: l.orig.unitPrice,
                discountPercent: l.orig.discountPercent,
                discountAmount: l.amounts.discountAmount,
                taxableAmount: l.amounts.taxableAmount,
                cgstRate: l.orig.cgstRate ?? 0,
                cgstAmount: l.amounts.cgstAmount,
                sgstRate: l.orig.sgstRate ?? 0,
                sgstAmount: l.amounts.sgstAmount,
                igstRate: l.orig.igstRate ?? 0,
                igstAmount: l.amounts.igstAmount,
                taxAmount: totalTaxOf(l.amounts.taxBreakdown),
                taxBreakdown: l.amounts.taxBreakdown as unknown as Prisma.InputJsonValue,
                total: l.amounts.total,
              })),
            },
          },
          include: { items: true },
        })
  
        // Restock — increment batch quantity + inventoryItem.availableQuantity
        for (const l of lines) {
          if (l.restockBatchId) {
            const batch = await tx.batch.findUnique({
              where: { id: l.restockBatchId },
              include: { inventoryItem: true },
            })
            if (batch && batch.inventoryItem.tenantId === tenantId) {
              await tx.batch.update({
                where: { id: l.restockBatchId },
                data: { quantity: { increment: l.returnQty } },
              })
              await tx.inventoryItem.update({
                where: { id: batch.inventoryItemId },
                data: {
                  totalQuantity: { increment: l.returnQty },
                  availableQuantity: { increment: l.returnQty },
                },
              })
            }
          }
        }
  
        // Customer ledger entry (CREDIT — reduces what customer owes us)
        if (original.customerId) {
          // Compute running balance: sum of DEBITs − sum of CREDITs (excl. this new one)
          const priorEntries = await tx.ledgerEntry.findMany({
            where: { tenantId, entityId: original.customerId, entityType: 'CUSTOMER' },
            select: { type: true, amount: true },
          })
          const priorBalance = priorEntries.reduce(
            (s, e) => s + (e.type === 'DEBIT' ? e.amount : -e.amount),
            0
          )
          const newBalance = priorBalance - totals.total
  
          await tx.ledgerEntry.create({
            data: {
              tenantId,
              entityId: original.customerId,
              entityType: 'CUSTOMER',
              type: 'CREDIT',
              amount: totals.total,
              balance: newBalance,
              reference: cnNumber,
              description: `Credit Note ${cnNumber} against ${original.invoiceNumber}`,
              invoiceId: cn.id,
            },
          })
          await tx.customer.update({
            where: { id: original.customerId },
            data: { outstandingBalance: { decrement: totals.total } },
          })
        }
  
        void userId // not needed in ledger schema, kept for future audit-log wiring
  
        return cn
      })
    })

    await audit(request, {
      action: 'invoice.credit-note.create',
      entityType: 'Invoice',
      entityId: creditNote.id,
      newValues: { invoiceNumber: creditNote.invoiceNumber, grandTotal: creditNote.grandTotal, originalInvoice: original.invoiceNumber, reason: body.reason },
      invalidate: ['invoice', 'invoices', 'inventory', 'inventory-insights', 'invoice-credit-notes'],
    })

    return reply.status(201).send({ success: true, data: creditNote })
  })

  // GET /api/v1/invoices/:id/credit-notes — list credit notes for an invoice
  app.get('/:id/credit-notes', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const cns = await prisma.invoice.findMany({
      where: { tenantId, originalInvoiceId: id, type: 'CREDIT_NOTE' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ success: true, data: cns })
  })

  // POST /api/v1/invoices/:id/purchase-return — Return goods to supplier (DEBIT_NOTE)
  // Mirrors credit-note but DECREMENTS our stock and REDUCES supplier payable.
  app.post('/:id/purchase-return', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = z.object({
      reason: z.string().min(1).default('Return to supplier'),
      items: z.array(z.object({
        invoiceItemId: z.string(),
        quantity: z.number().int().positive(),
      })).min(1),
    }).parse(request.body)

    const original = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { items: true, supplier: true },
    })
    if (!original) return reply.status(404).send({ success: false, error: 'Invoice not found' })
    if (original.type !== 'PURCHASE') {
      return reply.status(400).send({ success: false, error: 'Purchase returns only apply to PURCHASE invoices' })
    }

    // Prior returns against this purchase (cap per item)
    const priorReturns = await prisma.invoice.findMany({
      where: { tenantId, originalInvoiceId: id, type: 'DEBIT_NOTE' },
      include: { items: true },
    })
    const alreadyReturned = new Map<string, number>()
    for (const dn of priorReturns) {
      for (const it of dn.items) {
        const key = `${it.medicineId}::${it.batchNumber}`
        alreadyReturned.set(key, (alreadyReturned.get(key) ?? 0) + it.quantity)
      }
    }

    const lines: any[] = []
    for (const r of body.items) {
      const origItem = original.items.find((it) => it.id === r.invoiceItemId)
      if (!origItem) return reply.status(400).send({ success: false, error: `Item ${r.invoiceItemId} not in original invoice` })
      const key = `${origItem.medicineId}::${origItem.batchNumber}`
      const returnedSoFar = alreadyReturned.get(key) ?? 0
      if (returnedSoFar + r.quantity > origItem.quantity) {
        return reply.status(400).send({ success: false, error: `Cannot return ${r.quantity} of ${origItem.medicineName}; only ${origItem.quantity - returnedSoFar} returnable from this purchase` })
      }

      // Must still physically have the stock to return
      const inv = await prisma.inventoryItem.findUnique({
        where: { tenantId_storeId_medicineId: { tenantId, storeId: original.storeId, medicineId: origItem.medicineId } },
        include: { batches: { where: { batchNumber: origItem.batchNumber } } },
      })
      const batch = inv?.batches[0]
      if (!batch || batch.quantity < r.quantity) {
        return reply.status(400).send({ success: false, error: `Insufficient stock of ${origItem.medicineName} (batch ${origItem.batchNumber}) to return — have ${batch?.quantity ?? 0}, need ${r.quantity}` })
      }

      const ratio = r.quantity / origItem.quantity
      lines.push({
        orig: origItem,
        returnQty: r.quantity,
        batchId: batch.id,
        inventoryItemId: inv!.id,
        amounts: {
          taxableAmount: origItem.taxableAmount * ratio,
          discountAmount: origItem.discountAmount * ratio,
          cgstAmount: (origItem.cgstAmount ?? 0) * ratio,
          sgstAmount: (origItem.sgstAmount ?? 0) * ratio,
          igstAmount: (origItem.igstAmount ?? 0) * ratio,
          // Country-agnostic tax, pro-rated the same way (older lines rebuilt from GST columns)
          taxBreakdown: scaleComponents(lineComponents(origItem), ratio),
          total: origItem.total * ratio,
        },
      })
    }

    const totals = lines.reduce(
      (acc, l) => ({
        subtotal: acc.subtotal + l.returnQty * l.orig.unitPrice,
        discountAmount: acc.discountAmount + l.amounts.discountAmount,
        cgst: acc.cgst + l.amounts.cgstAmount,
        sgst: acc.sgst + l.amounts.sgstAmount,
        igst: acc.igst + l.amounts.igstAmount,
        taxable: acc.taxable + l.amounts.taxableAmount,
        total: acc.total + l.amounts.total,
      }),
      { subtotal: 0, discountAmount: 0, cgst: 0, sgst: 0, igst: 0, taxable: 0, total: 0 }
    )
    const taxBreakdown = sumComponents(lines.map((l) => l.amounts.taxBreakdown))
    const totalTax = totalTaxOf(taxBreakdown)
    let dnNumber = ''

    const debitNote = await withUniqueRetry(async () => {
      dnNumber = await generateInvoiceNumber(tenantId, 'DEBIT_NOTE')
      return prisma.$transaction(async (tx) => {
        const dn = await tx.invoice.create({
          data: {
            invoiceNumber: dnNumber,
            tenantId,
            storeId: original.storeId,
            type: 'DEBIT_NOTE',
            orderId: original.orderId,
            supplierId: original.supplierId,
            originalInvoiceId: original.id,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            cgst: totals.cgst,
            sgst: totals.sgst,
            igst: totals.igst,
            totalTax,
            taxBreakdown: taxBreakdown as unknown as Prisma.InputJsonValue,
            total: totals.taxable,
            grandTotal: totals.total,
            paymentStatus: 'PAID',
            notes: body.reason,
            items: {
              create: lines.map((l) => ({
                medicineId: l.orig.medicineId,
                medicineName: l.orig.medicineName,
                batchNumber: l.orig.batchNumber,
                expiryDate: l.orig.expiryDate,
                hsn: l.orig.hsn,
                quantity: l.returnQty,
                unitPrice: l.orig.unitPrice,
                discountPercent: l.orig.discountPercent,
                discountAmount: l.amounts.discountAmount,
                taxableAmount: l.amounts.taxableAmount,
                cgstRate: l.orig.cgstRate ?? 0,
                cgstAmount: l.amounts.cgstAmount,
                sgstRate: l.orig.sgstRate ?? 0,
                sgstAmount: l.amounts.sgstAmount,
                igstRate: l.orig.igstRate ?? 0,
                igstAmount: l.amounts.igstAmount,
                taxAmount: totalTaxOf(l.amounts.taxBreakdown),
                taxBreakdown: l.amounts.taxBreakdown as unknown as Prisma.InputJsonValue,
                total: l.amounts.total,
              })),
            },
          },
          include: { items: true },
        })
  
        // Remove returned goods from our stock
        for (const l of lines) {
          await tx.batch.update({ where: { id: l.batchId }, data: { quantity: { decrement: l.returnQty } } })
          await tx.inventoryItem.update({
            where: { id: l.inventoryItemId },
            data: { totalQuantity: { decrement: l.returnQty }, availableQuantity: { decrement: l.returnQty } },
          })
        }
  
        // Supplier ledger — reduce what we owe them
        if (original.supplierId) {
          const priorEntries = await tx.ledgerEntry.findMany({
            where: { tenantId, entityId: original.supplierId, entityType: 'SUPPLIER' },
            select: { type: true, amount: true },
          })
          const priorBalance = priorEntries.reduce((s, e) => s + (e.type === 'DEBIT' ? e.amount : -e.amount), 0)
          await tx.ledgerEntry.create({
            data: {
              tenantId,
              entityId: original.supplierId,
              entityType: 'SUPPLIER',
              type: 'CREDIT',
              amount: totals.total,
              balance: priorBalance - totals.total,
              reference: dnNumber,
              description: `Purchase Return ${dnNumber} against ${original.invoiceNumber}`,
              invoiceId: dn.id,
            },
          })
          await tx.supplier.update({
            where: { id: original.supplierId },
            data: { outstandingBalance: { decrement: totals.total }, totalPurchases: { decrement: totals.total } },
          })
        }
  
        return dn
      })
    })

    await audit(request, {
      action: 'invoice.purchase-return.create',
      entityType: 'Invoice',
      entityId: debitNote.id,
      newValues: { invoiceNumber: debitNote.invoiceNumber, grandTotal: debitNote.grandTotal, originalInvoice: original.invoiceNumber, reason: body.reason },
      invalidate: ['invoice', 'invoices', 'inventory', 'inventory-insights', 'invoice-purchase-returns'],
    })

    return reply.status(201).send({ success: true, data: debitNote })
  })

  // GET /api/v1/invoices/:id/purchase-returns — list returns for a purchase invoice
  app.get('/:id/purchase-returns', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const dns = await prisma.invoice.findMany({
      where: { tenantId, originalInvoiceId: id, type: 'DEBIT_NOTE' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ success: true, data: dns })
  })
}
