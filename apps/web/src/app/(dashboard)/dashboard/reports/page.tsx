'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, Calendar, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv, exportXlsxMultiSheet } from '@/lib/export'
import { AnimatedSection, PageHeader, ExportButton } from '@/components/ui'

function thisMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const downloadCsv = (filename: string, rows: any[]) => exportCsv(filename, rows)

export default function ReportsPage() {
  const [period, setPeriod] = useState(thisMonth())
  const [activeReport, setActiveReport] = useState<'gstr1' | 'gstr3b' | 'sales' | 'purchase' | 'stock'>('gstr1')

  const gstr1 = useQuery({
    queryKey: ['gstr1', period],
    queryFn: () => api.get('/reports/gstr1', { params: { period } }).then((r) => r.data),
    enabled: activeReport === 'gstr1',
  })

  const gstr3b = useQuery({
    queryKey: ['gstr3b', period],
    queryFn: () => api.get('/reports/gstr3b', { params: { period } }).then((r) => r.data),
    enabled: activeReport === 'gstr3b',
  })

  const salesReg = useQuery({
    queryKey: ['sales-register', period],
    queryFn: () => {
      const [y, m] = period.split('-').map(Number)
      const from = new Date(Date.UTC(y, m - 1, 1)).toISOString()
      const to = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString()
      return api.get('/reports/sales-register', { params: { from, to } }).then((r) => r.data)
    },
    enabled: activeReport === 'sales',
  })

  const purchaseReg = useQuery({
    queryKey: ['purchase-register', period],
    queryFn: () => {
      const [y, m] = period.split('-').map(Number)
      const from = new Date(Date.UTC(y, m - 1, 1)).toISOString()
      const to = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString()
      return api.get('/reports/purchase-register', { params: { from, to } }).then((r) => r.data)
    },
    enabled: activeReport === 'purchase',
  })

  const stockVal = useQuery({
    queryKey: ['stock-valuation'],
    queryFn: () => api.get('/reports/stock-valuation').then((r) => r.data),
    enabled: activeReport === 'stock',
  })

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={FileSpreadsheet}
          eyebrow="Admin"
          title="Reports"
          description="GST returns, sales/purchase registers, stock valuation"
          actions={
            <div className="flex items-center gap-2 bg-white border border-surface-200 rounded-lg px-3 py-1.5 shadow-xs">
              <Calendar className="w-4 h-4 text-surface-400" />
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="text-sm outline-none bg-transparent"
              />
            </div>
          }
        />
      </AnimatedSection>

      <AnimatedSection>
        <div className="flex items-center gap-1 bg-white border border-surface-200/70 rounded-xl p-1 w-fit shadow-xs overflow-x-auto max-w-full">
          {([
            ['gstr1', 'GSTR-1 (Sales)'],
            ['gstr3b', 'GSTR-3B (Summary)'],
            ['sales', 'Sales Register'],
            ['purchase', 'Purchase Register'],
            ['stock', 'Stock Valuation'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveReport(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeReport === key ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-600 hover:bg-surface-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </AnimatedSection>

      <AnimatedSection key={activeReport}>
        {activeReport === 'gstr1' && (
          <Gstr1View data={gstr1.data?.data} isLoading={gstr1.isLoading} period={period} onExport={downloadCsv} />
        )}
        {activeReport === 'gstr3b' && (
          <Gstr3bView data={gstr3b.data?.data} isLoading={gstr3b.isLoading} period={period} />
        )}
        {activeReport === 'sales' && (
          <RegisterView title="Sales Register" data={salesReg.data?.data} isLoading={salesReg.isLoading} period={period} filename="sales-register" onExport={downloadCsv} />
        )}
        {activeReport === 'purchase' && (
          <RegisterView title="Purchase Register" data={purchaseReg.data?.data} isLoading={purchaseReg.isLoading} period={period} filename="purchase-register" onExport={downloadCsv} />
        )}
        {activeReport === 'stock' && (
          <StockValuationView data={stockVal.data?.data} isLoading={stockVal.isLoading} onExport={downloadCsv} />
        )}
      </AnimatedSection>
    </div>
  )
}

function Gstr1View({ data, isLoading, period, onExport }: any) {
  if (isLoading) return <div className="card p-12 text-center text-slate-400">Loading...</div>
  if (!data) return null

  const exportAllExcel = () => {
    const sheets = [
      { name: 'HSN Summary', rows: data.hsnRollup ?? [] },
      { name: 'B2C', rows: data.b2cInvoices ?? [] },
    ]
    if ((data.b2bInvoices ?? []).length > 0) sheets.push({ name: 'B2B', rows: data.b2bInvoices })
    if ((data.cdnr ?? []).length > 0) sheets.push({ name: 'CDNR', rows: data.cdnr })
    if ((data.cdnur ?? []).length > 0) sheets.push({ name: 'CDNUR', rows: data.cdnur })
    exportXlsxMultiSheet(`GSTR1-${period}`, sheets)
  }
  const exportAllCsv = () => {
    onExport(`GSTR1-${period}-hsn.csv`, data.hsnRollup)
    onExport(`GSTR1-${period}-b2c.csv`, data.b2cInvoices)
    if ((data.b2bInvoices ?? []).length > 0) onExport(`GSTR1-${period}-b2b.csv`, data.b2bInvoices)
    if ((data.cdnr ?? []).length > 0) onExport(`GSTR1-${period}-cdnr.csv`, data.cdnr)
    if ((data.cdnur ?? []).length > 0) onExport(`GSTR1-${period}-cdnur.csv`, data.cdnur)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="metric-card">
          <p className="text-xs text-surface-500 uppercase">Invoices</p>
          <p className="text-lg font-bold">{data.totals.totalInvoices}</p>
          <p className="text-xs text-surface-500">B2B: {data.totals.b2bCount ?? 0} · B2C: {data.totals.b2cCount ?? 0}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-surface-500 uppercase">Credit Notes</p>
          <p className="text-lg font-bold text-amber-600">-{formatCurrency(data.creditNoteTotals?.grandTotal ?? 0)}</p>
          <p className="text-xs text-surface-500">{data.creditNoteTotals?.count ?? 0} issued</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-surface-500 uppercase">Taxable Value</p>
          <p className="text-lg font-bold">{formatCurrency(data.totals.totalTaxableValue)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-surface-500 uppercase">Total Tax</p>
          <p className="text-lg font-bold">{formatCurrency(data.totals.totalCgst + data.totals.totalSgst + data.totals.totalIgst)}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-surface-500 uppercase">Grand Total</p>
          <p className="text-lg font-bold">{formatCurrency(data.totals.grandTotal)}</p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={exportAllExcel} className="btn-primary"><FileSpreadsheet className="w-4 h-4" /> Excel (all sheets)</button>
        <button onClick={exportAllCsv} className="btn-secondary">CSV files</button>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header"><h3 className="font-semibold">Rate-wise Summary</h3></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">Rate</th>
              <th className="text-right px-4 py-2">Taxable Value</th>
              <th className="text-right px-4 py-2">CGST</th>
              <th className="text-right px-4 py-2">SGST</th>
              <th className="text-right px-4 py-2">IGST</th>
              <th className="text-center px-4 py-2">Items</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rateRollup.map((r: any) => (
              <tr key={r.rate}>
                <td className="px-4 py-2 font-medium">{r.rate}%</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.taxableValue)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.cgst)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.sgst)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.igst)}</td>
                <td className="px-4 py-2 text-center text-slate-600">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {((data.cdnr ?? []).length > 0 || (data.cdnur ?? []).length > 0) && (
        <div className="card overflow-hidden border-amber-200">
          <div className="card-header flex items-center justify-between bg-amber-50">
            <h3 className="font-semibold text-amber-900">Credit/Debit Notes (Section 9B — CDNR/CDNUR)</h3>
            <span className="text-xs text-amber-800">Reduces outward supplies</span>
          </div>
          {(data.cdnr ?? []).length > 0 && (
            <>
              <div className="px-4 py-2 text-xs uppercase text-slate-500 bg-slate-50">CDNR — Registered (with GSTIN)</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                    <th className="text-left px-4 py-2">CN #</th>
                    <th className="text-left px-4 py-2">Against</th>
                    <th className="text-left px-4 py-2">Customer</th>
                    <th className="text-left px-4 py-2">GSTIN</th>
                    <th className="text-right px-4 py-2">Taxable</th>
                    <th className="text-right px-4 py-2">Tax</th>
                    <th className="text-right px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.cdnr.map((cn: any) => (
                    <tr key={cn.invoiceNumber}>
                      <td className="px-4 py-2 font-medium">{cn.invoiceNumber}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs">{cn.originalInvoice ?? '—'}</td>
                      <td className="px-4 py-2">{cn.customer}</td>
                      <td className="px-4 py-2 font-mono text-xs">{cn.gstin}</td>
                      <td className="px-4 py-2 text-right">-{formatCurrency(cn.subtotal)}</td>
                      <td className="px-4 py-2 text-right">-{formatCurrency(cn.cgst + cn.sgst + cn.igst)}</td>
                      <td className="px-4 py-2 text-right font-medium text-amber-700">-{formatCurrency(cn.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {(data.cdnur ?? []).length > 0 && (
            <>
              <div className="px-4 py-2 text-xs uppercase text-slate-500 bg-slate-50 border-t">CDNUR — Unregistered (B2C returns)</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                    <th className="text-left px-4 py-2">CN #</th>
                    <th className="text-left px-4 py-2">Against</th>
                    <th className="text-left px-4 py-2">Customer</th>
                    <th className="text-right px-4 py-2">Taxable</th>
                    <th className="text-right px-4 py-2">Tax</th>
                    <th className="text-right px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.cdnur.map((cn: any) => (
                    <tr key={cn.invoiceNumber}>
                      <td className="px-4 py-2 font-medium">{cn.invoiceNumber}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs">{cn.originalInvoice ?? '—'}</td>
                      <td className="px-4 py-2">{cn.customer}</td>
                      <td className="px-4 py-2 text-right">-{formatCurrency(cn.subtotal)}</td>
                      <td className="px-4 py-2 text-right">-{formatCurrency(cn.cgst + cn.sgst + cn.igst)}</td>
                      <td className="px-4 py-2 text-right font-medium text-amber-700">-{formatCurrency(cn.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {data.netOutward && (
            <div className="bg-slate-50 px-4 py-3 border-t flex items-center justify-between text-sm">
              <span className="text-slate-600">Net outward supply (after returns)</span>
              <span className="font-bold text-slate-900">{formatCurrency(data.netOutward.grandTotal)}</span>
            </div>
          )}
        </div>
      )}

      {(data.b2bInvoices ?? []).length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header"><h3 className="font-semibold">B2B Supplies (Section 4)</h3></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="text-left px-4 py-2">Invoice #</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">GSTIN</th>
                <th className="text-right px-4 py-2">Taxable</th>
                <th className="text-right px-4 py-2">IGST</th>
                <th className="text-right px-4 py-2">CGST</th>
                <th className="text-right px-4 py-2">SGST</th>
                <th className="text-right px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.b2bInvoices.map((inv: any) => (
                <tr key={inv.invoiceNumber}>
                  <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2">{inv.customer}</td>
                  <td className="px-4 py-2 font-mono text-xs">{inv.gstin}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(inv.subtotal)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(inv.igst)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(inv.cgst)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(inv.sgst)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(inv.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header"><h3 className="font-semibold">HSN-wise Summary (Section 12)</h3></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">HSN</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-center px-4 py-2">Qty</th>
              <th className="text-right px-4 py-2">Taxable</th>
              <th className="text-right px-4 py-2">CGST</th>
              <th className="text-right px-4 py-2">SGST</th>
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.hsnRollup.map((h: any) => (
              <tr key={h.hsn}>
                <td className="px-4 py-2 font-mono text-xs">{h.hsn}</td>
                <td className="px-4 py-2">{h.description}</td>
                <td className="px-4 py-2 text-center">{h.totalQty}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(h.taxableValue)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(h.cgst)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(h.sgst)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(h.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Gstr3bView({ data, isLoading }: any) {
  if (isLoading) return <div className="card p-12 text-center text-slate-400">Loading...</div>
  if (!data) return null

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Table 3.1 — Outward Supplies (net of credit notes)</h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2 text-slate-600">Invoice Count</td><td className="py-2 text-right font-medium">{data.outwardSupplies.invoiceCount}</td></tr>
            <tr><td className="py-2 text-slate-600">Taxable Value (net)</td><td className="py-2 text-right font-medium">{formatCurrency(data.outwardSupplies.taxableValue)}</td></tr>
            <tr><td className="py-2 text-slate-600">Integrated Tax (IGST)</td><td className="py-2 text-right">{formatCurrency(data.outwardSupplies.igst)}</td></tr>
            <tr><td className="py-2 text-slate-600">Central Tax (CGST)</td><td className="py-2 text-right">{formatCurrency(data.outwardSupplies.cgst)}</td></tr>
            <tr><td className="py-2 text-slate-600">State Tax (SGST)</td><td className="py-2 text-right">{formatCurrency(data.outwardSupplies.sgst)}</td></tr>
            <tr className="border-t-2"><td className="py-2 font-semibold">Total Output Tax (net)</td><td className="py-2 text-right font-bold">{formatCurrency(data.outwardSupplies.totalTax)}</td></tr>
          </tbody>
        </table>
        {data.creditNotes?.count > 0 && (
          <div className="mt-3 pt-3 border-t-2 border-amber-200 bg-amber-50 -m-5 mt-3 p-4">
            <p className="text-xs uppercase font-semibold text-amber-900 mb-2">Credit Notes Issued This Period (-)</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-amber-900">{data.creditNotes.count} note(s) · Taxable {formatCurrency(data.creditNotes.taxableValue)}</span>
              <span className="font-bold text-amber-700">-{formatCurrency(data.creditNotes.totalValue)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Table 4 — Eligible ITC (Inward Supplies)</h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2 text-slate-600">Purchase Invoice Count</td><td className="py-2 text-right font-medium">{data.inwardSuppliesItc.invoiceCount}</td></tr>
            <tr><td className="py-2 text-slate-600">Taxable Value</td><td className="py-2 text-right font-medium">{formatCurrency(data.inwardSuppliesItc.taxableValue)}</td></tr>
            <tr><td className="py-2 text-slate-600">IGST</td><td className="py-2 text-right">{formatCurrency(data.inwardSuppliesItc.igst)}</td></tr>
            <tr><td className="py-2 text-slate-600">CGST</td><td className="py-2 text-right">{formatCurrency(data.inwardSuppliesItc.cgst)}</td></tr>
            <tr><td className="py-2 text-slate-600">SGST</td><td className="py-2 text-right">{formatCurrency(data.inwardSuppliesItc.sgst)}</td></tr>
            <tr className="border-t-2"><td className="py-2 font-semibold">Total ITC Available</td><td className="py-2 text-right font-bold text-green-600">{formatCurrency(data.inwardSuppliesItc.totalItc)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card p-5 bg-amber-50 border-amber-200">
        <h3 className="font-semibold text-slate-900 mb-3">Net Tax Payable (Output − ITC)</h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-amber-200">
            <tr><td className="py-2 text-slate-600">IGST</td><td className="py-2 text-right font-medium">{formatCurrency(data.netTaxPayable.igst)}</td></tr>
            <tr><td className="py-2 text-slate-600">CGST</td><td className="py-2 text-right font-medium">{formatCurrency(data.netTaxPayable.cgst)}</td></tr>
            <tr><td className="py-2 text-slate-600">SGST</td><td className="py-2 text-right font-medium">{formatCurrency(data.netTaxPayable.sgst)}</td></tr>
            <tr className="border-t-2 border-amber-300"><td className="py-2 font-bold">Total Payable</td><td className="py-2 text-right font-bold text-amber-700 text-lg">
              {formatCurrency(data.netTaxPayable.igst + data.netTaxPayable.cgst + data.netTaxPayable.sgst)}
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RegisterView({ title, data, isLoading, period, filename }: any) {
  if (isLoading) return <div className="card p-12 text-center text-slate-400">Loading...</div>

  const rows = data ?? []
  const total = rows.reduce((s: number, r: any) => s + (r.grandTotal ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{rows.length} entries · Total {formatCurrency(total)}</p>
        <ExportButton filename={`${filename}-${period}`} rows={rows} sheetName={title} disabled={rows.length === 0} />
      </div>
      <div className="card overflow-hidden">
        <div className="card-header"><h3 className="font-semibold">{title}</h3></div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-slate-400 text-sm">No entries in this period</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">Invoice #</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Party</th>
                <th className="text-right px-3 py-2">Subtotal</th>
                <th className="text-right px-3 py-2">Tax</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-center px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">{r.invoiceNumber}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDate(r.date)}</td>
                  <td className="px-3 py-2">{r.customer ?? r.supplier ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.subtotal)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency((r.cgst ?? 0) + (r.sgst ?? 0) + (r.igst ?? 0))}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.grandTotal)}</td>
                  <td className="px-3 py-2 text-center text-xs">{r.paymentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StockValuationView({ data, isLoading }: any) {
  if (isLoading) return <div className="card p-12 text-center text-slate-400">Loading...</div>
  if (!data) return null

  const totals = data.totals
  const rows = data.rows ?? []
  const topMfrs = data.topManufacturers ?? []

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">SKUs in stock</p>
          <p className="text-lg font-bold">{totals.skuCount}</p>
          <p className="text-xs text-slate-500">{totals.totalQty} units total</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Value at Cost</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(totals.valueAtCost)}</p>
          <p className="text-xs text-slate-500">What you paid</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Value at Selling</p>
          <p className="text-lg font-bold text-blue-700">{formatCurrency(totals.valueAtSelling)}</p>
          <p className="text-xs text-slate-500">If sold at current price</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-slate-500 uppercase">Value at MRP</p>
          <p className="text-lg font-bold text-slate-700">{formatCurrency(totals.valueAtMrp)}</p>
          <p className="text-xs text-slate-500">Max retail value</p>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 uppercase">Potential Margin</p>
            <Package className="w-3.5 h-3.5 text-green-600" />
          </div>
          <p className="text-lg font-bold text-green-700">{formatCurrency(totals.margin)}</p>
          <p className="text-xs text-slate-500">{totals.marginPercent.toFixed(1)}% on cost</p>
        </div>
      </div>

      <div className="flex justify-end">
        <ExportButton
          filename="stock-valuation"
          sheetName="Stock Valuation"
          disabled={rows.length === 0}
          rows={() => rows.map((r: any) => ({
            medicine: r.medicine, manufacturer: r.manufacturer, strength: r.strength,
            quantity: r.quantity, avgCostPrice: r.avgCostPrice, sellingPrice: r.sellingPrice, mrp: r.mrp,
            valueAtCost: r.valueAtCost, valueAtSelling: r.valueAtSelling, valueAtMrp: r.valueAtMrp,
            margin: r.margin, marginPercent: r.marginPercent.toFixed(1),
          }))}
        />
      </div>

      {topMfrs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header"><h3 className="font-semibold">Top Manufacturers by Inventory Value</h3></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="text-left px-4 py-2">Manufacturer</th>
                <th className="text-center px-4 py-2">SKUs</th>
                <th className="text-center px-4 py-2">Units</th>
                <th className="text-right px-4 py-2">Value at Cost</th>
                <th className="text-right px-4 py-2">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topMfrs.map((m: any) => (
                <tr key={m.manufacturer}>
                  <td className="px-4 py-2 font-medium">{m.manufacturer}</td>
                  <td className="px-4 py-2 text-center">{m.skus}</td>
                  <td className="px-4 py-2 text-center">{m.quantity}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(m.valueAtCost)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {totals.valueAtCost > 0 ? ((m.valueAtCost / totals.valueAtCost) * 100).toFixed(1) : '0'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-semibold">All SKUs — sorted by value</h3>
          <span className="text-xs text-slate-500">{rows.length} items</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-slate-400 text-sm">No stock to value</p>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Medicine</th>
                  <th className="text-left px-3 py-2">Manufacturer</th>
                  <th className="text-center px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Avg Cost</th>
                  <th className="text-right px-3 py-2">MRP</th>
                  <th className="text-right px-3 py-2">Value@Cost</th>
                  <th className="text-right px-3 py-2">Value@Sell</th>
                  <th className="text-right px-3 py-2">Margin%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r: any) => (
                  <tr key={r.medicineId}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.medicine}</p>
                      <p className="text-xs text-slate-500">{r.strength} · {r.dosageForm}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{r.manufacturer}</td>
                    <td className="px-3 py-2 text-center">{r.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.avgCostPrice)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(r.mrp)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.valueAtCost)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(r.valueAtSelling)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{r.marginPercent.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
