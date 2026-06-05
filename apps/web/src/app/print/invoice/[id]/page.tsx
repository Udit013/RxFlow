'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import './print.css'

export default function PrintInvoicePage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const { data, isLoading } = useQuery({
    queryKey: ['print-invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  // Auto-trigger print dialog once data loads
  useEffect(() => {
    if (data?.data && typeof window !== 'undefined') {
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
    return undefined
  }, [data])

  if (isLoading || !data?.data) {
    return <div className="p-4 text-center text-sm text-slate-500">Loading receipt...</div>
  }

  const inv = data.data
  const user = authService.getStoredUser()
  const tenant = user?.tenant
  const items = inv.items ?? []

  return (
    <div className="receipt">
      <div className="r-center r-bold r-lg">{tenant?.name ?? 'RxFlow'}</div>
      {tenant?.addressLine1 && <div className="r-center r-sm">{tenant.addressLine1}</div>}
      {(tenant?.city || tenant?.state) && (
        <div className="r-center r-sm">{[tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(', ')}</div>
      )}
      {tenant?.phone && <div className="r-center r-sm">Tel: {tenant.phone}</div>}
      {tenant?.gstin && <div className="r-center r-sm">GSTIN: {tenant.gstin}</div>}
      {tenant?.drugLicenseNumber && <div className="r-center r-sm">DL: {tenant.drugLicenseNumber}</div>}

      <div className="r-divider" />

      <div className="r-row">
        <span>{inv.type === 'CREDIT_NOTE' ? 'CREDIT NOTE' : 'INVOICE'}</span>
        <span className="r-bold">{inv.invoiceNumber}</span>
      </div>
      <div className="r-row r-sm">
        <span>{formatDate(inv.createdAt, 'DD/MM/YY HH:mm')}</span>
        <span>{inv.paymentStatus}</span>
      </div>

      {inv.customer && (
        <>
          <div className="r-divider r-dashed" />
          <div className="r-sm">To: {inv.customer.name}</div>
          {inv.customer.phone && <div className="r-sm">Ph: {inv.customer.phone}</div>}
          {inv.customer.gstin && <div className="r-sm">GSTIN: {inv.customer.gstin}</div>}
        </>
      )}

      <div className="r-divider" />

      <table className="r-items">
        <thead>
          <tr>
            <th className="r-left">Item</th>
            <th className="r-right">Qty</th>
            <th className="r-right">Rate</th>
            <th className="r-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => (
            <tr key={it.id}>
              <td colSpan={4} className="r-item-name">
                {it.medicineName}
                {it.batchNumber && it.batchNumber !== 'N/A' && (
                  <span className="r-batch"> · B:{it.batchNumber} · E:{formatDate(it.expiryDate, 'MM/YY')}</span>
                )}
              </td>
            </tr>
          ))}
          {items.map((it: any) => (
            <tr key={it.id + '-amt'} className="r-amount-row">
              <td className="r-left r-sm">{it.medicineName.slice(0, 18)}{it.medicineName.length > 18 && '…'}</td>
              <td className="r-right">{it.quantity}</td>
              <td className="r-right">{it.unitPrice.toFixed(2)}</td>
              <td className="r-right">{it.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="r-divider" />

      <div className="r-row">
        <span>Subtotal</span>
        <span>{formatCurrency(inv.subtotal)}</span>
      </div>
      {inv.discountAmount > 0 && (
        <div className="r-row">
          <span>Discount</span>
          <span>-{formatCurrency(inv.discountAmount)}</span>
        </div>
      )}
      {inv.cgst > 0 && (
        <div className="r-row r-sm">
          <span>CGST</span>
          <span>{formatCurrency(inv.cgst)}</span>
        </div>
      )}
      {inv.sgst > 0 && (
        <div className="r-row r-sm">
          <span>SGST</span>
          <span>{formatCurrency(inv.sgst)}</span>
        </div>
      )}
      {inv.igst > 0 && (
        <div className="r-row r-sm">
          <span>IGST</span>
          <span>{formatCurrency(inv.igst)}</span>
        </div>
      )}
      {inv.roundOff !== 0 && (
        <div className="r-row r-sm">
          <span>Round Off</span>
          <span>{formatCurrency(inv.roundOff)}</span>
        </div>
      )}
      <div className="r-divider" />
      <div className="r-row r-bold r-lg">
        <span>TOTAL</span>
        <span>{formatCurrency(inv.grandTotal)}</span>
      </div>

      <div className="r-divider r-dashed" />

      <div className="r-center r-sm">
        Items: {items.reduce((s: number, it: any) => s + it.quantity, 0)} qty in {items.length} line(s)
      </div>
      {inv.notes && <div className="r-center r-sm">{inv.notes}</div>}

      <div className="r-spacer" />
      <div className="r-center r-sm r-italic">Thank you · Visit again!</div>
      <div className="r-center r-xs">Goods once sold cannot be returned without bill.</div>
      <div className="r-spacer" />

      {/* On-screen "Print again" button — hidden in print */}
      <button onClick={() => window.print()} className="r-print-btn">
        Print
      </button>
    </div>
  )
}
