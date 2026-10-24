import type { FastifyInstance } from 'fastify'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getTenantRegion } from '../utils/regional.js'
import { startOfZonedDay, addZonedDays, currentZonedMonthRange, lastZonedDateKeys } from '@rxflow/regional'

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /api/v1/dashboard — Main dashboard metrics
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user

    // "Today" and "this month" are the PHARMACY's local day and month — the server runs on UTC,
    // which used to start an Indian pharmacy's day at 05:30 IST.
    const { timezone } = await getTenantRegion(tenantId)
    const now = new Date()
    const today = startOfZonedDay(now, timezone)
    const tomorrow = addZonedDays(now, 1, timezone)
    const ninetyDaysOut = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    // Current month bounds for finance tiles
    const { from: monthStart, to: monthEnd } = currentZonedMonthRange(now, timezone)

    const [
      todaySales,
      todayPurchases,
      todayOrders,
      todayNewCustomers,
      totalInventoryItems,
      lowStockItems,
      expiringBatches,
      expiredBatches,
      recentOrders,
      pendingInvoices,
      alerts,
    ] = await Promise.all([
      // Today's sales revenue
      prisma.order.aggregate({
        where: { tenantId, type: 'SALE', createdAt: { gte: today, lt: tomorrow } },
        _sum: { total: true },
        _count: true,
      }),
      // Today's purchases
      prisma.order.aggregate({
        where: { tenantId, type: 'PURCHASE', createdAt: { gte: today, lt: tomorrow } },
        _sum: { total: true },
      }),
      // Today's order count
      prisma.order.count({
        where: { tenantId, createdAt: { gte: today, lt: tomorrow } },
      }),
      // Today's new customers
      prisma.customer.count({
        where: { tenantId, createdAt: { gte: today, lt: tomorrow } },
      }),
      // Total SKUs
      prisma.inventoryItem.count({ where: { tenantId, isActive: true } }),
      // Low stock (raw query for comparison)
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "InventoryItem"
        WHERE "tenantId" = ${tenantId}
          AND "isActive" = true
          AND "availableQuantity" <= "reorderLevel"
      `,
      // Expiring within 90 days
      prisma.batch.count({
        where: {
          inventoryItem: { tenantId },
          expiryDate: { gte: today, lte: ninetyDaysOut },
          quantity: { gt: 0 },
        },
      }),
      // Expired batches
      prisma.batch.count({
        where: {
          inventoryItem: { tenantId },
          expiryDate: { lt: today },
          quantity: { gt: 0 },
        },
      }),
      // Recent orders
      prisma.order.findMany({
        where: { tenantId },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true } },
          supplier: { select: { name: true } },
        },
      }),
      // Outstanding invoices
      prisma.invoice.aggregate({
        where: { tenantId, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      // Recent unread alerts
      prisma.alert.findMany({
        where: { tenantId, isRead: false },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Commissions pending (lifetime, not period-bound — these accumulate until settled)
    const commissionsPending = await prisma.order.aggregate({
      where: { tenantId, type: 'SALE', commissionStatus: 'PENDING', commissionAmount: { not: null } },
      _sum: { commissionAmount: true },
      _count: true,
    })

    // Return rate this month: credit notes / sales invoices
    const [monthSalesCount, monthCreditNotes] = await Promise.all([
      prisma.invoice.count({
        where: { tenantId, type: 'SALE', createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.invoice.aggregate({
        where: { tenantId, type: 'CREDIT_NOTE', createdAt: { gte: monthStart, lt: monthEnd } },
        _sum: { grandTotal: true },
        _count: true,
      }),
    ])
    const returnRatePercent = monthSalesCount > 0
      ? Math.round((monthCreditNotes._count / monthSalesCount) * 1000) / 10
      : 0

    // GST liability this month (output tax − ITC)
    const [monthOutward, monthInward] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, type: 'SALE', createdAt: { gte: monthStart, lt: monthEnd } },
        _sum: { cgst: true, sgst: true, igst: true, grandTotal: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { tenantId, type: 'PURCHASE', createdAt: { gte: monthStart, lt: monthEnd } },
        _sum: { cgst: true, sgst: true, igst: true, grandTotal: true },
      }),
    ])

    const outputTax = (monthOutward._sum.cgst ?? 0) + (monthOutward._sum.sgst ?? 0) + (monthOutward._sum.igst ?? 0)
    const inputCredit = (monthInward._sum.cgst ?? 0) + (monthInward._sum.sgst ?? 0) + (monthInward._sum.igst ?? 0)
    const netGstPayable = Math.max(0, outputTax - inputCredit)

    // Top sales rep this month by commission
    const topRepThisMonth = await prisma.order.groupBy({
      by: ['salesRepId'],
      where: {
        tenantId,
        type: 'SALE',
        salesRepId: { not: null },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { commissionAmount: true, total: true },
      _count: true,
      orderBy: { _sum: { commissionAmount: 'desc' } },
      take: 1,
    })
    let topRep: { name: string; totalCommission: number; totalSales: number; orderCount: number } | null = null
    if (topRepThisMonth.length > 0 && topRepThisMonth[0]!.salesRepId) {
      const rep = await prisma.salesRep.findUnique({ where: { id: topRepThisMonth[0]!.salesRepId! }, select: { name: true } })
      if (rep) {
        topRep = {
          name: rep.name,
          totalCommission: topRepThisMonth[0]!._sum.commissionAmount ?? 0,
          totalSales: topRepThisMonth[0]!._sum.total ?? 0,
          orderCount: topRepThisMonth[0]!._count,
        }
      }
    }

    // Top medicines by sales (last 30 days)
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const topMedicines = await prisma.$queryRaw<{
      medicineId: string; medicineName: string; totalQty: bigint; totalRevenue: number
    }[]>`
      SELECT
        oi."medicineId",
        m.name as "medicineName",
        SUM(oi.quantity) as "totalQty",
        SUM(oi.total) as "totalRevenue"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "Medicine" m ON oi."medicineId" = m.id
      WHERE o."tenantId" = ${tenantId}
        AND o.type = 'SALE'
        AND o."createdAt" >= ${thirtyDaysAgo}
      GROUP BY oi."medicineId", m.name
      ORDER BY "totalRevenue" DESC
      LIMIT 10
    `

    // Revenue chart: the last 7 local days including today, with empty days as zero.
    const revenueRows = await prisma.$queryRaw<{ date: string; revenue: number; orders: bigint }[]>`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD') as date,
        SUM(total) as revenue,
        COUNT(*) as orders
      FROM "Order"
      WHERE "tenantId" = ${tenantId}
        AND type = 'SALE'
        AND "createdAt" >= ${addZonedDays(now, -6, timezone)}
      GROUP BY 1 -- by position: the timezone is a bound parameter, so a repeated expression wouldn't match
      ORDER BY date ASC
    `
    const revenueByDay = new Map(revenueRows.map((r) => [r.date, r]))
    const revenueChart = lastZonedDateKeys(now, 7, timezone).map((date) => {
      const r = revenueByDay.get(date)
      return { date, revenue: r ? Number(r.revenue) : 0, orders: r ? Number(r.orders) : 0 }
    })

    // ── Today's-Operations extras ───────────────────────────────────────────
    const in30 = new Date(today.getTime() + 30 * 86400000)
    const in60 = new Date(today.getTime() + 60 * 86400000)
    const [pendingPOs, expiry30, expiry60, expiry90, recentMedicines] = await Promise.all([
      prisma.order.count({
        where: { tenantId, type: 'PURCHASE', status: { in: ['DRAFT', 'PENDING', 'CONFIRMED', 'PROCESSING'] as any } },
      }),
      prisma.batch.count({ where: { inventoryItem: { tenantId }, quantity: { gt: 0 }, expiryDate: { gte: today, lte: in30 } } }),
      prisma.batch.count({ where: { inventoryItem: { tenantId }, quantity: { gt: 0 }, expiryDate: { gt: in30, lte: in60 } } }),
      prisma.batch.count({ where: { inventoryItem: { tenantId }, quantity: { gt: 0 }, expiryDate: { gt: in60, lte: ninetyDaysOut } } }),
      prisma.inventoryItem.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { medicine: { select: { name: true, strength: true, dosageForm: true } } },
      }),
    ])

    return reply.send({
      success: true,
      data: {
        today: {
          sales: todaySales._sum.total ?? 0,
          purchases: todayPurchases._sum.total ?? 0,
          revenue: todaySales._sum.total ?? 0,
          orders: todayOrders,
          newCustomers: todayNewCustomers,
        },
        inventory: {
          totalSkus: totalInventoryItems,
          lowStockItems: Number(lowStockItems[0]?.count ?? 0),
          expiringItems: expiringBatches,
          expiredItems: expiredBatches,
          expiry30, expiry60, expiry90,
        },
        operations: {
          pendingPurchaseOrders: pendingPOs,
          recentMedicines: recentMedicines.map((i) => ({
            id: i.id,
            name: i.medicine.name,
            strength: i.medicine.strength,
            dosageForm: i.medicine.dosageForm,
            stock: i.availableQuantity,
            addedAt: i.createdAt,
          })),
        },
        finance: {
          outstanding: pendingInvoices._sum.grandTotal ?? 0,
          pendingInvoices: pendingInvoices._count,
          commissionsPending: commissionsPending._sum.commissionAmount ?? 0,
          commissionsPendingCount: commissionsPending._count,
          monthlyGst: {
            outputTax,
            inputCredit,
            netPayable: netGstPayable,
            salesCount: monthOutward._count,
          },
          returnRate: {
            percent: returnRatePercent,
            creditNoteCount: monthCreditNotes._count,
            creditNoteValue: monthCreditNotes._sum.grandTotal ?? 0,
            salesCount: monthSalesCount,
          },
        },
        topRepThisMonth: topRep,
        recentOrders,
        topMedicines: topMedicines.map((m) => ({
          medicineId: m.medicineId,
          medicineName: m.medicineName,
          totalQuantity: Number(m.totalQty),
          totalRevenue: Number(m.totalRevenue),
        })),
        revenueChart,
        alerts,
      },
    })
  })

  // GET /api/v1/dashboard/analytics/sales
  app.get('/analytics/sales', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { period?: string; storeId?: string }
    const period = query.period ?? '30d'

    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
    const { timezone } = await getTenantRegion(tenantId)
    const now = new Date()
    const from = addZonedDays(now, -(days - 1), timezone) // local midnight; N days including today

    const where: Record<string, unknown> = { tenantId, type: 'SALE', createdAt: { gte: from } }
    if (query.storeId) where.storeId = query.storeId

    const salesRows = await prisma.$queryRaw<{ date: string; revenue: number; count: bigint }[]>`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD') as date,
        SUM(total) as revenue,
        COUNT(*) as count
      FROM "Order"
      WHERE "tenantId" = ${tenantId}
        AND type = 'SALE'
        AND "createdAt" >= ${from}
      GROUP BY 1 -- by position: the timezone is a bound parameter, so a repeated expression wouldn't match
      ORDER BY date ASC
    `

    const salesByDayMap = new Map(salesRows.map((r) => [r.date, r]))

    const summary = await prisma.order.aggregate({
      where,
      _sum: { total: true, discountAmount: true, taxAmount: true },
      _count: true,
      _avg: { total: true },
    })

    return reply.send({
      success: true,
      data: {
        summary: {
          totalRevenue: summary._sum.total ?? 0,
          totalOrders: summary._count,
          avgOrderValue: summary._avg.total ?? 0,
          totalDiscount: summary._sum.discountAmount ?? 0,
          totalTax: summary._sum.taxAmount ?? 0,
        },
        // Every day in the period, empty days as zero, so charts keep a true time axis.
        salesByDay: lastZonedDateKeys(now, days, timezone).map((date) => {
          const d = salesByDayMap.get(date)
          return { date, revenue: d ? Number(d.revenue) : 0, orders: d ? Number(d.count) : 0 }
        }),
      },
    })
  })
}
