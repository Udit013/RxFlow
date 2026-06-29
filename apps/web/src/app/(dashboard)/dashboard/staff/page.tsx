'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Users2, Plus, X, Search, CalendarCheck, Wallet, TrendingUp, Check,
  IndianRupee, Phone, Briefcase,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatCurrency } from '@/lib/utils'
import { AnimatedSection, PageHeader, MetricCard, SectionCard, EmptyState, SkeletonRow } from '@/components/ui'

// Roles permitted to view individual salary figures in lists.
const SALARY_VIEW_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'STORE_MANAGER']

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function StaffPage() {
  const [tab, setTab] = useState<'employees' | 'attendance' | 'payroll' | 'performance'>('employees')

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Users2}
          eyebrow="Human Resources"
          title="Staff & Payroll"
          description="Employees, attendance, monthly payroll, performance"
        />
      </AnimatedSection>

      <AnimatedSection>
        <div className="flex items-center gap-1 bg-white border border-surface-200/70 rounded-xl p-1 w-fit shadow-xs overflow-x-auto max-w-full">
          {([
            ['employees', 'Employees', Briefcase],
            ['attendance', 'Attendance', CalendarCheck],
            ['payroll', 'Payroll', Wallet],
            ['performance', 'Performance', TrendingUp],
          ] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                tab === k ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-600 hover:bg-surface-50'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </AnimatedSection>

      <AnimatedSection key={tab}>
        {tab === 'employees' && <EmployeesTab />}
        {tab === 'attendance' && <AttendanceTab />}
        {tab === 'payroll' && <PayrollTab />}
        {tab === 'performance' && <PerformanceTab />}
      </AnimatedSection>
    </div>
  )
}

// ── Employees ─────────────────────────────────────────────────────────────────

interface EmployeeForm {
  name: string; phone: string; email?: string; employeeCode?: string
  designation?: string; department?: string; joiningDate?: string
  salaryType: 'MONTHLY' | 'DAILY'; monthlySalary: number; dailyRate: number
  bankAccount?: string; bankIfsc?: string; userId?: string
}

function EmployeesTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<'new' | any | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search],
    queryFn: () => api.get('/hr/employees', { params: { search: search || undefined, limit: 100 } }).then((r) => r.data),
  })
  const employees: any[] = data?.data ?? []
  const totalMonthly = employees.filter(e => e.isActive && e.salaryType === 'MONTHLY').reduce((s, e) => s + e.monthlySalary, 0)
  const canSeeSalary = SALARY_VIEW_ROLES.includes(authService.getStoredUser()?.role ?? '')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard icon={Users2} tone="brand" label="Active Staff" value={String(employees.filter(e => e.isActive).length)} />
        {canSeeSalary && <MetricCard icon={IndianRupee} tone="warning" label="Monthly Salary Bill" value={formatCurrency(totalMonthly)} sub="Monthly-paid staff" />}
        <MetricCard icon={Briefcase} tone="neutral" label="Total Records" value={String(employees.length)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="card !p-2 flex-1 flex items-center gap-2">
          <Search className="w-4 h-4 text-surface-400 ml-1" />
          <input className="flex-1 text-sm bg-transparent outline-none" placeholder="Search by name, phone, designation..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setEdit('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
      </div>

      <SectionCard flush>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50/60 text-[10px] uppercase tracking-[0.1em] text-surface-500">
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-4 py-2.5">Designation</th>
              <th className="text-left px-4 py-2.5">Contact</th>
              {canSeeSalary && <th className="text-left px-4 py-2.5">Salary</th>}
              <th className="text-center px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {isLoading ? <SkeletonRow columns={canSeeSalary ? 6 : 5} rows={5} /> : employees.length === 0 ? (
              <tr><td colSpan={canSeeSalary ? 6 : 5}><EmptyState icon={Users2} title="No employees" description="Add your staff to start tracking attendance and payroll." action={<button onClick={() => setEdit('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>} /></td></tr>
            ) : employees.map((e) => (
              <tr key={e.id} className={cn('hover:bg-surface-50/60', !e.isActive && 'opacity-50')}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-surface-900">{e.name}</p>
                  {e.employeeCode && <p className="text-xs text-surface-500 font-mono">{e.employeeCode}</p>}
                </td>
                <td className="px-4 py-2.5 text-surface-600">{e.designation ?? '—'}</td>
                <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-surface-700"><Phone className="w-3.5 h-3.5 text-surface-400" />{e.phone}</span></td>
                {canSeeSalary && (
                  <td className="px-4 py-2.5">
                    {e.salaryType === 'MONTHLY' ? <span className="font-medium">{formatCurrency(e.monthlySalary)}<span className="text-xs text-surface-400">/mo</span></span> : <span className="font-medium">{formatCurrency(e.dailyRate)}<span className="text-xs text-surface-400">/day</span></span>}
                  </td>
                )}
                <td className="px-4 py-2.5 text-center">{e.isActive ? <span className="badge-success">Active</span> : <span className="badge-neutral">Inactive</span>}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => setEdit(e)} className="text-xs text-brand-600 hover:underline">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {edit && <EmployeeModal existing={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); queryClient.invalidateQueries({ queryKey: ['employees'] }) }} />}
    </div>
  )
}

