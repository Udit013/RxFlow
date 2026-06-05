'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Download, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService, buildTenantHeader } from '@/lib/auth'
import { downloadInvoicePdf } from '@/lib/pdf-invoice'
import { cn, debounce, formatCurrency, formatDate } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'badge-warning',
  PARTIAL: 'badge-warning',
  PAID: 'badge-success',
  OVERDUE: 'badge-danger',
  REFUNDED: 'badge-neutral',
  WAIVED: 'badge-neutral',
}

export default function InvoicesPage() {
  const [paymentStatus, setPaymentStatus] = useState<string>('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const fn = debounce((v: string) => setDebouncedSearch(v), 250)
    fn(search)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', paymentStatus, debouncedSearch],
    queryFn: () =>
      api.get('/invoices', {
        params: {
          paymentStatus: paymentStatus || undefined,
          search: debouncedSearch || undefined,
          limit: 50,
        },
      }).then((r) => r.data),
  })

  const invoices: any[] = data?.data ?? []

  const downloadPdf = async (invoiceId: string) => {
    try {
      const res = await api.get(`/invoices/${invoiceId}`)
      const full = res.data.data
      const user = authService.getStoredUser()
      if (!user) { toast.error('Not authenticated'); return }
      const tenantHeader = buildTenantHeader(user.tenant)
      downloadInvoicePdf({
        ...full,
        items: (full.items ?? []).map((it: any) => ({
          medicineName: it.medicineName,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate,
          hsn: it.hsn,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          cgstRate: it.cgstRate,
          cgstAmount: it.cgstAmount,
          sgstRate: it.sgstRate,
          sgstAmount: it.sgstAmount,
          igstRate: it.igstRate,
          igstAmount: it.igstAmount,
          total: it.total,
        })),
        totalTax: full.totalTax ?? 0,
      }, tenantHeader)
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Receipt className="w-5 h-5" /> Invoices</h1>
          <p className="text-sm text-slate-500">{data?.meta?.total ?? 0} invoices</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {['', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setPaymentStatus(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              paymentStatus === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {s || 'All'}
          </button>
        ))}
        <div className="card !p-2 ml-auto flex items-center gap-2 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            className="flex-1 text-sm outline-none"
            placeholder="Find by invoice #, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Order</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tax</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No invoices yet
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-brand-600 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {inv.type === 'CREDIT_NOTE' ? <span className="badge-warning">CN</span> :
                     inv.type === 'PURCHASE' ? <span className="badge-neutral">PUR</span> :
                     <span className="badge-info">SALE</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3">
                    {inv.orderId ? (
                      <Link href={`/dashboard/orders/${inv.orderId}`} className="text-xs text-brand-600 hover:underline">View order</Link>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(inv.totalTax ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(inv.grandTotal ?? inv.total ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={STATUS_STYLES[inv.paymentStatus] ?? 'badge-neutral'}>{inv.paymentStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => downloadPdf(inv.id)} className="btn-secondary !py-1 !px-2 text-xs">
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
