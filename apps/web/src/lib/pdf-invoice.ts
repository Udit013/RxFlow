import type { jsPDF } from 'jspdf'

// jsPDF + autotable are ~350 kB; load them on the first PDF download rather than shipping
// them with every invoice/order page.
async function loadPdfLib() {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  return { JsPDF, autoTable }
}
import { formatCurrency, formatDate } from './utils'
import { getActiveRegion } from './region'
import { lineTaxComponents, taxColumns, invoiceTaxRows } from './invoice-tax'

/**
 * Money for the PDF. jsPDF's built-in Helvetica only covers WinAnsi, which has $ £ € ¥ but not
 * ₹ (or most other symbols) — those printed as a wrong glyph. Use the ISO code instead
 * ("INR 1,064.00") whenever the symbol isn't printable.
 */
function pdfMoney(amount: number): string {
  const { currency, locale } = getActiveRegion()
  const display = ['USD', 'GBP', 'EUR', 'JPY'].includes(currency) ? 'symbol' : 'code'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: display }).format(amount)
  } catch {
    return formatCurrency(amount)
  }
}

interface InvoiceItem {
  medicineName: string
  batchNumber?: string
  expiryDate?: string | Date
  hsn?: string
  quantity: number
  unitPrice: number
  discountPercent?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  taxBreakdown?: unknown
  total?: number
  taxableAmount?: number
}

interface InvoiceData {
  invoiceNumber: string
  type?: 'SALE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'RETURN' | string
  createdAt: string | Date
  dueDate?: string | Date
  subtotal: number
  discountAmount: number
  cgst: number
  sgst: number
  igst: number
  totalTax: number
  otherCharges?: number
  roundOff?: number
  grandTotal: number
  paymentStatus: string
  notes?: string | null
  originalInvoiceNumber?: string | null
  customer?: { name?: string; phone?: string; email?: string; addressLine1?: string; city?: string; state?: string; pincode?: string; gstin?: string } | null
  supplier?: { name?: string; companyName?: string; gstin?: string; phone?: string } | null
  items: InvoiceItem[]
}

interface TenantHeader {
  name: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  drugLicense?: string
}