function EmployeeModal({ existing, onClose, onSaved }: { existing?: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existing
  const { register, handleSubmit, watch, formState: { errors } } = useForm<EmployeeForm>({
    defaultValues: existing ? {
      name: existing.name, phone: existing.phone, email: existing.email ?? '', employeeCode: existing.employeeCode ?? '',
      designation: existing.designation ?? '', department: existing.department ?? '',
      joiningDate: existing.joiningDate ? new Date(existing.joiningDate).toISOString().slice(0, 10) : '',
      salaryType: existing.salaryType, monthlySalary: existing.monthlySalary, dailyRate: existing.dailyRate,
      bankAccount: existing.bankAccount ?? '', bankIfsc: existing.bankIfsc ?? '', userId: existing.userId ?? '',
    } : { salaryType: 'MONTHLY', monthlySalary: 0, dailyRate: 0 },
  })
  const salaryType = watch('salaryType')

  // Tenant login accounts — for linking sales attribution
  const { data: usersData } = useQuery({ queryKey: ['tenant-users'], queryFn: () => api.get('/tenant/users').then((r) => r.data) })
  const users: any[] = usersData?.data ?? []

  const mutation = useMutation({
    mutationFn: (d: EmployeeForm) => {
      const payload: any = { ...d, monthlySalary: Number(d.monthlySalary) || 0, dailyRate: Number(d.dailyRate) || 0 }
      // userId: '' means explicitly unlink → send null; other empty strings get dropped
      payload.userId = d.userId ? d.userId : null
      for (const k of Object.keys(payload)) if (k !== 'userId' && payload[k] === '') delete payload[k]
      return isEdit ? api.put(`/hr/employees/${existing.id}`, payload) : api.post('/hr/employees', payload)
    },
    onSuccess: () => { toast.success(isEdit ? 'Employee updated' : 'Employee added'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 sticky top-0 bg-white">
          <h2 className="font-semibold">{isEdit ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name *</label><input className="input" {...register('name', { required: true })} />{errors.name && <p className="text-xs text-danger-600 mt-1">Required</p>}</div>
            <div><label className="label">Phone *</label><input className="input" {...register('phone', { required: true, minLength: 10 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Designation</label><input className="input" {...register('designation')} placeholder="Pharmacist, Cashier..." /></div>
            <div><label className="label">Employee Code</label><input className="input" {...register('employeeCode')} placeholder="EMP-001" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Email</label><input className="input" type="email" {...register('email')} /></div>
            <div><label className="label">Joining Date</label><input className="input" type="date" {...register('joiningDate')} /></div>
          </div>
          <div>
            <label className="label">Salary Type</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={cn('flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer text-sm', salaryType === 'MONTHLY' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-200')}><input type="radio" value="MONTHLY" {...register('salaryType')} className="sr-only" /> Monthly</label>
              <label className={cn('flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer text-sm', salaryType === 'DAILY' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-200')}><input type="radio" value="DAILY" {...register('salaryType')} className="sr-only" /> Daily wage</label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {salaryType === 'MONTHLY' ? (
              <div><label className="label">Monthly Salary (₹)</label><input className="input" type="number" {...register('monthlySalary', { valueAsNumber: true })} /></div>
            ) : (
              <div><label className="label">Daily Rate (₹)</label><input className="input" type="number" {...register('dailyRate', { valueAsNumber: true })} /></div>
            )}
          </div>
          <div className="pt-2 border-t border-surface-100">
            <label className="label">Link to login account</label>
            <select className="input" {...register('userId')}>
              <option value="">— Not linked —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role}) · {u.email}</option>)}
            </select>
            <p className="help-text">Linking attributes this staff member&apos;s POS sales to them in the Performance tab.</p>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-surface-500 hover:text-surface-700">Bank details (optional)</summary>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div><label className="label">Account No.</label><input className="input" {...register('bankAccount')} /></div>
              <div><label className="label">IFSC</label><input className="input" {...register('bankIfsc')} /></div>
            </div>
          </details>
          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? 'Saving...' : isEdit ? 'Save' : 'Add Employee'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Attendance ────────────────────────────────────────────────────────────────

const ATT_OPTIONS = [
  { v: 'PRESENT', label: 'P', color: 'bg-success-100 text-success-700', full: 'Present' },
  { v: 'ABSENT', label: 'A', color: 'bg-danger-100 text-danger-700', full: 'Absent' },
  { v: 'HALF_DAY', label: '½', color: 'bg-warning-100 text-warning-700', full: 'Half Day' },
  { v: 'PAID_LEAVE', label: 'PL', color: 'bg-brand-100 text-brand-700', full: 'Paid Leave' },
  { v: 'UNPAID_LEAVE', label: 'UL', color: 'bg-surface-200 text-surface-700', full: 'Unpaid Leave' },
  { v: 'WEEK_OFF', label: 'WO', color: 'bg-surface-100 text-surface-400', full: 'Week Off' },
  { v: 'HOLIDAY', label: 'H', color: 'bg-accent-100 text-accent-700', full: 'Holiday' },
]

function AttendanceTab() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(thisMonth())
  const today = new Date().toISOString().slice(0, 10)

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', period],
    queryFn: () => api.get('/hr/attendance', { params: { period } }).then((r) => r.data),
  })
  const d = data?.data
  const days = d ? Array.from({ length: d.daysInMonth }, (_, i) => i + 1) : []

  const mark = useMutation({
    mutationFn: (v: { employeeId: string; date: string; status: string }) => api.post('/hr/attendance', v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance', period] }),
    onError: () => toast.error('Failed'),
  })

  const bulk = useMutation({
    mutationFn: (status: string) => api.post('/hr/attendance/bulk', { date: today, status, onlyUnmarked: true }),
    onSuccess: (res) => { toast.success(`Marked ${res.data.data.marked} unmarked staff`); queryClient.invalidateQueries({ queryKey: ['attendance', period] }) },
    onError: () => toast.error('Failed'),
  })

  function cycle(employeeId: string, day: number, current?: string) {
    const date = `${period}-${String(day).padStart(2, '0')}`
    const order = ['PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'WEEK_OFF', 'HOLIDAY']
    const next = current ? order[(order.indexOf(current) + 1) % order.length] : 'PRESENT'
    mark.mutate({ employeeId, date, status: next })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="card !px-3 !py-1.5 flex items-center gap-2 shadow-xs">
          <CalendarCheck className="w-4 h-4 text-surface-400" />
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="text-sm outline-none bg-transparent" />
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-500">Quick-mark today:</div>
        <div className="flex gap-2">
          <button onClick={() => bulk.mutate('PRESENT')} disabled={bulk.isPending} className="btn-secondary !py-1.5 !px-3 text-xs">All Present</button>
          <button onClick={() => bulk.mutate('WEEK_OFF')} disabled={bulk.isPending} className="btn-secondary !py-1.5 !px-3 text-xs">Week Off</button>
          <button onClick={() => bulk.mutate('HOLIDAY')} disabled={bulk.isPending} className="btn-secondary !py-1.5 !px-3 text-xs">Holiday</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {ATT_OPTIONS.map((o) => (
          <span key={o.v} className="flex items-center gap-1"><span className={cn('w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold', o.color)}>{o.label}</span>{o.full}</span>
        ))}
        <span className="text-surface-400">· click a cell to cycle status</span>
      </div>

      <SectionCard flush>
        {isLoading ? (
          <div className="p-12 text-center text-surface-400">Loading...</div>
        ) : (d?.employees?.length ?? 0) === 0 ? (
          <EmptyState icon={Users2} title="No active employees" description="Add employees first to mark attendance." />
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-surface-50/60">
                  <th className="sticky left-0 bg-surface-50 text-left px-3 py-2 text-[10px] uppercase tracking-wide text-surface-500 min-w-[140px] z-10">Employee</th>
                  {days.map((day) => (
                    <th key={day} className="px-1 py-2 text-[10px] text-surface-500 font-medium w-8 text-center">{day}</th>
                  ))}
                  <th className="px-2 py-2 text-[10px] uppercase text-surface-500 text-center">P/A</th>
                </tr>
              </thead>
              <tbody>
                {d.employees.map((e: any) => (
                  <tr key={e.employee.id} className="border-t border-surface-100">
                    <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-surface-800 z-10">
                      {e.employee.name}
                      <span className="block text-[10px] text-surface-400 font-normal">{e.employee.designation}</span>
                    </td>
                    {days.map((day) => {
                      const key = `${period}-${String(day).padStart(2, '0')}`
                      const rec = e.records[key]
                      const opt = rec ? ATT_OPTIONS.find((o) => o.v === rec.status) : null
                      return (
                        <td key={day} className="px-0.5 py-1 text-center">
                          <button
                            onClick={() => cycle(e.employee.id, day, rec?.status)}
                            className={cn('w-6 h-6 rounded text-[10px] font-bold transition-colors', opt ? opt.color : 'bg-surface-50 text-surface-300 hover:bg-surface-100')}
                            title={opt?.full ?? 'Not marked'}
                          >
                            {opt?.label ?? '·'}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap">
                      <span className="text-success-700 font-medium">{e.present}</span>
                      <span className="text-surface-300">/</span>
                      <span className="text-danger-700 font-medium">{e.absent}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── Payroll ───────────────────────────────────────────────────────────────────

function PayrollTab() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(thisMonth())
  const [openRun, setOpenRun] = useState<string | null>(null)

  const { data } = useQuery({ queryKey: ['payroll'], queryFn: () => api.get('/hr/payroll').then((r) => r.data) })
  const runs: any[] = data?.data ?? []

  const generate = useMutation({
    mutationFn: () => api.post('/hr/payroll/generate', { period }),
    onSuccess: (res) => { toast.success(`Payroll generated · ${res.data.data.payslipCount} payslips`); queryClient.invalidateQueries({ queryKey: ['payroll'] }); setOpenRun(res.data.data.id) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  if (openRun) return <PayrollRunDetail runId={openRun} onBack={() => setOpenRun(null)} />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <p className="text-sm text-surface-600">{runs.length} payroll run(s)</p>
        <div className="flex items-center gap-2">
          <div className="card !px-3 !py-1.5 flex items-center gap-2 shadow-xs"><Wallet className="w-4 h-4 text-surface-400" /><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="text-sm outline-none bg-transparent" /></div>
          <button onClick={() => generate.mutate()} disabled={generate.isPending} className="btn-primary"><Plus className="w-4 h-4" /> {generate.isPending ? 'Generating...' : 'Generate Payroll'}</button>
        </div>
      </div>

      <SectionCard flush>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50/60 text-[10px] uppercase tracking-[0.1em] text-surface-500">
              <th className="text-left px-4 py-2.5">Period</th>
              <th className="text-center px-4 py-2.5">Payslips</th>
              <th className="text-center px-4 py-2.5">Paid</th>
              <th className="text-right px-4 py-2.5">Net Payable</th>
              <th className="text-center px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {runs.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={Wallet} title="No payroll yet" description="Generate payroll for a month — it uses salary + attendance to compute each payslip." /></td></tr>
            ) : runs.map((r) => (
              <tr key={r.id} className="hover:bg-surface-50/60">
                <td className="px-4 py-2.5 font-mono font-medium">{r.period}</td>
                <td className="px-4 py-2.5 text-center">{r.payslipCount}</td>
                <td className="px-4 py-2.5 text-center">{r.paidCount}/{r.payslipCount}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(r.totalNet)}</td>
                <td className="px-4 py-2.5 text-center"><span className={r.status === 'PAID' ? 'badge-success' : r.status === 'FINALIZED' ? 'badge-info' : 'badge-neutral'}>{r.status}</span></td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => setOpenRun(r.id)} className="text-xs text-brand-600 hover:underline">Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}

function PayrollRunDetail({ runId, onBack }: { runId: string; onBack: () => void }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['payroll-run', runId], queryFn: () => api.get(`/hr/payroll/${runId}`).then((r) => r.data) })
  const run = data?.data

  const pay = useMutation({
    mutationFn: (slipId: string) => api.post(`/hr/payroll/payslip/${slipId}/pay`, { method: 'NEFT' }),
    onSuccess: () => { toast.success('Marked paid · logged as salary expense'); queryClient.invalidateQueries({ queryKey: ['payroll-run', runId] }); queryClient.invalidateQueries({ queryKey: ['payroll'] }) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const adjust = useMutation({
    mutationFn: (v: { id: string; bonus?: number; deductions?: number }) => api.patch(`/hr/payroll/payslip/${v.id}`, v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-run', runId] }),
    onError: () => toast.error('Failed'),
  })

  if (!run) return <div className="card p-12 text-center text-surface-400">Loading...</div>

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-900">← Back to payroll runs</button>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard icon={Wallet} tone="brand" label="Period" value={run.period} sub={`${run.payslips.length} employees`} />
        <MetricCard icon={IndianRupee} tone="neutral" label="Gross" value={formatCurrency(run.totalGross)} />
        <MetricCard icon={IndianRupee} tone="warning" label="Deductions" value={formatCurrency(run.totalDeductions)} />
        <MetricCard icon={IndianRupee} tone="success" label="Net Payable" value={formatCurrency(run.totalNet)} />
      </div>

      <SectionCard flush title={`Payslips · ${run.period}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50/60 text-[10px] uppercase tracking-[0.1em] text-surface-500">
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-center px-4 py-2.5">Days (P / LOP)</th>
                <th className="text-right px-4 py-2.5">Earned</th>
                <th className="text-right px-4 py-2.5">Bonus</th>
                <th className="text-right px-4 py-2.5">Deduct</th>
                <th className="text-right px-4 py-2.5">Net Pay</th>
                <th className="text-center px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {run.payslips.map((p: any) => (
                <tr key={p.id} className="hover:bg-surface-50/60">
                  <td className="px-4 py-2.5 font-medium">{p.employeeName}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{p.presentDays} / {p.lopDays}</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(p.earnedSalary)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <input type="number" defaultValue={p.bonus} disabled={p.status === 'PAID'}
                      onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== p.bonus) adjust.mutate({ id: p.id, bonus: v }) }}
                      className="w-20 text-right border border-surface-200 rounded px-2 py-1 text-xs disabled:bg-surface-50" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input type="number" defaultValue={p.deductions} disabled={p.status === 'PAID'}
                      onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== p.deductions) adjust.mutate({ id: p.id, deductions: v }) }}
                      className="w-20 text-right border border-surface-200 rounded px-2 py-1 text-xs disabled:bg-surface-50" />
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(p.netPay)}</td>
                  <td className="px-4 py-2.5 text-center">{p.status === 'PAID' ? <span className="badge-success">Paid</span> : <span className="badge-warning">Pending</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    {p.status !== 'PAID' && <button onClick={() => pay.mutate(p.id)} disabled={pay.isPending} className="btn-primary !py-1 !px-2.5 text-xs"><Check className="w-3.5 h-3.5" /> Pay</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <p className="text-xs text-surface-400">Adjust bonus/deduction inline (tab out to save). Paying a payslip auto-records it as a &ldquo;Salaries&rdquo; expense in Accounts.</p>
    </div>
  )
}

// ── Performance ───────────────────────────────────────────────────────────────

function PerformanceTab() {
  const [period, setPeriod] = useState(thisMonth())
  const { data, isLoading } = useQuery({
    queryKey: ['performance', period],
    queryFn: () => api.get('/hr/performance', { params: { period } }).then((r) => r.data),
  })
  const rows: any[] = data?.data?.employees ?? []

  return (
    <div className="space-y-4">
      <div className="card !px-3 !py-1.5 flex items-center gap-2 shadow-xs w-fit">
        <TrendingUp className="w-4 h-4 text-surface-400" />
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="text-sm outline-none bg-transparent" />
      </div>

      <SectionCard flush title="Staff Performance" description="Attendance rate + sales attributed to each staff member (requires login link for sales)">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50/60 text-[10px] uppercase tracking-[0.1em] text-surface-500">
              <th className="text-left px-4 py-2.5">Employee</th>
              <th className="text-center px-4 py-2.5">Days Marked</th>
              <th className="text-left px-4 py-2.5">Attendance</th>
              <th className="text-right px-4 py-2.5">Sales Value</th>
              <th className="text-center px-4 py-2.5">Sales Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {isLoading ? <SkeletonRow columns={5} rows={5} /> : rows.length === 0 ? (
              <tr><td colSpan={5}><EmptyState icon={TrendingUp} title="No data" description="Add employees and mark attendance to see performance." /></td></tr>
            ) : rows.map((e) => (
              <tr key={e.employeeId} className="hover:bg-surface-50/60">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-surface-500">{e.designation ?? '—'}{!e.linkedToLogin && <span className="text-warning-600"> · no login link</span>}</p>
                </td>
                <td className="px-4 py-2.5 text-center text-surface-600">{e.daysMarked}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 max-w-[120px] h-2 bg-surface-100 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', e.attendanceRate >= 90 ? 'bg-success-500' : e.attendanceRate >= 70 ? 'bg-warning-500' : 'bg-danger-500')} style={{ width: `${Math.min(100, e.attendanceRate)}%` }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums">{e.attendanceRate}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(e.salesValue)}</td>
                <td className="px-4 py-2.5 text-center text-surface-600">{e.salesCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <p className="text-xs text-surface-400">Sales attribution links a staff member to their login account. Set the user link on the employee (coming soon) — until then sales show against whoever rang the bill.</p>
    </div>
  )
}
