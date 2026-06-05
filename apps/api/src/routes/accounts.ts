import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { audit } from '../utils/audit.js'

// Common expense categories — used to seed the dropdown. Free text also allowed.
export const EXPENSE_CATEGORIES = [
  'Rent', 'Salaries', 'Electricity', 'Water', 'Internet & Phone',
  'Transport / Delivery', 'Marketing', 'Repairs & Maintenance',
  'Licenses & Fees', 'Bank Charges', 'Stationery', 'Insurance',
  'Professional Fees', 'Miscellaneous',
]
export const INCOME_CATEGORIES = ['Interest', 'Commission', 'Scrap Sale', 'Other Income']

function rangeFromQuery(q: { from?: string; to?: string; period?: string }): { from: Date; to: Date } {
  if (q.period && /^\d{4}-\d{2}$/.test(q.period)) {
    const [y, m] = q.period.split('-').map(Number)
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) }
  }
  const to = q.to ? new Date(q.to) : new Date()
  const from = q.from ? new Date(q.from) : new Date(to.getFullYear(), to.getMonth(), 1)
  return { from, to }
}

export async function accountRoutes(app: FastifyInstance) {
  // ── Expense / Income CRUD ───────────────────────────────────────────────────

  app.get('/expenses', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = request.query as { page?: string; limit?: string; direction?: string; category?: string; from?: string; to?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(q.page), limit: Number(q.limit) })

    const where: any = { tenantId }
    if (q.direction) where.direction = q.direction
    if (q.category) where.category = q.category
    if (q.from || q.to) {
      where.incurredAt = {}
      if (q.from) where.incurredAt.gte = new Date(q.from)
      if (q.to) where.incurredAt.lte = new Date(q.to)
    }

    const [items, total] = await Promise.all([
      prisma.expense.findMany({ where, skip, take, orderBy: { incurredAt: 'desc' } }),
      prisma.expense.count({ where }),
    ])
    return reply.send({ success: true, data: items, meta: buildPaginationMeta(total, page, limit) })
  })

  app.post('/expenses', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId, storeIds } = request.user
    const body = z.object({
      direction: z.enum(['IN', 'OUT']).default('OUT'),
      category: z.string().min(1),
      amount: z.number().positive(),
      paymentMethod: z.enum(['CASH', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'CREDIT', 'CARD']).default('CASH'),
      paidTo: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      incurredAt: z.string().transform((s) => new Date(s)).optional(),
      storeId: z.string().optional(),
    }).parse(request.body)

    const expense = await prisma.expense.create({
      data: {
        tenantId,
        storeId: body.storeId ?? storeIds[0],
        direction: body.direction,
        category: body.category,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        paidTo: body.paidTo,
        reference: body.reference,
        notes: body.notes,
        incurredAt: body.incurredAt ?? new Date(),
        createdBy: userId,
      },
    })

    await audit(request, {
      action: body.direction === 'IN' ? 'income.record' : 'expense.record',
      entityType: 'Expense',
      entityId: expense.id,
      newValues: { category: body.category, amount: body.amount, direction: body.direction },
      invalidate: ['expenses', 'accounts-pnl', 'accounts-cashflow', 'dashboard'],
    })

    return reply.status(201).send({ success: true, data: expense })
  })

  app.delete('/expenses/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const e = await prisma.expense.findFirst({ where: { id, tenantId } })
    if (!e) return reply.status(404).send({ success: false, error: 'Not found' })
    await prisma.expense.delete({ where: { id } })
    await audit(request, {
      action: 'expense.delete', entityType: 'Expense', entityId: id,
      oldValues: { category: e.category, amount: e.amount },
      invalidate: ['expenses', 'accounts-pnl', 'accounts-cashflow'],
    })
    return reply.send({ success: true })
  })

  app.get('/categories', { preHandler: [authenticate] }, async (_request, reply) => {
    return reply.send({ success: true, data: { expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES } })
  })

  // ── Profit & Loss ───────────────────────────────────────────────────────────
  // Revenue = sale invoices (net of credit notes)
  // COGS = purchase cost of items sold (approximated via batch purchase price on sold lines)
  // Gross profit = Revenue − COGS
  // Operating expenses = Expense(direction=OUT)
  // Other income = Expense(direction=IN)
  // Net profit = Gross profit − Operating expenses + Other income
  app.get('/profit-loss', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const { from, to } = rangeFromQuery(request.query as any)

    const [saleAgg, cnAgg, purchaseItems, expenseRows] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, type: 'SALE', createdAt: { gte: from, lt: to } },
        _sum: { subtotal: true, discountAmount: true, totalTax: true, grandTotal: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { tenantId, type: 'CREDIT_NOTE', createdAt: { gte: from, lt: to } },
        _sum: { subtotal: true, discountAmount: true, grandTotal: true },
        _count: true,
      }),
      // Sold line items in window — to approximate COGS
      prisma.invoiceItem.findMany({
        where: { invoice: { tenantId, type: 'SALE', createdAt: { gte: from, lt: to } } },
        select: { quantity: true, medicineId: true, batchNumber: true },
      }),
      prisma.expense.findMany({
        where: { tenantId, incurredAt: { gte: from, lt: to } },
        select: { direction: true, category: true, amount: true },
      }),
    ])

    // Approximate COGS: look up purchase price per (medicine, batchNumber) where possible
    const medicineIds = Array.from(new Set(purchaseItems.map((i) => i.medicineId)))
    const batches = medicineIds.length
      ? await prisma.batch.findMany({
          where: { inventoryItem: { tenantId, medicineId: { in: medicineIds } } },
          select: { batchNumber: true, purchasePrice: true, inventoryItem: { select: { medicineId: true } } },
        })
      : []
    const priceKey = (medId: string, batch: string) => `${medId}::${batch}`
    const priceMap = new Map<string, number>()
    for (const b of batches) priceMap.set(priceKey(b.inventoryItem.medicineId, b.batchNumber), b.purchasePrice)
    // fallback: avg purchase price per medicine
    const avgByMed = new Map<string, { sum: number; n: number }>()
    for (const b of batches) {
      const cur = avgByMed.get(b.inventoryItem.medicineId) ?? { sum: 0, n: 0 }
      cur.sum += b.purchasePrice; cur.n += 1
      avgByMed.set(b.inventoryItem.medicineId, cur)
    }

    let cogs = 0
    for (const it of purchaseItems) {
      let unitCost = priceMap.get(priceKey(it.medicineId, it.batchNumber))
      if (unitCost == null) {
        const avg = avgByMed.get(it.medicineId)
        unitCost = avg && avg.n > 0 ? avg.sum / avg.n : 0
      }
      cogs += unitCost * it.quantity
    }

    const grossRevenue = (saleAgg._sum.subtotal ?? 0) - (saleAgg._sum.discountAmount ?? 0)
    const returns = (cnAgg._sum.subtotal ?? 0) - (cnAgg._sum.discountAmount ?? 0)
    const netRevenue = grossRevenue - returns
    const grossProfit = netRevenue - cogs

    let operatingExpenses = 0
    let otherIncome = 0
    const expenseByCategory: Record<string, number> = {}
    for (const e of expenseRows) {
      if (e.direction === 'OUT') {
        operatingExpenses += e.amount
        expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount
      } else {
        otherIncome += e.amount
      }
    }

    const netProfit = grossProfit - operatingExpenses + otherIncome
    const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0

    return reply.send({
      success: true,
      data: {
        from, to,
        revenue: { gross: grossRevenue, returns, net: netRevenue, invoiceCount: saleAgg._count },
        cogs,
        grossProfit,
        grossMargin: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
        operatingExpenses,
        expenseByCategory: Object.entries(expenseByCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
        otherIncome,
        netProfit,
        netMargin: margin,
        tax: { collected: saleAgg._sum.totalTax ?? 0 },
      },
    })
  })

  // ── Cash Flow ───────────────────────────────────────────────────────────────
  // Cash in: payments received (customer) + other income
  // Cash out: payments made (supplier) + operating expenses
  app.get('/cash-flow', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const { from, to } = rangeFromQuery(request.query as any)

    const [payments, expenses] = await Promise.all([
      prisma.payment.findMany({
        where: { tenantId, createdAt: { gte: from, lt: to } },
        select: { amount: true, method: true, customerId: true, supplierId: true, invoiceId: true, createdAt: true },
      }),
      prisma.expense.findMany({
        where: { tenantId, incurredAt: { gte: from, lt: to } },
        select: { direction: true, amount: true, paymentMethod: true, category: true, incurredAt: true },
      }),
    ])

    let cashIn = 0, cashOut = 0
    const byMethod: Record<string, { in: number; out: number }> = {}
    const bump = (m: string, dir: 'in' | 'out', amt: number) => {
      if (!byMethod[m]) byMethod[m] = { in: 0, out: 0 }
      byMethod[m][dir] += amt
    }

    for (const p of payments) {
      // Customer payment = cash in; supplier payment = cash out
      if (p.supplierId) { cashOut += p.amount; bump(p.method, 'out', p.amount) }
      else { cashIn += p.amount; bump(p.method, 'in', p.amount) }
    }
    for (const e of expenses) {
      if (e.direction === 'IN') { cashIn += e.amount; bump(e.paymentMethod, 'in', e.amount) }
      else { cashOut += e.amount; bump(e.paymentMethod, 'out', e.amount) }
    }

    return reply.send({
      success: true,
      data: {
        from, to,
        cashIn, cashOut, netCashFlow: cashIn - cashOut,
        byMethod: Object.entries(byMethod).map(([method, v]) => ({ method, ...v })),
      },
    })
  })

  // ── Summary (for dashboard tile / quick view) ───────────────────────────────
  app.get('/summary', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [expenseAgg, incomeAgg] = await Promise.all([
      prisma.expense.aggregate({ where: { tenantId, direction: 'OUT', incurredAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true }, _count: true }),
      prisma.expense.aggregate({ where: { tenantId, direction: 'IN', incurredAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true }, _count: true }),
    ])

    return reply.send({
      success: true,
      data: {
        monthExpenses: expenseAgg._sum.amount ?? 0,
        monthExpenseCount: expenseAgg._count,
        monthOtherIncome: incomeAgg._sum.amount ?? 0,
      },
    })
  })
}
