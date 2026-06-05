'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, FileText, Receipt, Download, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService, buildTenantHeader } from '@/lib/auth'
import { downloadInvoicePdf, buildWhatsAppInvoiceMessage, openWhatsAppInvoice } from '@/lib/pdf-invoice'
import { formatCurrency, formatDate } from '@/lib/utils'

const STATUS_FLOW = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Status updated')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const invoiceMutation = useMutation({
    mutationFn: () => api.post(`/invoices/from-order/${id}`, {}),
    onSuccess: (res) => {
      toast.success(`Invoice ${res.data.data.invoiceNumber} created`)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>
  if (!data?.data) return <div className="p-8 text-slate-400">Order not found</div>

  const o = data.data
  const hasInvoice = (o.invoices?.length ?? 0) > 0

  return (
    <div className="space-y-5">
      <Link href="/dashboard/orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{o.orderNumber}</h1>
              <span className={o.type === 'SALE' ? 'badge-info' : 'badge-neutral'}>{o.type}</span>
              <span className="badge-info">{o.status}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">Created {formatDate(o.createdAt)} • {o.items.length} items</p>
            <p className="text-sm text-slate-600 mt-2">
              {o.type === 'SALE'
                ? (o.customer ? <>Customer: <Link href={`/dashboard/customers/${o.customer.id}`} className="text-brand-600 hover:underline">{o.customer.name}</Link></> : 'Walk-in customer')
                : (o.supplier ? <>Supplier: <Link href={`/dashboard/suppliers/${o.supplier.id}`} className="text-brand-600 hover:underline">{o.supplier.name}</Link></> : '—')}
            </p>
            {o.salesRep && (
              <p className="text-sm text-slate-600 mt-1">
                Sales rep: <Link href={`/dashboard/sales-reps/${o.salesRep.id}`} className="text-brand-600 hover:underline">{o.salesRep.name}</Link>
                {o.commissionAmount != null && (
                  <> · Commission: <strong>{formatCurrency(o.commissionAmount)}</strong> ({o.commissionPercent}%) · <span className={o.commissionStatus === 'PAID' ? 'text-green-600' : 'text-amber-600'}>{o.commissionStatus}</span></>
                )}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(o.total)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-5 border-t">
          <span className="text-xs text-slate-500 mr-2">Update status:</span>
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              disabled={o.status === s || statusMutation.isPending}
              onClick={() => statusMutation.mutate(s)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                o.status === s ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 hover:bg-slate-50'
              } disabled:opacity-50`}
            >
              {s}
            </button>
          ))}
          {!hasInvoice && o.type === 'SALE' && (
            <button onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending} className="btn-primary ml-auto">
              <FileText className="w-4 h-4" />
              Generate Invoice
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header"><h3 className="font-semibold text-slate-900">Line items</h3></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">Medicine</th>
              <th className="text-center px-4 py-2">Qty</th>
              <th className="text-right px-4 py-2">Unit Price</th>
              <th className="text-right px-4 py-2">Discount</th>
              <th className="text-right px-4 py-2">Tax</th>
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {o.items.map((it: any) => (
              <tr key={it.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{it.medicine.name}</p>
                  <p className="text-xs text-slate-500">{it.medicine.strength} • {it.medicine.dosageForm}</p>
                </td>
                <td className="px-4 py-3 text-center">{it.quantity}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(it.unitPrice)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{it.discountPercent}%</td>
                <td className="px-4 py-3 text-right text-slate-600">{it.taxRate}% ({formatCurrency(it.taxAmount)})</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 text-sm">
            <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-600">Subtotal</td><td className="px-4 py-2 text-right font-medium">{formatCurrency(o.subtotal)}</td></tr>
            <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-600">Discount</td><td className="px-4 py-2 text-right font-medium">-{formatCurrency(o.discountAmount)}</td></tr>
            <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-600">Tax</td><td className="px-4 py-2 text-right font-medium">{formatCurrency(o.taxAmount)}</td></tr>
            <tr className="border-t border-slate-200"><td colSpan={5} className="px-4 py-2 text-right font-semibold text-slate-900">Total</td><td className="px-4 py-2 text-right font-bold text-slate-900">{formatCurrency(o.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      {hasInvoice && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3"><Receipt className="w-4 h-4 text-brand-600" /><h3 className="font-semibold">Invoices</h3></div>
          <div className="space-y-2">
            {o.invoices.map((inv: any) => (
              <InvoiceRow key={inv.id} invoice={inv} order={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceRow({ invoice, order }: { invoice: any; order: any }) {
  const downloadPdf = async () => {
    try {
      const res = await api.get(`/invoices/${invoice.id}`)
      const full = res.data.data
      const user = authService.getStoredUser()
      if (!user) { toast.error('Not authenticated'); return }
      const tenantHeader = buildTenantHeader(user.tenant)
      const data = {
        ...full,
        type: full.type,
        notes: full.notes,
        customer: order.customer,
        supplier: order.supplier,
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
      }
      downloadInvoicePdf(data, tenantHeader)
    } catch (e: any) {
      toast.error('Failed to generate PDF')
    }
  }

  const shareWhatsApp = async () => {
    try {
      const res = await api.get(`/invoices/${invoice.id}`)
      const full = res.data.data
      const user = authService.getStoredUser()
      if (!user) { toast.error('Not authenticated'); return }
      const tenantHeader = buildTenantHeader(user.tenant)
      const data = {
        ...full,
        customer: order.customer,
        supplier: order.supplier,
        items: (full.items ?? []).map((it: any) => ({
          medicineName: it.medicineName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
        })),
        totalTax: full.totalTax ?? 0,
      }
      const msg = buildWhatsAppInvoiceMessage(data, tenantHeader)
      const phone = order.customer?.phone ?? order.supplier?.phone
      openWhatsAppInvoice(phone, msg)
    } catch {
      toast.error('Failed to build WhatsApp message')
    }
  }

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
      <div>
        <Link href={`/dashboard/invoices/${invoice.id}`} className="font-medium text-brand-600 hover:underline">
          {invoice.invoiceNumber}
        </Link>
        <p className="text-xs text-slate-500">{formatDate(invoice.createdAt)} • {invoice.paymentStatus}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold mr-2">{formatCurrency(invoice.total ?? invoice.grandTotal ?? 0)}</span>
        <button onClick={downloadPdf} className="btn-secondary !py-1.5 !px-2.5 text-xs">
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
        <button onClick={shareWhatsApp} className="btn-secondary !py-1.5 !px-2.5 text-xs">
          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
        </button>
      </div>
    </div>
  )
}
