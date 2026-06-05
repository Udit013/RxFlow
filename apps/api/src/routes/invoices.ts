import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { getFinancialYear, getFinancialYearBounds, formatFyNumber } from '../utils/financial-year.js'
import { audit } from '../utils/audit.js'

async function generateInvoiceNumber(tenantId: string, type: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    SALE: 'INV',
    PURCHASE: 'BILL',
    CREDIT_NOTE: 'CN',
    DEBIT_NOTE: 'DN',
    RETURN: 'RET',
  }
  const prefix = prefixMap[type] ?? 'INV'
  const fy = getFinancialYear()
  const { from, to } = getFinancialYearBounds()
  const seq = await prisma.invoice.count({
    where: { tenantId, type: type as any, createdAt: { gte: from, lt: to } },
  })
  return formatFyNumber(prefix, fy.label, seq + 1)
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

    // Determine inter-state vs intra-state for GST routing
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    const sellerState = tenant?.state?.toLowerCase()?.trim()
    const buyerState =
      order.type === 'SALE'
        ? order.customer?.state?.toLowerCase()?.trim()
        : order.supplier?.state?.toLowerCase()?.trim()
    // If both states known and they differ → IGST. Default (unknown buyer) → CGST+SGST.
    const isInterState = !!sellerState && !!buyerState && sellerState !== buyerState

    // Calculate GST breakdown
    const invoiceItems = order.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice
      const discountAmount = (lineTotal * item.discountPercent) / 100
      const taxableAmount = lineTotal - discountAmount
      const cgstRate = isInterState ? 0 : item.taxRate / 2
      const sgstRate = isInterState ? 0 : item.taxRate / 2
      const igstRate = isInterState ? item.taxRate : 0
      const cgstAmount = (taxableAmount * cgstRate) / 100
      const sgstAmount = (taxableAmount * sgstRate) / 100
      const igstAmount = (taxableAmount * igstRate) / 100

      return {
        medicineId: item.medicineId,
        medicineName: item.medicine.name,
        batchNumber: 'N/A',
        expiryDate: new Date(),
        hsn: item.medicine.hsn,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        discountAmount,
        taxableAmount,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        total: taxableAmount + cgstAmount + sgstAmount + igstAmount,
      }
    })

    const totals = invoiceItems.reduce(
      (acc, i) => ({
        subtotal: acc.subtotal + i.quantity * i.unitPrice,
        discountAmount: acc.discountAmount + i.discountAmount,
        cgst: acc.cgst + i.cgstAmount,
        sgst: acc.sgst + i.sgstAmount,
        igst: acc.igst + i.igstAmount,
        total: acc.total + i.taxableAmount,
      }),
      { subtotal: 0, discountAmount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
    )

    const totalTax = totals.cgst + totals.sgst + totals.igst
    const grandTotal = totals.total + totalTax
    const roundOff = Math.round(grandTotal) - grandTotal

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: await generateInvoiceNumber(tenantId, order.type === 'SALE' ? 'SALE' : 'PURCHASE'),
        tenantId,
        storeId: order.storeId,
        type: order.type === 'SALE' ? 'SALE' : 'PURCHASE',
        orderId: order.id,
        customerId: order.customerId,
        supplierId: order.supplierId,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        totalTax,
        total: totals.total,
        roundOff,
        grandTotal: grandTotal + roundOff,
        paymentStatus: order.paymentStatus as any,
        items: { create: invoiceItems },
      },
      include: { items: true },
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
      method: z.enum(['CASH','UPI','NEFT','RTGS','CHEQUE','CREDIT','CARD']),
      reference: z.string().optional(),
    }).parse(request.body)

    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } })
    if (!invoice) {
      return reply.status(404).send({ success: false, error: 'Invoice not found' })
    }

    const payment = await prisma.$transaction(async (tx) => {
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
    const totalTax = totals.cgst + totals.sgst + totals.igst

    const cnNumber = await generateInvoiceNumber(tenantId, 'CREDIT_NOTE')

    const creditNote = await prisma.$transaction(async (tx) => {
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
    const totalTax = totals.cgst + totals.sgst + totals.igst
    const dnNumber = await generateInvoiceNumber(tenantId, 'DEBIT_NOTE')

    const debitNote = await prisma.$transaction(async (tx) => {
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
