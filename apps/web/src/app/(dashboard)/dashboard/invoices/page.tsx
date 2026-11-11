'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Download, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService, buildTenantHeader } from '@/lib/auth'
import { downloadInvoicePdf } from '@/lib/pdf-invoice'
import { debounce, formatCurrency, formatDate } from '@/lib/utils'

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
      await downloadInvoicePdf({
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
          taxBreakdown: it.taxBreakdown,
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
          <h1 className="page-title">Invoices</h1>
          <p className="text-[13px] leading-5 text-surface-500 mt-1">{data?.meta?.total ?? 0} invoices</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="segmented self-start">
          {['', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].map((s) => (
            <button key={s || 'all'} type="button" aria-pressed={paymentStatus === s} onClick={() => setPaymentStatus(s)} className="segment">
              {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
            </button>
          ))}
        </div>
        <div className="search-field sm:ml-auto sm:w-72">
          <Search />
          <input
            type="search"
            aria-label="Find invoices"
            className="input pr-8"
            placeholder="Find by invoice #, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1.5 p-1 rounded text-surface-400 hover:text-surface-700"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Invoice #</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Type</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Date</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Order</th>
              <th className="text-right px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Tax</th>
              <th className="text-right px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Total</th>
              <th className="text-center px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Status</th>
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
                  <Receipt className="w-5 h-5 mx-auto mb-3 text-surface-400" strokeWidth={1.75} aria-hidden="true" />
                  No invoices yet
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2">
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
                      <Link href={`/dashboard/orders/${inv.orderId}`} className="text-xs text-brand-700 hover:text-brand-800 hover:underline underline-offset-2">View order</Link>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(inv.totalTax ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(inv.grandTotal ?? inv.total ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={STATUS_STYLES[inv.paymentStatus] ?? 'badge-neutral'}>{inv.paymentStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => downloadPdf(inv.id)} className="btn-secondary py-1! px-2! text-xs">
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
