'use client'

import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
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
    <div className="modal-overlay z-100">
      <div className="modal-panel w-full max-w-md">
        <div className="modal-header">
          <h2 className="text-danger-700">Delete account
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-close"><X className="w-4 h-4" /></button>
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
