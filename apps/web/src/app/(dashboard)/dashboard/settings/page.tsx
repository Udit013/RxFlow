'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Building, Save, X, Plus, Users as UsersIcon, Wifi, Trash2, Globe2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatDate } from '@/lib/utils'
import { DeleteAccountModal } from '@/components/delete-account-modal'
import { useRegion } from '@/lib/region'
import { taxIdRules } from '@/lib/regional-form'
import { RegionTab } from '@/components/settings/region-tab'
import { FormSection } from '@/components/ui'

const ROLES = ['TENANT_ADMIN', 'STORE_MANAGER', 'PHARMACIST', 'SALES_REP', 'ACCOUNTANT', 'DELIVERY_STAFF', 'VIEWER'] as const

export default function SettingsPage() {
  const [tab, setTab] = useState<'tenant' | 'region' | 'users' | 'lan'>('tenant')
  const [user, setUser] = useState<ReturnType<typeof authService.getStoredUser>>(null)

  useEffect(() => { setUser(authService.getStoredUser()) }, [])

  if (!user) return <div className="p-8 text-slate-400">Loading...</div>

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="text-[13px] leading-5 text-surface-500 mt-1">Tenant configuration, region & tax, team members, LAN deployment</p>
        </div>
      </div>

      <div role="tablist" className="tab-list">
        {([
          ['tenant', 'Tenant & Operations', Building],
          ['region', 'Region & Tax', Globe2],
          ['users', 'Users & Roles', UsersIcon],
          ['lan', 'LAN Deployment', Wifi],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            role="tab"
              aria-selected={tab === k}
              className="tab"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tenant' && <TenantTab user={user} />}
      {tab === 'region' && <RegionTab canEdit={user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN'} />}
      {tab === 'users' && <UsersTab currentUserId={user.id} />}
      {tab === 'lan' && <LanTab />}
    </div>
  )
}

interface TenantForm {
  name: string
  gstin?: string
  drugLicenseNumber?: string
  drugLicenseExpiryDate?: string
  phone?: string
  email?: string
  addressLine1?: string
  city?: string
  state?: string
  pincode?: string
  allowNegativeStock: boolean
}

function TenantTab({ user }: { user: NonNullable<ReturnType<typeof authService.getStoredUser>> }) {
  const region = useRegion()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['tenant'],
    queryFn: () => api.get('/tenant').then((r) => r.data),
  })
  const tenant = data?.data ?? user.tenant

  const { register, handleSubmit, reset, watch } = useForm<TenantForm>({
    defaultValues: {
      name: tenant.name,
      gstin: tenant.gstin ?? '',
      drugLicenseNumber: tenant.drugLicenseNumber ?? '',
      drugLicenseExpiryDate: tenant.drugLicenseExpiryDate ? new Date(tenant.drugLicenseExpiryDate).toISOString().slice(0, 10) : '',
      phone: tenant.phone ?? '',
      email: tenant.email ?? '',
      addressLine1: tenant.addressLine1 ?? '',
      city: tenant.city ?? '',
      state: tenant.state ?? '',
      pincode: tenant.pincode ?? '',
      allowNegativeStock: tenant.allowNegativeStock ?? false,
    },
  })

  useEffect(() => {
    if (tenant) {
      reset({
        name: tenant.name,
        gstin: tenant.gstin ?? '',
        drugLicenseNumber: tenant.drugLicenseNumber ?? '',
        phone: tenant.phone ?? '',
        email: tenant.email ?? '',
        addressLine1: tenant.addressLine1 ?? '',
        city: tenant.city ?? '',
        state: tenant.state ?? '',
        pincode: tenant.pincode ?? '',
        allowNegativeStock: tenant.allowNegativeStock ?? false,
      })
    }
  }, [tenant, reset])

  const mutation = useMutation({
    mutationFn: (d: TenantForm) => {
      // Drop empty optional strings + convert empty date to undefined (skipped)
      const payload: any = { ...d }
      for (const k of Object.keys(payload)) {
        if (payload[k] === '') delete payload[k]
      }
      return api.patch('/tenant', payload)
    },
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['tenant'] })
      // Update stored user copy so PDF headers etc. stay fresh
      const stored = authService.getStoredUser()
      if (stored) {
        const merged = { ...stored, tenant: { ...stored.tenant, ...watch() } as any }
        localStorage.setItem('rxflow_user', JSON.stringify(merged))
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const allowNeg = watch('allowNegativeStock')
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const isAdmin = user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN'

  return (
   <div>
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
      <FormSection title="Business information" description="Printed on invoices and used for tax and licence records.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Pharmacy Name *</label>
            <input className="input" {...register('name', { required: true })} />
          </div>
          <div>
            <label className="label">{region.fields.taxId.label}</label>
            <input className="input font-mono text-xs" {...register('gstin', taxIdRules(region))} placeholder={region.fields.taxId.example ?? ''} />
          </div>
          <div>
            <label className="label">{region.fields.license.label}</label>
            <input className="input font-mono text-xs" {...register('drugLicenseNumber')} />
          </div>
          <div>
            <label className="label">Licence expiry</label>
            <input type="date" className="input" {...register('drugLicenseExpiryDate')} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" {...register('phone')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input className="input" type="email" {...register('email')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" {...register('addressLine1')} placeholder="Street address" />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" {...register('city')} />
          </div>
          <div>
            <label className="label">{region.fields.region.label}</label>
            <input className="input" {...register('state')} placeholder="Maharashtra" />
          </div>
          <div>
            <label className="label">{region.fields.postalCode.label}</label>
            <input className="input" {...register('pincode')} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Operations" description="How the counter behaves when stock records lag behind the shelf.">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" {...register('allowNegativeStock')} className="mt-0.5 w-4 h-4 accent-brand-700" />
          <div>
            <p className="font-medium text-[13px] text-surface-900">Allow negative stock (sell before stocking)</p>
            <p className="text-[13px] leading-5 text-surface-500 mt-1">
              When enabled, the POS will let you complete a sale even if the medicine isn&apos;t in inventory yet — the
              system tracks the negative balance until the purchase is recorded. Useful for fast-moving items received
              outside of business hours.
            </p>
            {allowNeg && (
              <div className="mt-3 bg-warning-50 border border-warning-200 rounded-md px-3 py-2 text-xs text-warning-800">
                Negative balances will appear with a red badge in inventory. Run regular stock takes to reconcile.
              </div>
            )}
          </div>
        </label>
      </FormSection>

      <div className="flex justify-end pb-6 border-b border-surface-200 lg:pl-[calc(15rem+2.5rem)]">
        <button type="submit" disabled={mutation.isPending} className="btn-primary">
          <Save className="w-4 h-4" /> {mutation.isPending ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>

    {isAdmin && (
      <FormSection title="Danger zone" tone="danger" description="Irreversible actions for this pharmacy account." className="border-t-0!">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm text-surface-900">Delete this account</p>
            <p className="text-xs text-surface-500 mt-0.5">
              Permanently delete <strong>{user.tenant?.name}</strong> and all of its data. This cannot be undone.
            </p>
          </div>
          <button onClick={() => setShowDelete(true)} className="btn-danger shrink-0">
            <Trash2 className="w-4 h-4" /> Delete account
          </button>
        </div>
      </FormSection>
    )}

    {showDelete && (
      <DeleteAccountModal
        tenantName={user.tenant?.name ?? ''}
        onClose={() => setShowDelete(false)}
        onDeleted={() => router.push('/login')}
      />
    )}
   </div>
  )
}

interface UserForm {
  name: string
  email: string
  phone: string
  password: string
  role: (typeof ROLES)[number]
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)

  const { data } = useQuery({
    queryKey: ['tenant-users'],
    queryFn: () => api.get('/tenant/users').then((r) => r.data),
  })
  const users: any[] = data?.data ?? []

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/tenant/users/${id}`, { isActive }),
    onSuccess: () => {
      toast.success('Updated')
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/tenant/users/${id}`, { role }),
    onSuccess: () => {
      toast.success('Role updated')
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">{users.length} team member(s)</p>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Invite User
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Name</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Email</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Role</th>
              <th className="text-left px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Last Login</th>
              <th className="text-center px-4 h-9 text-xs font-medium text-surface-500 whitespace-nowrap">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className={cn(isSelf && 'bg-brand-50/50')}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name}</p>
                    {isSelf && <span className="text-[10px] text-brand-600 font-medium">YOU</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="badge-info">{u.role}</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value })}
                        className="text-xs border border-slate-200 rounded px-2 py-1"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isSelf ? (
                      <span className="badge-success">Active</span>
                    ) : (
                      <button
                        onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                        className={cn('text-xs', u.isActive ? 'badge-success' : 'badge-neutral', 'cursor-pointer')}
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4 bg-slate-50 text-xs text-slate-600 border-dashed">
        <strong>Roles:</strong> TENANT_ADMIN (full access) · STORE_MANAGER (operations) · PHARMACIST (sales + Rx) ·
        SALES_REP (field) · ACCOUNTANT (invoices/payments) · DELIVERY_STAFF (orders/delivery) · VIEWER (read-only).
        Disabled users can&apos;t log in but their history is preserved.
      </div>

      {showInvite && (
        <InviteUserModal onClose={() => setShowInvite(false)} onCreated={() => {
          setShowInvite(false)
          queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
        }} />
      )}
    </div>
  )
}

function InviteUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<UserForm>({
    defaultValues: { role: 'PHARMACIST' },
  })
  const mutation = useMutation({
    mutationFn: (d: UserForm) => api.post('/tenant/users', { ...d, storeIds: [] }),
    onSuccess: () => { toast.success('User created'); onCreated() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-md">
        <div className="modal-header">
          <h2 className="font-semibold">Invite User</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-close"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" {...register('name', { required: true, minLength: 2 })} />
            {errors.name && <p className="text-xs text-red-600 mt-1">Required</p>}
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" {...register('email', { required: true })} />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" {...register('phone', { required: true, minLength: 10 })} />
          </div>
          <div>
            <label className="label">Initial password *</label>
            <input className="input" type="text" {...register('password', { required: true, minLength: 8 })} placeholder="8+ characters" />
            <p className="text-xs text-slate-500 mt-1">Share this with the user — they can change it later.</p>
          </div>
          <div>
            <label className="label">Role *</label>
            <select className="input" {...register('role', { required: true })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LanTab() {
  const [apiUrl, setApiUrl] = useState('')
  useEffect(() => { setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1') }, [])

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <h2 className="text-[14px] font-semibold text-surface-950">LAN multi-device setup</h2>
        <p className="text-[13px] leading-5 text-surface-600 max-w-2xl">
          Run RxFlow on one machine and access it from phones, tablets, or other PCs on the same WiFi/LAN.
          All users share one database, so the POS can be open on the counter PC while a tablet manages inventory
          and a phone handles billing.
        </p>

        <ol className="divide-y divide-surface-200 border border-surface-200 rounded-lg text-[13px]">
          <li className="p-4">
            <p className="font-medium text-surface-900 mb-1.5">1. Find the host machine&apos;s LAN IP</p>
            <pre className="bg-surface-950 text-surface-100 text-xs px-3 py-2.5 rounded-md font-mono overflow-x-auto">{`# On macOS:
ipconfig getifaddr en0
# Or for any platform:
ifconfig | grep "inet "
`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Example output: <code className="bg-surface-100 border border-surface-200 font-mono px-1.5 py-0.5 rounded">192.168.1.42</code>
            </p>
          </li>

          <li className="p-4">
            <p className="font-medium text-surface-900 mb-1.5">2. Update API CORS to accept LAN origins</p>
            <p className="text-xs text-slate-600 mb-1">In <code className="bg-surface-100 border border-surface-200 font-mono px-1 py-0.5 rounded">apps/api/.env</code>:</p>
            <pre className="bg-surface-950 text-surface-100 text-xs px-3 py-2.5 rounded-md font-mono overflow-x-auto">{`CORS_ORIGIN=*
# Or list specific origins:
# CORS_ORIGIN=http://192.168.1.42:3000,http://localhost:3000`}</pre>
          </li>

          <li className="p-4">
            <p className="font-medium text-surface-900 mb-1.5">3. Point the web app at the host&apos;s LAN IP</p>
            <p className="text-xs text-slate-600 mb-1">In <code className="bg-surface-100 border border-surface-200 font-mono px-1 py-0.5 rounded">apps/web/.env.local</code>:</p>
            <pre className="bg-surface-950 text-surface-100 text-xs px-3 py-2.5 rounded-md font-mono overflow-x-auto">{`NEXT_PUBLIC_API_URL=http://192.168.1.42:3001/api/v1`}</pre>
            <p className="text-xs text-slate-500 mt-1">Replace with your actual LAN IP. Restart <code className="bg-surface-100 border border-surface-200 font-mono px-1 py-0.5 rounded">pnpm dev</code>.</p>
          </li>

          <li className="p-4">
            <p className="font-medium text-surface-900 mb-1.5">4. Bind Next.js dev server to all interfaces</p>
            <pre className="bg-surface-950 text-surface-100 text-xs px-3 py-2.5 rounded-md font-mono overflow-x-auto">{`# Run from project root:
cd apps/web && pnpm next dev -H 0.0.0.0 -p 3000

# API already binds to 0.0.0.0:3001 by default.`}</pre>
          </li>

          <li className="p-4">
            <p className="font-medium text-surface-900 mb-1.5">5. Open on devices</p>
            <p className="text-xs text-slate-600">
              From any phone, tablet, or PC on the same WiFi, open <br />
              <code className="bg-surface-100 border border-surface-200 font-mono px-1.5 py-0.5 rounded mt-1 inline-block">http://192.168.1.42:3000</code>
            </p>
          </li>
        </ol>

        <div className="bg-warning-50 border border-warning-200 rounded-md p-3 text-xs text-warning-900">
          <p className="font-semibold mb-1">Security for LAN mode</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Only do this on a trusted private network (your shop&apos;s WiFi, not public hotspots).</li>
            <li>Set strong passwords for every user — anyone on the LAN can reach the login page.</li>
            <li>Use a router-level firewall to prevent guest WiFi access to the host machine.</li>
            <li>For real production deployments use HTTPS via a reverse proxy (Caddy/Nginx) instead of LAN mode.</li>
          </ul>
        </div>
      </div>

      <div className="card px-4 py-3 text-xs text-surface-600">
        <p><strong className="font-medium text-surface-900">Current API URL detected:</strong> <code className="bg-surface-100 px-1.5 py-0.5 rounded font-mono">{apiUrl}</code></p>
        <p className="mt-1">If this shows <code>localhost</code>, other devices on the network can&apos;t reach it. Follow steps 1-5 above.</p>
      </div>
    </div>
  )
}
