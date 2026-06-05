import Papa from 'papaparse'
import * as XLSX from 'xlsx'

/** Download an array of row objects as a CSV file. */
export function exportCsv(filename: string, rows: any[]) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

/** Download an array of row objects as a real .xlsx file. */
export function exportXlsx(filename: string, rows: any[], sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows)
  // Auto column widths based on content
  if (rows.length > 0) {
    const keys = Object.keys(rows[0])
    ws['!cols'] = keys.map((k) => {
      const maxLen = Math.max(
        k.length,
        ...rows.map((r) => String(r[k] ?? '').length)
      )
      return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
    })
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/** Export multiple named sheets into a single workbook. */
export function exportXlsxMultiSheet(filename: string, sheets: { name: string; rows: any[] }[]) {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Small dropdown-free helper: a button group that exports either format. */
export type ExportFormat = 'csv' | 'xlsx'
export function exportRows(format: ExportFormat, filename: string, rows: any[], sheetName?: string) {
  if (format === 'xlsx') exportXlsx(filename, rows, sheetName)
  else exportCsv(filename, rows)
}
