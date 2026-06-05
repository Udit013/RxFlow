'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Download, MessageCircle, X, Wallet, Receipt as ReceiptIcon, Printer, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService, buildTenantHeader } from '@/lib/auth'
import { downloadInvoicePdf, buildWhatsAppInvoiceMessage, openWhatsAppInvoice } from '@/lib/pdf-invoice'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

interface PaymentForm {
  amount: number
  method: 'CASH' | 'UPI' | 'NEFT' | 'RTGS' | 'CHEQUE' | 'CREDIT' | 'CARD'
  reference?: string
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'badge-warning',
  PARTIAL: 'badge-warning',
  PAID: 'badge-success',
  OVERDUE: 'badge-danger',
  REFUNDED: 'badge-neutral',
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const queryClient = useQueryClient()
  const [showPayment, setShowPayment] = useState(false)
  const [showCreditNote, setShowCreditNote] = useState(false)
  const [showPurchaseReturn, setShowPurchaseReturn] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: creditNotesData } = useQuery({
    queryKey: ['invoice-credit-notes', id],
    queryFn: () => api.get(`/invoices/${id}/credit-notes`).then((r) => r.data),
    enabled: !!id && data?.data?.type === 'SALE',
  })

  const { data: purchaseReturnsData } = useQuery({
    queryKey: ['invoice-purchase-returns', id],
    queryFn: () => api.get(`/invoices/${id}/purchase-returns`).then((r) => r.data),
    enabled: !!id && data?.data?.type === 'PURCHASE',
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>
  if (!data?.data) return <div className="p-8 text-slate-400">Invoice not found</div>

  const inv = data.data
  const payments = inv.payments ?? []
  const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
  const balance = (inv.grandTotal ?? inv.total ?? 0) - totalPaid

  const tenantHeader = (() => {
    const u = authService.getStoredUser()
    return u ? buildTenantHeader(u.tenant) : null
  })()

  // Fetch original invoice number when this is a CN
  const { data: originalInvoiceData } = useQuery({
    queryKey: ['original-invoice', inv?.originalInvoiceId],
    queryFn: () => api.get(`/invoices/${inv.originalInvoiceId}`).then((r) => r.data),
    enabled: !!inv?.originalInvoiceId,
  })
  const originalInvoiceNumber = originalInvoiceData?.data?.invoiceNumber

  const downloadPdf = () => {
    if (!tenantHeader) return
    downloadInvoicePdf({
      ...inv,
      type: inv.type,
      notes: inv.notes,
      originalInvoiceNumber,
      items: (inv.items ?? []).map((it: any) => ({
        medicineName: it.medicineName, batchNumber: it.batchNumber, expiryDate: it.expiryDate,
        hsn: it.hsn, quantity: it.quantity, unitPrice: it.unitPrice,
        cgstRate: it.cgstRate, cgstAmount: it.cgstAmount,
        sgstRate: it.sgstRate, sgstAmount: it.sgstAmount,
        igstRate: it.igstRate, igstAmount: it.igstAmount,
        total: it.total,
      })),
      totalTax: inv.totalTax ?? 0,
    }, tenantHeader)
  }

  const shareWhatsApp = () => {
    if (!tenantHeader) return
    const msg = buildWhatsAppInvoiceMessage({
      ...inv,
      type: inv.type,
      notes: inv.notes,
      originalInvoiceNumber,
      items: inv.items?.map((it: any) => ({ medicineName: it.medicineName, quantity: it.quantity, unitPrice: it.unitPrice, total: it.total })) ?? [],
      totalTax: inv.totalTax ?? 0,
    }, tenantHeader)
    openWhatsAppInvoice(inv.customer?.phone ?? inv.supplier?.phone, msg)
  }

  return (
    <div className="space-y-5">
      <Link href="/dashboard/invoices" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to invoices
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{inv.invoiceNumber}</h1>
              <span className={STATUS_STYLES[inv.paymentStatus] ?? 'badge-neutral'}>{inv.paymentStatus}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">Issued {formatDate(inv.createdAt)}</p>
            <p className="text-sm text-slate-600 mt-2">
              {inv.customer ? <>Customer: <Link href={`/dashboard/customers/${inv.customer.id}`} className="text-brand-600 hover:underline">{inv.customer.name}</Link></> :
               inv.supplier ? <>Supplier: <Link href={`/dashboard/suppliers/${inv.supplier.id}`} className="text-brand-600 hover:underline">{inv.supplier.name}</Link></> : 'No party'}
            </p>
            {inv.orderId && (
              <p className="text-sm text-slate-500 mt-1">
                Linked to <Link href={`/dashboard/orders/${inv.orderId}`} className="text-brand-600 hover:underline">order</Link>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Grand Total</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(inv.grandTotal ?? inv.total ?? 0)}</p>
            <p className={cn('text-xs mt-1', balance > 0 ? 'text-amber-600 font-medium' : 'text-green-600')}>
              {balance > 0 ? `${formatCurrency(balance)} due` : 'Fully paid'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-5 border-t flex-wrap">
          <button onClick={downloadPdf} className="btn-secondary"><Download className="w-4 h-4" /> A4 PDF</button>
          <button onClick={() => window.open(`/print/invoice/${inv.id}`, '_blank')} className="btn-secondary">
            <Printer className="w-4 h-4" /> Thermal Receipt
          </button>
          <button onClick={shareWhatsApp} className="btn-secondary"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
          {inv.type === 'SALE' && (
            <button onClick={() => setShowCreditNote(true)} className="btn-secondary">
              <RotateCcw className="w-4 h-4" /> Credit Note / Return
            </button>
          )}
          {inv.type === 'PURCHASE' && (
            <button onClick={() => setShowPurchaseReturn(true)} className="btn-secondary">
              <RotateCcw className="w-4 h-4" /> Return to Supplier
            </button>
          )}
          {balance > 0 && (
            <button onClick={() => setShowPayment(true)} className="btn-primary ml-auto">
              <Wallet className="w-4 h-4" /> Record Payment
            </button>
          )}
        </div>

        {inv.originalInvoiceId && inv.type === 'CREDIT_NOTE' && (
          <div className="mt-4 pt-4 border-t bg-amber-50 rounded-lg p-3 -mx-2">
            <p className="text-sm">
              <strong>Credit note</strong> against original invoice.{' '}
              <Link href={`/dashboard/invoices/${inv.originalInvoiceId}`} className="text-brand-600 hover:underline">View original →</Link>
            </p>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="card-header"><h3 className="font-semibold text-slate-900">Line items</h3></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Batch</th>
              <th className="text-left px-3 py-2">Exp</th>
              <th className="text-center px-3 py-2">Qty</th>
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">CGST</th>
              <th className="text-right px-3 py-2">SGST</th>
              <th className="text-right px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(inv.items ?? []).map((it: any) => (
              <tr key={it.id}>
                <td className="px-3 py-2 font-medium">{it.medicineName}</td>
                <td className="px-3 py-2 text-slate-600 text-xs">{it.batchNumber}</td>
                <td className="px-3 py-2 text-slate-600 text-xs">{formatDate(it.expiryDate, 'MM/YY')}</td>
                <td className="px-3 py-2 text-center">{it.quantity}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(it.unitPrice)}</td>
                <td className="px-3 py-2 text-right text-xs">{formatCurrency(it.cgstAmount ?? 0)}</td>
                <td className="px-3 py-2 text-right text-xs">{formatCurrency(it.sgstAmount ?? 0)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr><td colSpan={7} className="px-3 py-2 text-right text-slate-600">Subtotal</td><td className="px-3 py-2 text-right">{formatCurrency(inv.subtotal)}</td></tr>
            {inv.discountAmount > 0 && <tr><td colSpan={7} className="px-3 py-2 text-right text-slate-600">Discount</td><td className="px-3 py-2 text-right">-{formatCurrency(inv.discountAmount)}</td></tr>}
            <tr><td colSpan={7} className="px-3 py-2 text-right text-slate-600">CGST</td><td className="px-3 py-2 text-right">{formatCurrency(inv.cgst)}</td></tr>
            <tr><td colSpan={7} className="px-3 py-2 text-right text-slate-600">SGST</td><td className="px-3 py-2 text-right">{formatCurrency(inv.sgst)}</td></tr>
            {inv.igst > 0 && <tr><td colSpan={7} className="px-3 py-2 text-right text-slate-600">IGST</td><td className="px-3 py-2 text-right">{formatCurrency(inv.igst)}</td></tr>}
            <tr className="border-t"><td colSpan={7} className="px-3 py-2 text-right font-bold">Grand Total</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(inv.grandTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ReceiptIcon className="w-4 h-4" /> Payments</h3>
          <div className="text-sm">
            <span className="text-slate-500">Paid: </span>
            <span className="font-semibold">{formatCurrency(totalPaid)}</span>
            <span className="text-slate-400 mx-2">/</span>
            <span className="text-slate-500">Balance: </span>
            <span className={cn('font-semibold', balance > 0 ? 'text-amber-600' : 'text-green-600')}>{formatCurrency(balance)}</span>
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No payments recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Method</th>
                <th className="text-left px-3 py-2">Reference</th>
                <th className="text-right px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-slate-600">{formatDate(p.createdAt)}</td>
                  <td className="px-3 py-2"><span className="badge-info">{p.method}</span></td>
                  <td className="px-3 py-2 text-slate-600 font-mono text-xs">{p.reference ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-600">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creditNotesData?.data?.length ?? 0) > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-600" /> Credit Notes Issued</h3>
            <span className="text-xs text-slate-500">{creditNotesData.data.length} note(s)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {creditNotesData.data.map((cn: any) => (
              <div key={cn.id} className="p-4 flex items-center justify-between">
                <div>
                  <Link href={`/dashboard/invoices/${cn.id}`} className="font-medium text-brand-600 hover:underline">
                    {cn.invoiceNumber}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatDate(cn.createdAt)} · {cn.items?.length ?? 0} items · {cn.notes ?? 'No reason'}
                  </p>
                </div>
                <span className="font-semibold text-amber-700">-{formatCurrency(cn.grandTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(purchaseReturnsData?.data?.length ?? 0) > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-600" /> Returns to Supplier</h3>
            <span className="text-xs text-slate-500">{purchaseReturnsData.data.length} return(s)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {purchaseReturnsData.data.map((dn: any) => (
              <div key={dn.id} className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium text-surface-900 font-mono">{dn.invoiceNumber}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(dn.createdAt)} · {dn.items?.length ?? 0} items · {dn.notes ?? 'No reason'}</p>
                </div>
                <span className="font-semibold text-amber-700">-{formatCurrency(dn.grandTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPayment && (
        <RecordPaymentModal
          invoiceId={inv.id}
          maxAmount={balance}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false)
            queryClient.invalidateQueries({ queryKey: ['invoice', id] })
          }}
        />
      )}

      {showPurchaseReturn && (
        <PurchaseReturnModal
          invoice={inv}
          onClose={() => setShowPurchaseReturn(false)}
          onCreated={() => {
            setShowPurchaseReturn(false)
            queryClient.invalidateQueries({ queryKey: ['invoice', id] })
            queryClient.invalidateQueries({ queryKey: ['invoice-purchase-returns', id] })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
          }}
        />
      )}

      {showCreditNote && (
        <CreditNoteModal
          invoice={inv}
          onClose={() => setShowCreditNote(false)}
          onCreated={() => {
            setShowCreditNote(false)
            queryClient.invalidateQueries({ queryKey: ['invoice', id] })
            queryClient.invalidateQueries({ queryKey: ['invoice-credit-notes', id] })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
          }}
        />
      )}
    </div>
  )
}

interface CreditNoteLine { invoiceItemId: string; quantity: number; restockBatchId?: string }

function CreditNoteModal({ invoice, onClose, onCreated }: { invoice: any; onClose: () => void; onCreated: () => void }) {
  const [reason, setReason] = useState('Customer return')
  const [lines, setLines] = useState<CreditNoteLine[]>(
    (invoice.items ?? []).map((it: any) => ({ invoiceItemId: it.id, quantity: 0 }))
  )

  // Fetch available batches (for restock target dropdowns)
  const { data: inventoryData } = useQuery({
    queryKey: ['cn-inventory', invoice.id],
    queryFn: () => api.get('/inventory', { params: { limit: 100 } }).then((r) => r.data),
  })
  const inventoryItems: any[] = inventoryData?.data ?? []

  const mutation = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/credit-note`, {
      reason,
      items: lines.filter((l) => l.quantity > 0),
    }),
    onSuccess: () => { toast.success('Credit note issued'); onCreated() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const totalReturning = lines.reduce((sum, l, i) => {
    const item = invoice.items[i]
    if (!item || l.quantity <= 0) return sum
    return sum + (item.total * (l.quantity / item.quantity))
  }, 0)

  const anyLines = lines.some((l) => l.quantity > 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-slate-900">Issue Credit Note</h2>
            <p className="text-xs text-slate-500">Against {invoice.invoiceNumber}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer return, damaged item, expired..." />
          </div>

          <div>
            <label className="label">Select items to return</label>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2">Sold</th>
                  <th className="text-center px-3 py-2">Return Qty</th>
                  <th className="text-left px-3 py-2">Restock to batch</th>
                  <th className="text-right px-3 py-2">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(invoice.items ?? []).map((it: any, idx: number) => {
                  const line = lines[idx]
                  const matchingInv = inventoryItems.find((inv) => inv.medicineId === it.medicineId)
                  const batches = matchingInv?.batches ?? []
                  const refund = line.quantity > 0 ? it.total * (line.quantity / it.quantity) : 0
                  return (
                    <tr key={it.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{it.medicineName}</p>
                        <p className="text-xs text-slate-500">Batch {it.batchNumber} · @{formatCurrency(it.unitPrice)}</p>
                      </td>
                      <td className="px-3 py-2 text-right">{it.quantity}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max={it.quantity}
                          className="w-16 text-center border border-slate-200 rounded px-2 py-1 text-sm"
                          value={line.quantity}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(it.quantity, parseInt(e.target.value) || 0))
                            setLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: v } : l))
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="text-xs border border-slate-200 rounded px-2 py-1 w-40"
                          value={line.restockBatchId ?? ''}
                          onChange={(e) => {
                            const v = e.target.value || undefined
                            setLines((p) => p.map((l, i) => i === idx ? { ...l, restockBatchId: v } : l))
                          }}
                          disabled={line.quantity === 0}
                        >
                          <option value="">— Don't restock —</option>
                          {batches.map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.batchNumber} (exp {formatDate(b.expiryDate, 'MM/YY')})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(refund)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold">Total refund</td>
                  <td className="px-3 py-2 text-right font-bold text-amber-700">{formatCurrency(totalReturning)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Restocking adds units back to the selected batch. Customer ledger is credited; outstanding balance reduces by the refund amount.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!anyLines || mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? 'Issuing...' : `Issue Credit Note (${formatCurrency(totalReturning)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PurchaseReturnModal({ invoice, onClose, onCreated }: { invoice: any; onClose: () => void; onCreated: () => void }) {
  const [reason, setReason] = useState('Return to supplier')
  const [lines, setLines] = useState<{ invoiceItemId: string; quantity: number }[]>(
    (invoice.items ?? []).map((it: any) => ({ invoiceItemId: it.id, quantity: 0 }))
  )

  const mutation = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/purchase-return`, {
      reason,
      items: lines.filter((l) => l.quantity > 0),
    }),
    onSuccess: () => { toast.success('Returned to supplier · stock & payable updated'); onCreated() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const totalReturning = lines.reduce((sum, l, i) => {
    const item = invoice.items[i]
    if (!item || l.quantity <= 0) return sum
    return sum + (item.total * (l.quantity / item.quantity))
  }, 0)
  const anyLines = lines.some((l) => l.quantity > 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-surface-900">Return to Supplier</h2>
            <p className="text-xs text-surface-500">Against {invoice.invoiceNumber} · {invoice.supplier?.name ?? invoice.supplier?.companyName ?? ''}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, near expiry, wrong item, excess..." />
          </div>

          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-surface-50">
              <tr className="text-xs uppercase text-surface-500">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Purchased</th>
                <th className="text-center px-3 py-2">Return Qty</th>
                <th className="text-right px-3 py-2">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(invoice.items ?? []).map((it: any, idx: number) => {
                const line = lines[idx]
                const value = line.quantity > 0 ? it.total * (line.quantity / it.quantity) : 0
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{it.medicineName}</p>
                      <p className="text-xs text-surface-500">Batch {it.batchNumber} · @{formatCurrency(it.unitPrice)}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{it.quantity}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number" min="0" max={it.quantity}
                        className="w-16 text-center border border-surface-200 rounded px-2 py-1 text-sm"
                        value={line.quantity}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(it.quantity, parseInt(e.target.value) || 0))
                          setLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: v } : l))
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-surface-700">{formatCurrency(value)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-surface-50">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total return value</td>
                <td className="px-3 py-2 text-right font-bold text-amber-700">{formatCurrency(totalReturning)}</td>
              </tr>
            </tfoot>
          </table>

          <p className="text-xs text-surface-500">
            Returned units are removed from your stock (the batch must still physically have them). Supplier payable and total purchases reduce by the return value. A DEBIT NOTE is created.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={() => mutation.mutate()} disabled={!anyLines || mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Processing...' : `Return to Supplier (${formatCurrency(totalReturning)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecordPaymentModal({
  invoiceId, maxAmount, onClose, onSaved,
}: { invoiceId: string; maxAmount: number; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<PaymentForm>({
    defaultValues: { amount: maxAmount, method: 'CASH' },
  })

  const mutation = useMutation({
    mutationFn: (data: PaymentForm) =>
      api.post(`/invoices/${invoiceId}/payment`, {
        amount: Number(data.amount),
        method: data.method,
        reference: data.reference || undefined,
      }),
    onSuccess: () => {
      toast.success('Payment recorded')
      onSaved()
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">Record Payment</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div>
            <label className="label">Amount * (balance due: {formatCurrency(maxAmount)})</label>
            <input
              type="number"
              step="0.01"
              className="input"
              {...register('amount', { required: true, valueAsNumber: true, min: 0.01, max: maxAmount })}
            />
            {errors.amount && <p className="text-xs text-red-600 mt-1">Required, must be ≤ balance</p>}
          </div>
          <div>
            <label className="label">Payment Method *</label>
            <select className="input" {...register('method', { required: true })}>
              {['CASH', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'CARD', 'CREDIT'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reference (UPI ID / cheque # / txn ID)</label>
            <input className="input" {...register('reference')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
