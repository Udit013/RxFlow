'use client'

import { useState } from 'react'
import { X, AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { authService } from '@/lib/auth'

export function DeleteAccountModal({ tenantName, onClose, onDeleted }: { tenantName: string; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const matches = confirm.trim() === tenantName.trim()

  const handleDelete = async () => {
    if (!matches) return
    setLoading(true)
    try {
      await authService.deleteAccount(confirm)
      toast.success('Account deleted')
      onDeleted()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Failed to delete account')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Delete account
          </h2>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
            This permanently deletes <strong>{tenantName}</strong> and <strong>all</strong> of its data — inventory,
            invoices, customers, suppliers, staff, accounts, and every other record. This <strong>cannot be undone</strong>.
          </div>
          <p className="text-xs text-surface-500">
            💡 Want a copy first? Cancel and use <strong>Backup &amp; Import → Export</strong> to download everything.
          </p>
          <div>
            <label className="label">Type <span className="font-mono font-semibold">{tenantName}</span> to confirm</label>
            <input
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={tenantName}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} disabled={!matches || loading} className="btn-danger">
              <Trash2 className="w-4 h-4" /> {loading ? 'Deleting...' : 'Delete forever'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