export async function generateInvoicePdf(invoice: InvoiceData, tenant: TenantHeader): Promise<jsPDF> {
  const { JsPDF, autoTable } = await loadPdfLib()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header — pharmacy info
  doc.setFontSize(18).setFont('helvetica', 'bold')
  doc.text(tenant.name, margin, 18)
  doc.setFontSize(9).setFont('helvetica', 'normal')
  let y = 24
  if (tenant.address) { doc.text(tenant.address, margin, y); y += 4 }
  if (tenant.phone) { doc.text(`Phone: ${tenant.phone}`, margin, y); y += 4 }
  if (tenant.email) { doc.text(`Email: ${tenant.email}`, margin, y); y += 4 }
  const region = getActiveRegion()
  if (tenant.gstin) { doc.text(`${region.fields.taxId.label}: ${tenant.gstin}`, margin, y); y += 4 }
  if (tenant.drugLicense) { doc.text(`${region.fields.license.label}: ${tenant.drugLicense}`, margin, y); y += 4 }

  // Right side — invoice title + meta
  const isCreditNote = invoice.type === 'CREDIT_NOTE'
  const isDebitNote = invoice.type === 'DEBIT_NOTE'
  const title = isCreditNote ? 'CREDIT NOTE' : isDebitNote ? 'DEBIT NOTE' : region.tax.invoiceTitle.toUpperCase()
  doc.setFontSize(20).setFont('helvetica', 'bold')
  if (isCreditNote) doc.setTextColor(180, 30, 30)
  doc.text(title, pageWidth - margin, 18, { align: 'right' })
  doc.setTextColor(0)
  doc.setFontSize(10).setFont('helvetica', 'normal')
  doc.text(`# ${invoice.invoiceNumber}`, pageWidth - margin, 24, { align: 'right' })
  doc.text(`Date: ${formatDate(invoice.createdAt)}`, pageWidth - margin, 29, { align: 'right' })
  if (invoice.dueDate) doc.text(`Due: ${formatDate(invoice.dueDate)}`, pageWidth - margin, 34, { align: 'right' })
  doc.text(`Status: ${invoice.paymentStatus}`, pageWidth - margin, 39, { align: 'right' })
  if (isCreditNote && invoice.originalInvoiceNumber) {
    doc.setTextColor(120)
    doc.text(`Ref: ${invoice.originalInvoiceNumber}`, pageWidth - margin, 44, { align: 'right' })
    doc.setTextColor(0)
  }

  // Divider
  y = Math.max(y, 44) + 2
  doc.setDrawColor(200).line(margin, y, pageWidth - margin, y)
  y += 6

  // Bill To
  const party = invoice.customer ?? invoice.supplier
  if (party) {
    doc.setFont('helvetica', 'bold').setFontSize(10)
    doc.text(invoice.customer ? 'Bill To:' : 'Supplier:', margin, y)
    doc.setFont('helvetica', 'normal')
    let by = y + 5
    const name = (party as any).name || (party as any).companyName
    if (name) { doc.text(name, margin, by); by += 4 }
    if ((party as any).phone) { doc.text((party as any).phone, margin, by); by += 4 }
    const addr = [(party as any).addressLine1, (party as any).city, (party as any).state, (party as any).pincode].filter(Boolean).join(', ')
    if (addr) { doc.text(addr, margin, by); by += 4 }
    if ((party as any).gstin) { doc.text(`${region.fields.taxId.label}: ${(party as any).gstin}`, margin, by); by += 4 }
    y = by + 2
  }

  // Items table — one column per tax component charged (CGST/SGST, IGST, VAT, sales tax …)
  const taxCols = taxColumns(invoice.items)
  autoTable(doc, {
    startY: y,
    head: [['#', 'Item', 'Batch', 'Exp', region.fields.productCode.label.replace(/ code$/i, ''), 'Qty', 'Rate', ...taxCols.map((c) => c.label), 'Total']],
    body: invoice.items.map((it, i) => [
      i + 1,
      it.medicineName,
      it.batchNumber ?? '—',
      it.expiryDate ? formatDate(it.expiryDate, 'MM/YY') : '—',
      it.hsn ?? '—',
      it.quantity,
      pdfMoney(it.unitPrice),
      ...taxCols.map((col) => {
        const c = lineTaxComponents(it).find((x) => x.code === col.code)
        return c?.amount ? `${c.rate}% ${pdfMoney(c.amount)}` : '—'
      }),
      pdfMoney(it.total ?? 0),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [7, 122, 206], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8 },
      5: { halign: 'center' },
      // Rate, each tax column and Total are right-aligned
      ...Object.fromEntries(Array.from({ length: taxCols.length + 2 }, (_, k) => [6 + k, { halign: 'right' as const }])),
    },
    margin: { left: margin, right: margin },
  })

  // Totals (right-aligned)
  const finalY = (doc as any).lastAutoTable.finalY + 6
  const totalsX = pageWidth - margin - 60
  doc.setFontSize(10)
  let ty = finalY
  const totalsRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, totalsX, ty)
    doc.text(value, pageWidth - margin, ty, { align: 'right' })
    ty += 5
  }
  totalsRow('Subtotal', pdfMoney(invoice.subtotal))
  if (invoice.discountAmount > 0) totalsRow('Discount', `-${pdfMoney(invoice.discountAmount)}`)
  for (const row of invoiceTaxRows(invoice)) if (row.amount > 0) totalsRow(row.label, pdfMoney(row.amount))
  if ((invoice.otherCharges ?? 0) > 0) totalsRow('Transport / other', pdfMoney(invoice.otherCharges!))
  if (Math.abs(invoice.roundOff ?? 0) >= 0.01) totalsRow('Round off', pdfMoney(invoice.roundOff!))
  doc.setDrawColor(200).line(totalsX, ty - 1, pageWidth - margin, ty - 1)
  ty += 2
  totalsRow(isCreditNote ? 'Refund Amount' : 'Grand Total', pdfMoney(invoice.grandTotal), true)

  if (isCreditNote && invoice.notes) {
    ty += 4
    doc.setFontSize(9).setFont('helvetica', 'italic').setTextColor(100)
    doc.text(`Reason: ${invoice.notes}`, margin, ty)
    doc.setTextColor(0)
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15
  doc.setFontSize(8).setFont('helvetica', 'italic').setTextColor(120)
  doc.text('Generated by RxFlow • This is a system-generated invoice', pageWidth / 2, footerY, { align: 'center' })

  return doc
}

export async function downloadInvoicePdf(invoice: InvoiceData, tenant: TenantHeader) {
  const doc = await generateInvoicePdf(invoice, tenant)
  doc.save(`${invoice.invoiceNumber}.pdf`)
}

export function buildWhatsAppInvoiceMessage(invoice: InvoiceData, tenant: TenantHeader): string {
  const party = invoice.customer ?? invoice.supplier
  const partyName = party ? ((party as any).name || (party as any).companyName) : 'Customer'
  const isCreditNote = invoice.type === 'CREDIT_NOTE'
  const docLabel = isCreditNote ? 'Credit Note' : 'Invoice'
  const greeting = isCreditNote
    ? `Hi ${partyName}, your credit note has been issued:`
    : `Hi ${partyName}, here's your invoice:`
  const lines = [
    `*${tenant.name}*`,
    `${docLabel}: *${invoice.invoiceNumber}*`,
    invoice.originalInvoiceNumber ? `Against invoice: ${invoice.originalInvoiceNumber}` : '',
    `Date: ${formatDate(invoice.createdAt)}`,
    greeting,
    '',
    ...invoice.items.slice(0, 10).map((it) => `• ${it.medicineName} × ${it.quantity} = ${formatCurrency(it.total ?? 0)}`),
    invoice.items.length > 10 ? `... +${invoice.items.length - 10} more items` : '',
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal)}`,
    `${getActiveRegion().tax.label}: ${formatCurrency(invoice.totalTax)}`,
    isCreditNote ? `*Refund: ${formatCurrency(invoice.grandTotal)}*` : `*Total: ${formatCurrency(invoice.grandTotal)}*`,
    isCreditNote && invoice.notes ? `Reason: ${invoice.notes}` : '',
    `Status: ${invoice.paymentStatus}`,
    '',
    isCreditNote ? `We've credited your account.` : `Thank you for your business!`,
  ].filter(Boolean)
  return lines.join('\n')
}

export function openWhatsAppInvoice(phone: string | null | undefined, message: string) {
  const cleanPhone = (phone ?? '').replace(/\D/g, '')
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
