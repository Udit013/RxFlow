import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'

// Returns the start/end of a YYYY-MM period
function monthRange(period: string): { from: Date; to: Date } {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) throw new Error('Invalid period')
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  return { from, to }
}

export async function reportRoutes(app: FastifyInstance) {
  // ── GST: GSTR-1 (Outward supplies / sales) ──────────────────────────────────
  // GET /api/v1/reports/gstr1?period=2026-05
  app.get('/gstr1', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.query)
    const { from, to } = monthRange(query.period)

    const [invoices, creditNotes] = await Promise.all([
      prisma.invoice.findMany({
        where: { tenantId, type: 'SALE', createdAt: { gte: from, lt: to } },
        include: {
          customer: { select: { name: true, phone: true, gstin: true, state: true } },
          items: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invoice.findMany({
        where: { tenantId, type: 'CREDIT_NOTE', createdAt: { gte: from, lt: to } },
        include: {
          customer: { select: { name: true, phone: true, gstin: true, state: true } },
          items: true,
          originalInvoice: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // B2B = customer has GSTIN, B2C = no GSTIN (or walk-in)
    const b2bInvoices = invoices.filter((i) => i.customer?.gstin)
    const b2cInvoicesSrc = invoices.filter((i) => !i.customer?.gstin)

    // CDNR (registered — to GSTIN holders) vs CDNUR (unregistered)
    const cdnr = creditNotes.filter((c) => c.customer?.gstin)
    const cdnur = creditNotes.filter((c) => !c.customer?.gstin)

    // Per-rate roll-up (HSN summary)
    const rateRollup: Record<string, { rate: number; taxableValue: number; cgst: number; sgst: number; igst: number; count: number }> = {}
    for (const inv of invoices) {
      for (const it of inv.items) {
        const rate = (it.cgstRate ?? 0) + (it.sgstRate ?? 0) + (it.igstRate ?? 0)
        const key = `${rate}`
        if (!rateRollup[key]) rateRollup[key] = { rate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, count: 0 }
        rateRollup[key].taxableValue += it.taxableAmount
        rateRollup[key].cgst += it.cgstAmount ?? 0
        rateRollup[key].sgst += it.sgstAmount ?? 0
        rateRollup[key].igst += it.igstAmount ?? 0
        rateRollup[key].count += 1
      }
    }

    // HSN-wise summary (Section 12 of GSTR-1)
    const hsnRollup: Record<string, { hsn: string; description: string; uqc: string; totalQty: number; totalValue: number; taxableValue: number; cgst: number; sgst: number; igst: number }> = {}
    for (const inv of invoices) {
      for (const it of inv.items) {
        const hsn = it.hsn || '30049099'
        if (!hsnRollup[hsn]) hsnRollup[hsn] = { hsn, description: it.medicineName, uqc: 'NOS', totalQty: 0, totalValue: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        hsnRollup[hsn].totalQty += it.quantity
        hsnRollup[hsn].totalValue += it.total
        hsnRollup[hsn].taxableValue += it.taxableAmount
        hsnRollup[hsn].cgst += it.cgstAmount ?? 0
        hsnRollup[hsn].sgst += it.sgstAmount ?? 0
        hsnRollup[hsn].igst += it.igstAmount ?? 0
      }
    }

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.totalInvoices += 1
        acc.totalTaxableValue += inv.subtotal - inv.discountAmount
        acc.totalCgst += inv.cgst
        acc.totalSgst += inv.sgst
        acc.totalIgst += inv.igst
        acc.grandTotal += inv.grandTotal
        return acc
      },
      { totalInvoices: 0, totalTaxableValue: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 0 }
    )

    // Credit note totals (reduce outward supply)
    const cnTotals = creditNotes.reduce(
      (acc, cn) => {
        acc.count += 1
        acc.taxableValue += cn.subtotal - cn.discountAmount
        acc.cgst += cn.cgst
        acc.sgst += cn.sgst
        acc.igst += cn.igst
        acc.grandTotal += cn.grandTotal
        return acc
      },
      { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0 }
    )

    // Net outward supply (sales minus returns)
    const netOutward = {
      taxableValue: totals.totalTaxableValue - cnTotals.taxableValue,
      cgst: totals.totalCgst - cnTotals.cgst,
      sgst: totals.totalSgst - cnTotals.sgst,
      igst: totals.totalIgst - cnTotals.igst,
      grandTotal: totals.grandTotal - cnTotals.grandTotal,
    }

    const mapCn = (cn: typeof creditNotes[number]) => ({
      invoiceNumber: cn.invoiceNumber,
      date: cn.createdAt,
      originalInvoice: cn.originalInvoice?.invoiceNumber ?? null,
      customer: cn.customer?.name ?? 'Walk-in',
      gstin: cn.customer?.gstin ?? null,
      customerState: cn.customer?.state ?? null,
      reason: cn.notes ?? '',
      subtotal: cn.subtotal,
      cgst: cn.cgst,
      sgst: cn.sgst,
      igst: cn.igst,
      grandTotal: cn.grandTotal,
    })

    return reply.send({
      success: true,
      data: {
        period: query.period,
        from, to,
        totals: {
          ...totals,
          b2bCount: b2bInvoices.length,
          b2cCount: b2cInvoicesSrc.length,
          creditNoteCount: cnTotals.count,
        },
        creditNoteTotals: cnTotals,
        netOutward,
        cdnr: cdnr.map(mapCn),
        cdnur: cdnur.map(mapCn),
        rateRollup: Object.values(rateRollup),
        hsnRollup: Object.values(hsnRollup),
        b2bInvoices: b2bInvoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          date: inv.createdAt,
          customer: inv.customer?.name ?? 'Walk-in',
          gstin: inv.customer?.gstin,
          customerState: inv.customer?.state,
          subtotal: inv.subtotal,
          cgst: inv.cgst,
          sgst: inv.sgst,
          igst: inv.igst,
          grandTotal: inv.grandTotal,
        })),
        b2cInvoices: b2cInvoicesSrc.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          date: inv.createdAt,
          customer: inv.customer?.name ?? 'Walk-in',
          subtotal: inv.subtotal,
          cgst: inv.cgst,
          sgst: inv.sgst,
          igst: inv.igst,
          grandTotal: inv.grandTotal,
        })),
      },
    })
  })

  // ── GST: GSTR-3B (Summary return) ───────────────────────────────────────────
  // GET /api/v1/reports/gstr3b?period=2026-05
  app.get('/gstr3b', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.query)
    const { from, to } = monthRange(query.period)

    // Outward supplies (sales), credit notes (reductions), and inward supplies (purchases for ITC)
    const [outward, creditNoteAgg, inward] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, type: 'SALE', createdAt: { gte: from, lt: to } },
        _sum: { subtotal: true, discountAmount: true, cgst: true, sgst: true, igst: true, grandTotal: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { tenantId, type: 'CREDIT_NOTE', createdAt: { gte: from, lt: to } },
        _sum: { subtotal: true, discountAmount: true, cgst: true, sgst: true, igst: true, grandTotal: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { tenantId, type: 'PURCHASE', createdAt: { gte: from, lt: to } },
        _sum: { subtotal: true, discountAmount: true, cgst: true, sgst: true, igst: true, grandTotal: true },
        _count: true,
      }),
    ])

    const outwardTaxableGross = (outward._sum.subtotal ?? 0) - (outward._sum.discountAmount ?? 0)
    const cnTaxable = (creditNoteAgg._sum.subtotal ?? 0) - (creditNoteAgg._sum.discountAmount ?? 0)
    const outwardTaxable = outwardTaxableGross - cnTaxable
    const inwardTaxable = (inward._sum.subtotal ?? 0) - (inward._sum.discountAmount ?? 0)

    const netCgst = (outward._sum.cgst ?? 0) - (creditNoteAgg._sum.cgst ?? 0)
    const netSgst = (outward._sum.sgst ?? 0) - (creditNoteAgg._sum.sgst ?? 0)
    const netIgst = (outward._sum.igst ?? 0) - (creditNoteAgg._sum.igst ?? 0)

    return reply.send({
      success: true,
      data: {
        period: query.period,
        from, to,
        // Table 3.1 — Outward supplies (net of credit notes)
        outwardSupplies: {
          taxableValue: outwardTaxable,
          cgst: netCgst,
          sgst: netSgst,
          igst: netIgst,
          totalTax: netCgst + netSgst + netIgst,
          totalValue: (outward._sum.grandTotal ?? 0) - (creditNoteAgg._sum.grandTotal ?? 0),
          invoiceCount: outward._count,
        },
        creditNotes: {
          taxableValue: cnTaxable,
          cgst: creditNoteAgg._sum.cgst ?? 0,
          sgst: creditNoteAgg._sum.sgst ?? 0,
          igst: creditNoteAgg._sum.igst ?? 0,
          totalValue: creditNoteAgg._sum.grandTotal ?? 0,
          count: creditNoteAgg._count,
        },
        // Table 4 — Eligible ITC (input tax credit from purchases)
        inwardSuppliesItc: {
          taxableValue: inwardTaxable,
          cgst: inward._sum.cgst ?? 0,
          sgst: inward._sum.sgst ?? 0,
          igst: inward._sum.igst ?? 0,
          totalItc: (inward._sum.cgst ?? 0) + (inward._sum.sgst ?? 0) + (inward._sum.igst ?? 0),
          totalValue: inward._sum.grandTotal ?? 0,
          invoiceCount: inward._count,
        },
        // Net liability — (output tax net of credit notes) − ITC
        netTaxPayable: {
          cgst: Math.max(0, netCgst - (inward._sum.cgst ?? 0)),
          sgst: Math.max(0, netSgst - (inward._sum.sgst ?? 0)),
          igst: Math.max(0, netIgst - (inward._sum.igst ?? 0)),
        },
      },
    })
  })

  // ── Sales register (raw CSV-friendly export) ────────────────────────────────
  // GET /api/v1/reports/sales-register?from=&to=
  app.get('/sales-register', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { from?: string; to?: string }
    const where: any = { tenantId, type: 'SALE' }
    if (query.from || query.to) {
      where.createdAt = {}
      if (query.from) where.createdAt.gte = new Date(query.from)
      if (query.to) where.createdAt.lte = new Date(query.to)
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return reply.send({
      success: true,
      data: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt,
        customer: inv.customer?.name ?? 'Walk-in',
        phone: inv.customer?.phone ?? '',
        subtotal: inv.subtotal,
        discount: inv.discountAmount,
        cgst: inv.cgst,
        sgst: inv.sgst,
        igst: inv.igst,
        grandTotal: inv.grandTotal,
        paymentStatus: inv.paymentStatus,
      })),
    })
  })

  // ── Purchase register ──────────────────────────────────────────────────────
  app.get('/purchase-register', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { from?: string; to?: string }
    const where: any = { tenantId, type: 'PURCHASE' }
    if (query.from || query.to) {
      where.createdAt = {}
      if (query.from) where.createdAt.gte = new Date(query.from)
      if (query.to) where.createdAt.lte = new Date(query.to)
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: { supplier: { select: { name: true, companyName: true, gstin: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return reply.send({
      success: true,
      data: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt,
        supplier: inv.supplier?.name ?? '',
        supplierGstin: inv.supplier?.gstin ?? '',
        subtotal: inv.subtotal,
        discount: inv.discountAmount,
        cgst: inv.cgst,
        sgst: inv.sgst,
        igst: inv.igst,
        grandTotal: inv.grandTotal,
        paymentStatus: inv.paymentStatus,
      })),
    })
  })

  // ── Schedule H1 Register (CDSCO compliance) ─────────────────────────────────
  // Mandatory register of every Schedule H1 sale with batch, qty, customer, prescription.
  app.get('/schedule-h1-register', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const query = request.query as { from?: string; to?: string; schedule?: string }
    const schedules = query.schedule
      ? [query.schedule]
      : ['SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X']

    const where: any = {
      invoice: { tenantId, type: 'SALE' },
      medicineId: { not: undefined },
    }
    if (query.from || query.to) {
      where.invoice = { ...where.invoice, createdAt: {} }
      if (query.from) where.invoice.createdAt.gte = new Date(query.from)
      if (query.to) where.invoice.createdAt.lte = new Date(query.to)
    }

    const items = await prisma.invoiceItem.findMany({
      where,
      orderBy: { invoice: { createdAt: 'desc' } },
      take: 5000,
      include: {
        invoice: {
          select: {
            invoiceNumber: true, createdAt: true,
            customer: { select: { name: true, phone: true, addressLine1: true } },
          },
        },
        medicine: { select: { id: true, name: true, strength: true, manufacturerName: true, schedule: true, requiresPrescription: true } },
      },
    })

    // Filter to scheduled drugs only
    const filtered = items.filter((it) => schedules.includes(it.medicine?.schedule ?? 'OTC'))

    return reply.send({
      success: true,
      data: filtered.map((it) => ({
        date: it.invoice.createdAt,
        invoiceNumber: it.invoice.invoiceNumber,
        medicine: it.medicine?.name,
        strength: it.medicine?.strength,
        manufacturer: it.medicine?.manufacturerName,
        schedule: it.medicine?.schedule,
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        customerName: it.invoice.customer?.name ?? 'Walk-in',
        customerPhone: it.invoice.customer?.phone ?? '',
        customerAddress: it.invoice.customer?.addressLine1 ?? '',
      })),
    })
  })

  // ── License Expiry Alerts ───────────────────────────────────────────────────
  // Returns tenant + supplier drug licenses sorted by days-to-expiry.
  app.get('/license-expiry', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const days = Number((request.query as { days?: string }).days ?? 180)
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const today = new Date()

    const [tenant, suppliers] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, drugLicenseNumber: true, drugLicenseExpiryDate: true },
      }),
      prisma.supplier.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { drugLicenseExpiryDate: { lte: cutoff } },
            { drugLicenseExpiryDate: null },
          ],
        },
        select: { id: true, name: true, companyName: true, drugLicenseNumber: true, drugLicenseExpiryDate: true },
      }),
    ])

    const items: Array<{ kind: string; id: string; name: string; licenseNumber: string | null; expiryDate: string | null; daysUntilExpiry: number | null; status: 'EXPIRED' | 'EXPIRING' | 'OK' | 'MISSING' }> = []

    function classify(exp: Date | null | undefined): { status: 'EXPIRED' | 'EXPIRING' | 'OK' | 'MISSING'; daysUntilExpiry: number | null } {
      if (!exp) return { status: 'MISSING', daysUntilExpiry: null }
      const d = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (d < 0) return { status: 'EXPIRED', daysUntilExpiry: d }
      if (d <= days) return { status: 'EXPIRING', daysUntilExpiry: d }
      return { status: 'OK', daysUntilExpiry: d }
    }

    if (tenant) {
      const c = classify(tenant.drugLicenseExpiryDate)
      items.push({
        kind: 'TENANT',
        id: tenant.id,
        name: `${tenant.name} (your license)`,
        licenseNumber: tenant.drugLicenseNumber ?? null,
        expiryDate: tenant.drugLicenseExpiryDate?.toISOString() ?? null,
        ...c,
      })
    }
    for (const s of suppliers) {
      const c = classify(s.drugLicenseExpiryDate)
      items.push({
        kind: 'SUPPLIER',
        id: s.id,
        name: `${s.name} — ${s.companyName}`,
        licenseNumber: s.drugLicenseNumber ?? null,
        expiryDate: s.drugLicenseExpiryDate?.toISOString() ?? null,
        ...c,
      })
    }

    // Sort: EXPIRED first, then EXPIRING (soonest first), then MISSING, then OK
    const rank = { EXPIRED: 0, EXPIRING: 1, MISSING: 2, OK: 3 } as const
    items.sort((a, b) => {
      const r = rank[a.status] - rank[b.status]
      if (r !== 0) return r
      return (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999)
    })

    return reply.send({ success: true, data: items })
  })

  // ── Stock Valuation ─────────────────────────────────────────────────────────
  // GET /api/v1/reports/stock-valuation
  // Sums each medicine's available stock × its weighted-avg purchase price.
  // Also reports value at MRP and the implied margin.
  app.get('/stock-valuation', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user

    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { tenantId },
      include: {
        medicine: { select: { id: true, name: true, manufacturerName: true, dosageForm: true, strength: true, mrp: true, hsn: true, schedule: true } },
        batches: { where: { quantity: { gt: 0 } } },
      },
    })

    const rows = inventoryItems.map((item) => {
      const totalQty = item.batches.reduce((s, b) => s + b.quantity, 0)
      const valueAtCost = item.batches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0)
      const avgCostPrice = totalQty > 0 ? valueAtCost / totalQty : 0
      const valueAtMrp = totalQty * item.medicine.mrp
      const valueAtSelling = totalQty * item.sellingPrice
      const margin = valueAtSelling - valueAtCost
      const marginPercent = valueAtCost > 0 ? (margin / valueAtCost) * 100 : 0
      return {
        medicineId: item.medicine.id,
        medicine: item.medicine.name,
        manufacturer: item.medicine.manufacturerName,
        strength: item.medicine.strength,
        dosageForm: item.medicine.dosageForm,
        hsn: item.medicine.hsn,
        schedule: item.medicine.schedule,
        quantity: totalQty,
        avgCostPrice,
        sellingPrice: item.sellingPrice,
        mrp: item.medicine.mrp,
        valueAtCost,
        valueAtSelling,
        valueAtMrp,
        margin,
        marginPercent,
        batchCount: item.batches.length,
      }
    }).filter((r) => r.quantity > 0).sort((a, b) => b.valueAtCost - a.valueAtCost)

    const grand = rows.reduce(
      (acc, r) => ({
        totalQty: acc.totalQty + r.quantity,
        valueAtCost: acc.valueAtCost + r.valueAtCost,
        valueAtSelling: acc.valueAtSelling + r.valueAtSelling,
        valueAtMrp: acc.valueAtMrp + r.valueAtMrp,
        margin: acc.margin + r.margin,
      }),
      { totalQty: 0, valueAtCost: 0, valueAtSelling: 0, valueAtMrp: 0, margin: 0 }
    )

    // Top categories — by manufacturer
    const byManufacturer: Record<string, { manufacturer: string; valueAtCost: number; quantity: number; skus: number }> = {}
    for (const r of rows) {
      const key = r.manufacturer
      if (!byManufacturer[key]) byManufacturer[key] = { manufacturer: key, valueAtCost: 0, quantity: 0, skus: 0 }
      byManufacturer[key].valueAtCost += r.valueAtCost
      byManufacturer[key].quantity += r.quantity
      byManufacturer[key].skus += 1
    }

    return reply.send({
      success: true,
      data: {
        rows,
        totals: {
          ...grand,
          skuCount: rows.length,
          marginPercent: grand.valueAtCost > 0 ? (grand.margin / grand.valueAtCost) * 100 : 0,
        },
        topManufacturers: Object.values(byManufacturer).sort((a, b) => b.valueAtCost - a.valueAtCost).slice(0, 10),
      },
    })
  })
}
