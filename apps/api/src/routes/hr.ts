import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js'
import { audit } from '../utils/audit.js'

function daysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
function monthBounds(period: string): { from: Date; to: Date } {
  const [y, m] = period.split('-').map(Number)
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) }
}

// Payable weight per attendance status (for loss-of-pay calc)
const STATUS_WEIGHT: Record<string, { present: number; lop: number; leave: number }> = {
  PRESENT:      { present: 1,   lop: 0,   leave: 0 },
  HALF_DAY:     { present: 0.5, lop: 0.5, leave: 0 },
  ABSENT:       { present: 0,   lop: 1,   leave: 0 },
  UNPAID_LEAVE: { present: 0,   lop: 1,   leave: 1 },
  PAID_LEAVE:   { present: 1,   lop: 0,   leave: 1 },
  HOLIDAY:      { present: 1,   lop: 0,   leave: 0 },
  WEEK_OFF:     { present: 1,   lop: 0,   leave: 0 },
}

export async function hrRoutes(app: FastifyInstance) {
  // ── Employees ───────────────────────────────────────────────────────────────
  app.get('/employees', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = request.query as { page?: string; limit?: string; search?: string; active?: string }
    const { page, limit, skip, take } = getPaginationParams({ page: Number(q.page), limit: Number(q.limit) })
    const where: any = { tenantId }
    if (q.active === 'true') where.isActive = true
    if (q.active === 'false') where.isActive = false
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
        { employeeCode: { contains: q.search, mode: 'insensitive' } },
        { designation: { contains: q.search, mode: 'insensitive' } },
      ]
    }
    const [items, total] = await Promise.all([
      prisma.employee.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.employee.count({ where }),
    ])
    return reply.send({ success: true, data: items, meta: buildPaginationMeta(total, page, limit) })
  })

  app.get('/employees/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const emp = await prisma.employee.findFirst({ where: { id, tenantId } })
    if (!emp) return reply.status(404).send({ success: false, error: 'Employee not found' })
    return reply.send({ success: true, data: emp })
  })

  const employeeSchema = z.object({
    name: z.string().min(1),
    phone: z.string().min(10),
    email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
    employeeCode: z.string().optional(),
    designation: z.string().optional(),
    department: z.string().optional(),
    joiningDate: z.string().transform((s) => new Date(s)).optional(),
    salaryType: z.enum(['MONTHLY', 'DAILY']).default('MONTHLY'),
    monthlySalary: z.number().min(0).default(0),
    dailyRate: z.number().min(0).default(0),
    bankAccount: z.string().optional(),
    bankIfsc: z.string().optional(),
    userId: z.string().nullish(),
    storeId: z.string().optional(),
    notes: z.string().optional(),
  })

  app.post('/employees', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const body = employeeSchema.parse(request.body)
    const existing = await prisma.employee.findUnique({ where: { tenantId_phone: { tenantId, phone: body.phone } } })
    if (existing) return reply.status(409).send({ success: false, error: 'Employee with this phone already exists' })
    const emp = await prisma.employee.create({ data: { ...body, tenantId } })
    await audit(request, { action: 'employee.create', entityType: 'Employee', entityId: emp.id, newValues: { name: emp.name, designation: emp.designation }, invalidate: ['employees'] })
    return reply.status(201).send({ success: true, data: emp })
  })

  app.put('/employees/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = employeeSchema.partial().extend({ isActive: z.boolean().optional() }).parse(request.body)
    const emp = await prisma.employee.findFirst({ where: { id, tenantId } })
    if (!emp) return reply.status(404).send({ success: false, error: 'Employee not found' })
    const updated = await prisma.employee.update({ where: { id }, data: body })
    await audit(request, { action: 'employee.update', entityType: 'Employee', entityId: id, newValues: body, invalidate: ['employees', 'employee'] })
    return reply.send({ success: true, data: updated })
  })

  // ── Attendance ──────────────────────────────────────────────────────────────
  // GET /hr/attendance?period=YYYY-MM  → matrix of all active employees × days
  app.get('/attendance', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = request.query as { period?: string }
    const period = q.period && /^\d{4}-\d{2}$/.test(q.period) ? q.period : new Date().toISOString().slice(0, 7)
    const { from, to } = monthBounds(period)

    const [employees, records] = await Promise.all([
      prisma.employee.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, designation: true } }),
      prisma.attendance.findMany({ where: { tenantId, date: { gte: from, lt: to } } }),
    ])

    // Map records: employeeId -> { 'YYYY-MM-DD': status }
    const byEmp: Record<string, Record<string, { status: string; id: string }>> = {}
    for (const r of records) {
      const day = r.date.toISOString().slice(0, 10)
      if (!byEmp[r.employeeId]) byEmp[r.employeeId] = {}
      byEmp[r.employeeId][day] = { status: r.status, id: r.id }
    }

    // Per-employee summary
    const summary = employees.map((e) => {
      const recs = byEmp[e.id] ?? {}
      let present = 0, absent = 0, leave = 0, halfDay = 0
      for (const v of Object.values(recs)) {
        const w = STATUS_WEIGHT[v.status]
        if (!w) continue
        if (v.status === 'HALF_DAY') halfDay++
        else if (v.status === 'ABSENT') absent++
        else if (v.status === 'UNPAID_LEAVE' || v.status === 'PAID_LEAVE') leave++
        else if (v.status === 'PRESENT') present++
      }
      return { employee: e, records: recs, present, absent, leave, halfDay, marked: Object.keys(recs).length }
    })

    return reply.send({ success: true, data: { period, daysInMonth: daysInMonth(period), employees: summary } })
  })

  // POST /hr/attendance — mark/update one day for one employee (upsert)
  app.post('/attendance', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = z.object({
      employeeId: z.string(),
      date: z.string(), // YYYY-MM-DD
      status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEK_OFF']),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      notes: z.string().optional(),
    }).parse(request.body)

    const emp = await prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } })
    if (!emp) return reply.status(404).send({ success: false, error: 'Employee not found' })

    const date = new Date(body.date + 'T00:00:00.000Z')
    const rec = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: body.employeeId, date } },
      update: { status: body.status, checkIn: body.checkIn, checkOut: body.checkOut, notes: body.notes, markedBy: userId },
      create: { tenantId, employeeId: body.employeeId, date, status: body.status, checkIn: body.checkIn, checkOut: body.checkOut, notes: body.notes, markedBy: userId },
    })
    return reply.send({ success: true, data: rec })
  })

  // POST /hr/attendance/bulk — mark all employees present/off for a day (fast daily entry)
  app.post('/attendance/bulk', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = z.object({
      date: z.string(),
      status: z.enum(['PRESENT', 'ABSENT', 'HOLIDAY', 'WEEK_OFF']),
      onlyUnmarked: z.boolean().default(true),
    }).parse(request.body)

    const date = new Date(body.date + 'T00:00:00.000Z')
    const employees = await prisma.employee.findMany({ where: { tenantId, isActive: true }, select: { id: true } })
    const existing = body.onlyUnmarked
      ? new Set((await prisma.attendance.findMany({ where: { tenantId, date }, select: { employeeId: true } })).map((r) => r.employeeId))
      : new Set<string>()

    let count = 0
    for (const e of employees) {
      if (existing.has(e.id)) continue
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: e.id, date } },
        update: { status: body.status, markedBy: userId },
        create: { tenantId, employeeId: e.id, date, status: body.status, markedBy: userId },
      })
      count++
    }
    return reply.send({ success: true, data: { marked: count } })
  })

  // ── Payroll ─────────────────────────────────────────────────────────────────
  app.get('/payroll', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const runs = await prisma.payrollRun.findMany({
      where: { tenantId },
      orderBy: { period: 'desc' },
      include: { payslips: { select: { id: true, status: true } } },
    })
    return reply.send({
      success: true,
      data: runs.map((r) => ({
        ...r,
        payslips: undefined,
        payslipCount: r.payslips.length,
        paidCount: r.payslips.filter((p) => p.status === 'PAID').length,
      })),
    })
  })

  app.get('/payroll/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const run = await prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: { payslips: { orderBy: { employeeName: 'asc' } } },
    })
    if (!run) return reply.status(404).send({ success: false, error: 'Payroll run not found' })
    return reply.send({ success: true, data: run })
  })

  // POST /hr/payroll/generate — create payslips for a period from salary + attendance
  app.post('/payroll/generate', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const body = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.body)

    const existing = await prisma.payrollRun.findUnique({ where: { tenantId_period: { tenantId, period: body.period } } })
    if (existing) return reply.status(409).send({ success: false, error: `Payroll for ${body.period} already exists` })

    const totalDays = daysInMonth(body.period)
    const { from, to } = monthBounds(body.period)

    const employees = await prisma.employee.findMany({ where: { tenantId, isActive: true } })
    if (employees.length === 0) return reply.status(400).send({ success: false, error: 'No active employees' })

    const attendance = await prisma.attendance.findMany({ where: { tenantId, date: { gte: from, lt: to } } })
    const attByEmp: Record<string, typeof attendance> = {}
    for (const a of attendance) {
      if (!attByEmp[a.employeeId]) attByEmp[a.employeeId] = []
      attByEmp[a.employeeId].push(a)
    }

    const payslips = employees.map((e) => {
      const recs = attByEmp[e.id] ?? []
      let presentDays = 0, lopDays = 0, leaveDays = 0, absentDays = 0
      for (const r of recs) {
        const w = STATUS_WEIGHT[r.status]
        if (!w) continue
        presentDays += w.present
        lopDays += w.lop
        leaveDays += w.leave
        if (r.status === 'ABSENT') absentDays += 1
      }

      let earnedSalary: number
      let baseSalary: number
      if (e.salaryType === 'DAILY') {
        baseSalary = e.dailyRate * totalDays
        earnedSalary = e.dailyRate * presentDays
      } else {
        baseSalary = e.monthlySalary
        const perDay = totalDays > 0 ? e.monthlySalary / totalDays : 0
        earnedSalary = e.monthlySalary - perDay * lopDays
      }
      const netPay = Math.max(0, earnedSalary)
      return {
        employeeId: e.id,
        employeeName: e.name,
        baseSalary,
        totalDays,
        presentDays,
        absentDays,
        leaveDays,
        lopDays,
        earnedSalary: Math.round(earnedSalary * 100) / 100,
        bonus: 0,
        allowances: 0,
        deductions: 0,
        netPay: Math.round(netPay * 100) / 100,
      }
    })

    const totalGross = payslips.reduce((s, p) => s + p.earnedSalary, 0)
    const totalNet = payslips.reduce((s, p) => s + p.netPay, 0)

    const run = await prisma.payrollRun.create({
      data: {
        tenantId,
        period: body.period,
        status: 'DRAFT',
        totalGross,
        totalDeductions: 0,
        totalNet,
        generatedBy: userId,
        payslips: { create: payslips },
      },
      include: { payslips: true },
    })

    await audit(request, { action: 'payroll.generate', entityType: 'PayrollRun', entityId: run.id, newValues: { period: body.period, employees: payslips.length, totalNet }, invalidate: ['payroll'] })
    return reply.status(201).send({ success: true, data: { id: run.id, period: run.period, payslipCount: payslips.length, totalNet } })
  })

  // PATCH /hr/payroll/payslip/:id — adjust bonus/allowance/deduction; recompute net
  app.patch('/payroll/payslip/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user
    const body = z.object({
      bonus: z.number().min(0).optional(),
      allowances: z.number().min(0).optional(),
      deductions: z.number().min(0).optional(),
      deductionNote: z.string().optional(),
    }).parse(request.body)

    const slip = await prisma.payslip.findFirst({ where: { id, payrollRun: { tenantId } } })
    if (!slip) return reply.status(404).send({ success: false, error: 'Payslip not found' })

    const bonus = body.bonus ?? slip.bonus
    const allowances = body.allowances ?? slip.allowances
    const deductions = body.deductions ?? slip.deductions
    const netPay = Math.max(0, slip.earnedSalary + bonus + allowances - deductions)

    const updated = await prisma.payslip.update({
      where: { id },
      data: { bonus, allowances, deductions, deductionNote: body.deductionNote, netPay: Math.round(netPay * 100) / 100 },
    })

    // Recompute run totals
    const all = await prisma.payslip.findMany({ where: { payrollRunId: slip.payrollRunId } })
    await prisma.payrollRun.update({
      where: { id: slip.payrollRunId },
      data: {
        totalGross: all.reduce((s, p) => s + p.earnedSalary + p.bonus + p.allowances, 0),
        totalDeductions: all.reduce((s, p) => s + p.deductions, 0),
        totalNet: all.reduce((s, p) => s + p.netPay, 0),
      },
    })
    return reply.send({ success: true, data: updated })
  })

  // POST /hr/payroll/payslip/:id/pay — mark a payslip paid + log as an expense
  app.post('/payroll/payslip/:id/pay', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId, userId } = request.user
    const { id } = request.params as { id: string }
    const body = z.object({ method: z.enum(['CASH', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'CARD']).default('NEFT') }).parse(request.body)

    const slip = await prisma.payslip.findFirst({ where: { id, payrollRun: { tenantId } }, include: { payrollRun: true } })
    if (!slip) return reply.status(404).send({ success: false, error: 'Payslip not found' })
    if (slip.status === 'PAID') return reply.status(400).send({ success: false, error: 'Already paid' })

    await prisma.$transaction(async (tx) => {
      await tx.payslip.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), paymentMethod: body.method } })
      // Record as a salary expense so it flows into Accounts (P&L + cash flow)
      await tx.expense.create({
        data: {
          tenantId,
          direction: 'OUT',
          category: 'Salaries',
          amount: slip.netPay,
          paymentMethod: body.method,
          paidTo: slip.employeeName,
          reference: `Payslip ${slip.payrollRun.period}`,
          createdBy: userId,
        },
      })
    })

    await audit(request, { action: 'payroll.payslip.pay', entityType: 'Payslip', entityId: id, newValues: { employee: slip.employeeName, amount: slip.netPay, method: body.method }, invalidate: ['payroll', 'expenses', 'accounts-pnl', 'accounts-cashflow'] })
    return reply.send({ success: true })
  })

  // ── Staff performance ─────────────────────────────────────────────────────────
  // Computed: attendance rate + sales attributed (orders.createdBy = employee.userId)
  app.get('/performance', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantId } = request.user
    const q = request.query as { period?: string }
    const period = q.period && /^\d{4}-\d{2}$/.test(q.period) ? q.period : new Date().toISOString().slice(0, 7)
    const { from, to } = monthBounds(period)
    const totalDays = daysInMonth(period)

    const employees = await prisma.employee.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })
    const [attendance, salesByUser] = await Promise.all([
      prisma.attendance.findMany({ where: { tenantId, date: { gte: from, lt: to } } }),
      prisma.order.groupBy({
        by: ['createdBy'],
        where: { tenantId, type: 'SALE', createdAt: { gte: from, lt: to }, status: { not: 'CANCELLED' } },
        _sum: { total: true },
        _count: true,
      }),
    ])

    const attByEmp: Record<string, { present: number; lop: number; marked: number }> = {}
    for (const a of attendance) {
      const w = STATUS_WEIGHT[a.status]
      if (!attByEmp[a.employeeId]) attByEmp[a.employeeId] = { present: 0, lop: 0, marked: 0 }
      attByEmp[a.employeeId].present += w?.present ?? 0
      attByEmp[a.employeeId].lop += w?.lop ?? 0
      attByEmp[a.employeeId].marked += 1
    }
    const salesMap = new Map(salesByUser.map((s) => [s.createdBy, { total: s._sum.total ?? 0, count: s._count }]))

    const rows = employees.map((e) => {
      const att = attByEmp[e.id] ?? { present: 0, lop: 0, marked: 0 }
      const sales = e.userId ? salesMap.get(e.userId) : undefined
      const attendanceRate = att.marked > 0 ? (att.present / att.marked) * 100 : 0
      return {
        employeeId: e.id,
        name: e.name,
        designation: e.designation,
        daysMarked: att.marked,
        presentDays: att.present,
        attendanceRate: Math.round(attendanceRate * 10) / 10,
        salesValue: sales?.total ?? 0,
        salesCount: sales?.count ?? 0,
        linkedToLogin: !!e.userId,
      }
    })

    rows.sort((a, b) => b.salesValue - a.salesValue || b.attendanceRate - a.attendanceRate)
    return reply.send({ success: true, data: { period, totalDays, employees: rows } })
  })
}
