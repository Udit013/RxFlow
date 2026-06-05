'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Wallet, Plus, X, Trash2, TrendingUp, TrendingDown, ArrowDownCircle, ArrowUpCircle,
  PieChart as PieIcon, Calendar,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { AnimatedSection, PageHeader, MetricCard, SectionCard, EmptyState, SkeletonRow } from '@/components/ui'

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const PIE_COLORS = ['#0c83d0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

export default function AccountsPage() {
  const [tab, setTab] = useState<'pnl' | 'expenses' | 'cashflow'>('pnl')
  const [period, setPeriod] = useState(thisMonth())

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Wallet}
          eyebrow="Finance"
          title="Accounts"
          description="Profit & loss, expense tracking, cash flow"
          actions={
            <div className="flex items-center gap-2 bg-white border border-surface-200 rounded-lg px-3 py-1.5 shadow-xs">
              <Calendar className="w-4 h-4 text-surface-400" />
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="text-sm outline-none bg-transparent" />
            </div>
          }
        />
      </AnimatedSection>

      <AnimatedSection>
        <div className="flex items-center gap-1 bg-white border border-surface-200/70 rounded-xl p-1 w-fit shadow-xs">
          {([['pnl', 'Profit & Loss'], ['expenses', 'Expenses & Income'], ['cashflow', 'Cash Flow']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                tab === k ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-600 hover:bg-surface-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </AnimatedSection>

      <AnimatedSection key={tab}>
        {tab === 'pnl' && <ProfitLossTab period={period} />}
        {tab === 'expenses' && <ExpensesTab period={period} />}
        {tab === 'cashflow' && <CashFlowTab period={period} />}
      </AnimatedSection>
    </div>
  )
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────

function ProfitLossTab({ period }: { period: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounts-pnl', period],
    queryFn: () => api.get('/accounts/profit-loss', { params: { period } }).then((r) => r.data),
  })
  const d = data?.data

  if (isLoading) return <div className="card p-12 text-center text-surface-400">Loading...</div>
  if (!d) return null

  const profitTone = d.netProfit >= 0 ? 'success' : 'danger'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={TrendingUp} tone="brand" label="Net Revenue" value={formatCurrency(d.revenue.net)} sub={`${d.revenue.invoiceCount} invoices · ${formatCurrency(d.revenue.returns)} returns`} />
        <MetricCard icon={TrendingDown} tone="warning" label="COGS" value={formatCurrency(d.cogs)} sub={`Gross margin ${d.grossMargin.toFixed(1)}%`} />
        <MetricCard icon={ArrowUpCircle} tone="neutral" label="Operating Expenses" value={formatCurrency(d.operatingExpenses)} sub={`+ ${formatCurrency(d.otherIncome)} other income`} />
        <MetricCard icon={Wallet} tone={profitTone} label="Net Profit" value={formatCurrency(d.netProfit)} sub={`${d.netMargin.toFixed(1)}% net margin`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Waterfall-style statement */}
        <SectionCard title="Statement" className="lg:col-span-2">
          <div className="divide-y divide-surface-100 text-sm">
            <StatementRow label="Gross Revenue" value={d.revenue.gross} />
            <StatementRow label="Less: Returns" value={-d.revenue.returns} muted />
            <StatementRow label="Net Revenue" value={d.revenue.net} bold />
            <StatementRow label="Less: Cost of Goods Sold" value={-d.cogs} muted />
            <StatementRow label="Gross Profit" value={d.grossProfit} bold accent={d.grossProfit >= 0 ? 'green' : 'red'} />
            <StatementRow label="Less: Operating Expenses" value={-d.operatingExpenses} muted />
            <StatementRow label="Add: Other Income" value={d.otherIncome} muted />
            <StatementRow label="Net Profit" value={d.netProfit} bold large accent={d.netProfit >= 0 ? 'green' : 'red'} />
          </div>
          <p className="text-[11px] text-surface-400 mt-3">
            COGS is approximated from batch purchase prices on sold lines. GST collected this period: {formatCurrency(d.tax.collected)}.
          </p>
        </SectionCard>

        {/* Expense breakdown pie */}
        <SectionCard title="Expense Breakdown" icon={PieIcon}>
          {d.expenseByCategory.length === 0 ? (
            <EmptyState icon={PieIcon} size="compact" title="No expenses" description="Record expenses to see the breakdown." />
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.expenseByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {d.expenseByCategory.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1 mt-2">
                {d.expenseByCategory.slice(0, 6).map((c: any, i: number) => (
                  <li key={c.category} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {c.category}
                    </span>
                    <span className="font-medium">{formatCurrency(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function StatementRow({ label, value, bold, muted, large, accent }: {
  label: string; value: number; bold?: boolean; muted?: boolean; large?: boolean; accent?: 'green' | 'red'
}) {
  return (
    <div className={cn('flex items-center justify-between py-2.5', large && 'py-3.5')}>
      <span className={cn(muted ? 'text-surface-500' : 'text-surface-800', bold && 'font-semibold')}>{label}</span>
      <span className={cn(
        'tabular-nums',
        bold && 'font-bold', large && 'text-lg',
        accent === 'green' ? 'text-success-700' : accent === 'red' ? 'text-danger-700' : muted ? 'text-surface-500' : 'text-surface-900'
      )}>
        {value < 0 ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}
      </span>
    </div>
  )
}

// ── Expenses & Income ─────────────────────────────────────────────────────────

function ExpensesTab({ period }: { period: string }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { from, to } = (() => {
    const [y, m] = period.split('-').map(Number)
    return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString() }
  })()

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', period],
    queryFn: () => api.get('/accounts/expenses', { params: { from, to, limit: 100 } }).then((r) => r.data),
  })
  const rows: any[] = data?.data ?? []
  const totalOut = rows.filter((r) => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0)
  const totalIn = rows.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.amount, 0)

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/expenses/${id}`),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['expenses'] }) },
    onError: () => toast.error('Failed'),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard icon={ArrowUpCircle} tone="danger" label="Expenses (period)" value={formatCurrency(totalOut)} sub={`${rows.filter(r => r.direction === 'OUT').length} entries`} />
        <MetricCard icon={ArrowDownCircle} tone="success" label="Other Income (period)" value={formatCurrency(totalIn)} sub={`${rows.filter(r => r.direction === 'IN').length} entries`} />
      </div>

      <SectionCard
        title="Transactions"
        action={<button onClick={() => setShowAdd(true)} className="btn-primary !py-1.5 !px-3 text-xs"><Plus className="w-3.5 h-3.5" /> Add</button>}
        flush
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50/60 text-[10px] uppercase tracking-[0.1em] text-surface-500">
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-4 py-2.5">Category</th>
              <th className="text-left px-4 py-2.5">Paid To / Ref</th>
              <th className="text-left px-4 py-2.5">Method</th>
              <th className="text-right px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {isLoading ? (
              <SkeletonRow columns={6} rows={5} />
            ) : rows.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={Wallet} title="No transactions" description="Record your first expense or income entry." action={<button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Entry</button>} /></td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-50/60">
                  <td className="px-4 py-2.5 text-surface-600 text-xs">{formatDate(r.incurredAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('chip', r.direction === 'IN' ? '!bg-success-50 !text-success-700 !border-success-200' : '')}>
                      {r.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-surface-600">{r.paidTo ?? r.reference ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-surface-500">{r.paymentMethod}</td>
                  <td className={cn('px-4 py-2.5 text-right font-medium tabular-nums', r.direction === 'IN' ? 'text-success-700' : 'text-surface-900')}>
                    {r.direction === 'IN' ? '+' : '−'}{formatCurrency(r.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => window.confirm('Delete this entry?') && del.mutate(r.id)} className="text-surface-400 hover:text-danger-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>

      {showAdd && <AddExpenseModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); queryClient.invalidateQueries({ queryKey: ['expenses'] }) }} />}
    </div>
  )
}

interface ExpenseForm {
  direction: 'IN' | 'OUT'
  category: string
  amount: number
  paymentMethod: string
  paidTo?: string
  reference?: string
  notes?: string
  incurredAt: string
}

function AddExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: catData } = useQuery({ queryKey: ['account-categories'], queryFn: () => api.get('/accounts/categories').then((r) => r.data) })
  const { register, handleSubmit, watch, formState: { errors } } = useForm<ExpenseForm>({
    defaultValues: { direction: 'OUT', paymentMethod: 'CASH', incurredAt: new Date().toISOString().slice(0, 10) },
  })
  const direction = watch('direction')
  const categories = direction === 'IN' ? (catData?.data?.income ?? []) : (catData?.data?.expense ?? [])

  const mutation = useMutation({
    mutationFn: (d: ExpenseForm) => api.post('/accounts/expenses', {
      ...d, amount: Number(d.amount), incurredAt: new Date(d.incurredAt).toISOString(),
    }),
    onSuccess: () => { toast.success('Saved'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">Record Transaction</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={cn('flex items-center justify-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm font-medium', direction === 'OUT' ? 'border-danger-500 bg-danger-50 text-danger-700' : 'border-surface-200')}>
              <input type="radio" value="OUT" {...register('direction')} className="sr-only" /> <ArrowUpCircle className="w-4 h-4" /> Expense
            </label>
            <label className={cn('flex items-center justify-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm font-medium', direction === 'IN' ? 'border-success-500 bg-success-50 text-success-700' : 'border-surface-200')}>
              <input type="radio" value="IN" {...register('direction')} className="sr-only" /> <ArrowDownCircle className="w-4 h-4" /> Income
            </label>
          </div>
          <div>
            <label className="label">Category *</label>
            <input className="input" list="cat-list" {...register('category', { required: true })} placeholder="Select or type..." />
            <datalist id="cat-list">{categories.map((c: string) => <option key={c} value={c} />)}</datalist>
            {errors.category && <p className="text-xs text-danger-600 mt-1">Required</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (₹) *</label>
              <input type="number" step="0.01" className="input" {...register('amount', { required: true, valueAsNumber: true, min: 0.01 })} />
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" {...register('incurredAt', { required: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Method</label>
              <select className="input" {...register('paymentMethod')}>
                {['CASH', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'CARD'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{direction === 'IN' ? 'Received From' : 'Paid To'}</label>
              <input className="input" {...register('paidTo')} />
            </div>
          </div>
          <div>
            <label className="label">Reference / Notes</label>
            <input className="input" {...register('reference')} placeholder="Bill no., remark..." />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────

function CashFlowTab({ period }: { period: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounts-cashflow', period],
    queryFn: () => api.get('/accounts/cash-flow', { params: { period } }).then((r) => r.data),
  })
  const d = data?.data
  if (isLoading) return <div className="card p-12 text-center text-surface-400">Loading...</div>
  if (!d) return null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard icon={ArrowDownCircle} tone="success" label="Cash In" value={formatCurrency(d.cashIn)} sub="Receipts + other income" />
        <MetricCard icon={ArrowUpCircle} tone="danger" label="Cash Out" value={formatCurrency(d.cashOut)} sub="Supplier payments + expenses" />
        <MetricCard icon={Wallet} tone={d.netCashFlow >= 0 ? 'success' : 'danger'} label="Net Cash Flow" value={formatCurrency(d.netCashFlow)} sub={d.netCashFlow >= 0 ? 'Positive' : 'Negative — watch liquidity'} />
      </div>

      <SectionCard title="By Payment Method" flush>
        {d.byMethod.length === 0 ? (
          <EmptyState icon={Wallet} title="No cash movement" description="Payments and expenses in this period will show here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50/60 text-[10px] uppercase tracking-[0.1em] text-surface-500">
                <th className="text-left px-4 py-2.5">Method</th>
                <th className="text-right px-4 py-2.5">In</th>
                <th className="text-right px-4 py-2.5">Out</th>
                <th className="text-right px-4 py-2.5">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {d.byMethod.map((m: any) => (
                <tr key={m.method}>
                  <td className="px-4 py-2.5 font-medium">{m.method}</td>
                  <td className="px-4 py-2.5 text-right text-success-700 tabular-nums">{formatCurrency(m.in)}</td>
                  <td className="px-4 py-2.5 text-right text-danger-700 tabular-nums">{formatCurrency(m.out)}</td>
                  <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums', (m.in - m.out) >= 0 ? 'text-success-700' : 'text-danger-700')}>{formatCurrency(m.in - m.out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}
