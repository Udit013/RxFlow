'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Settings, Building, Save, X, Plus, Users as UsersIcon, AlertTriangle, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, formatDate } from '@/lib/utils'

const ROLES = ['TENANT_ADMIN', 'STORE_MANAGER', 'PHARMACIST', 'SALES_REP', 'ACCOUNTANT', 'DELIVERY_STAFF', 'VIEWER'] as const

export default function SettingsPage() {
  const [tab, setTab] = useState<'tenant' | 'users' | 'lan'>('tenant')
  const [user, setUser] = useState<ReturnType<typeof authService.getStoredUser>>(null)

  useEffect(() => { setUser(authService.getStoredUser()) }, [])

  if (!user) return <div className="p-8 text-slate-400">Loading...</div>

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Settings className="w-5 h-5" /> Settings</h1>
          <p className="text-sm text-slate-500">Tenant configuration, team members, LAN deployment</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {([
          ['tenant', 'Tenant & Operations', Building],
          ['users', 'Users & Roles', UsersIcon],
          ['lan', 'LAN Deployment', Wifi],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === k ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'tenant' && <TenantTab user={user} />}
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

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
      <div className="card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Building className="w-4 h-4" /> Business Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Pharmacy Name *</label>
            <input className="input" {...register('name', { required: true })} />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input font-mono text-xs" {...register('gstin')} placeholder="27AAACR5055K1ZV" />
          </div>
          <div>
            <label className="label">Drug License Number</label>
            <input className="input font-mono text-xs" {...register('drugLicenseNumber')} />
          </div>
          <div>
            <label className="label">Drug License Expiry</label>
            <input type="date" className="input" {...register('drugLicenseExpiryDate')} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" {...register('phone')} />
          </div>
          <div className="col-span-2">
            <label className="label">Email</label>
            <input className="input" type="email" {...register('email')} />
          </div>
          <div className="col-span-2">
            <label className="label">Address</label>
            <input className="input" {...register('addressLine1')} placeholder="Street address" />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" {...register('city')} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" {...register('state')} placeholder="Maharashtra" />
          </div>
          <div>
            <label className="label">Pincode</label>
            <input className="input" {...register('pincode')} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Operations</h3>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" {...register('allowNegativeStock')} className="mt-1" />
          <div>
            <p className="font-medium text-sm">Allow negative stock (sell before stocking)</p>
            <p className="text-xs text-slate-500 mt-1">
              When enabled, the POS will let you complete a sale even if the medicine isn&apos;t in inventory yet — the
              system tracks the negative balance until the purchase is recorded. Useful for fast-moving items received
              outside of business hours.
            </p>
            {allowNeg && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                ⚠️ Negative balances will appear with a red badge in inventory. Run regular stock takes to reconcile.
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={mutation.isPending} className="btn-primary">
          <Save className="w-4 h-4" /> {mutation.isPending ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Last Login</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Active</th>
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Invite User</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
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
        <h3 className="font-semibold flex items-center gap-2"><Wifi className="w-4 h-4 text-brand-600" /> LAN Multi-Device Setup</h3>
        <p className="text-sm text-slate-600">
          Run RxFlow on one machine and access it from phones, tablets, or other PCs on the same WiFi/LAN.
          All users share one database, so the POS can be open on the counter PC while a tablet manages inventory
          and a phone handles billing.
        </p>

        <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">1. Find the host machine&apos;s LAN IP</p>
            <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto">{`# On macOS:
ipconfig getifaddr en0
# Or for any platform:
ifconfig | grep "inet "
`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Example output: <code className="bg-slate-200 px-1.5 py-0.5 rounded">192.168.1.42</code>
            </p>
          </div>

          <div>
            <p className="font-semibold mb-1">2. Update API CORS to accept LAN origins</p>
            <p className="text-xs text-slate-600 mb-1">In <code className="bg-slate-200 px-1 py-0.5 rounded">apps/api/.env</code>:</p>
            <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto">{`CORS_ORIGIN=*
# Or list specific origins:
# CORS_ORIGIN=http://192.168.1.42:3000,http://localhost:3000`}</pre>
          </div>

          <div>
            <p className="font-semibold mb-1">3. Point the web app at the host&apos;s LAN IP</p>
            <p className="text-xs text-slate-600 mb-1">In <code className="bg-slate-200 px-1 py-0.5 rounded">apps/web/.env.local</code>:</p>
            <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto">{`NEXT_PUBLIC_API_URL=http://192.168.1.42:3001/api/v1`}</pre>
            <p className="text-xs text-slate-500 mt-1">Replace with your actual LAN IP. Restart <code className="bg-slate-200 px-1 py-0.5 rounded">pnpm dev</code>.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">4. Bind Next.js dev server to all interfaces</p>
            <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto">{`# Run from project root:
cd apps/web && pnpm next dev -H 0.0.0.0 -p 3000

# API already binds to 0.0.0.0:3001 by default.`}</pre>
          </div>

          <div>
            <p className="font-semibold mb-1">5. Open on devices</p>
            <p className="text-xs text-slate-600">
              From any phone, tablet, or PC on the same WiFi, open <br />
              <code className="bg-slate-200 px-1.5 py-0.5 rounded mt-1 inline-block">http://192.168.1.42:3000</code>
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
          <p className="font-semibold mb-1">⚠️ Security for LAN mode</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Only do this on a trusted private network (your shop&apos;s WiFi, not public hotspots).</li>
            <li>Set strong passwords for every user — anyone on the LAN can reach the login page.</li>
            <li>Use a router-level firewall to prevent guest WiFi access to the host machine.</li>
            <li>For real production deployments use HTTPS via a reverse proxy (Caddy/Nginx) instead of LAN mode.</li>
          </ul>
        </div>
      </div>

      <div className="card p-4 bg-slate-50 text-xs text-slate-600">
        <p><strong>Current API URL detected:</strong> <code className="bg-white px-1.5 py-0.5 rounded">{apiUrl}</code></p>
        <p className="mt-1">If this shows <code>localhost</code>, other devices on the network can&apos;t reach it. Follow steps 1-5 above.</p>
      </div>
    </div>
  )
}
