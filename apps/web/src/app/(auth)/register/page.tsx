'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Pill, Building2, User, Mail, Phone, Lock } from 'lucide-react'
import { authService } from '@/lib/auth'

const registerSchema = z.object({
  pharmacyName: z.string().min(2, 'Enter your pharmacy / business name'),
  tenantType: z.enum(['RETAIL_PHARMACY', 'WHOLESALE_DISTRIBUTOR', 'CHAIN_PHARMACY', 'HOSPITAL', 'CLINIC', 'SUPPLIER']),
  name: z.string().min(2, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(10, 'Enter a valid phone number'),
  password: z.string().min(8, 'At least 8 characters'),
})

type RegisterForm = z.infer<typeof registerSchema>

const TYPE_LABELS: Record<string, string> = {
  RETAIL_PHARMACY: 'Retail Pharmacy',
  WHOLESALE_DISTRIBUTOR: 'Wholesale Distributor',
  CHAIN_PHARMACY: 'Chain Pharmacy',
  HOSPITAL: 'Hospital',
  CLINIC: 'Clinic',
  SUPPLIER: 'Supplier',
}

export default function RegisterPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { tenantType: 'RETAIL_PHARMACY' },
  })

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true)
    try {
      await authService.register(data)
      toast.success('Account created — welcome to RxFlow!')
      router.push('/dashboard')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Registration failed'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-surface-100">
      {/* Left panel — the ledger cover */}
      <div className="hidden lg:flex lg:w-[44%] bg-brand-950 text-paper flex-col justify-between p-12">
        <div>
          <div className="flex items-baseline gap-2">
            <Pill className="w-5 h-5 text-brand-300 self-center" />
            <span className="font-display text-2xl font-bold tracking-tight">RxFlow</span>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-300/70 mt-1.5">Pharmacy OS</p>
        </div>

        <div>
          <h1 className="font-display text-[40px] font-semibold leading-[1.08] tracking-tight">
            Open your own<br />book of record.
          </h1>
          <p className="text-brand-200/80 text-[15px] mt-4 max-w-sm leading-relaxed">
            A private workspace for your pharmacy — inventory, billing, GST and payroll, from the first entry.
          </p>

          <div className="mt-12 max-w-sm">
            {[
              'Set up in under a minute, no card needed',
              'Your own private pharmacy workspace',
              'Invite staff with role-based access',
              'Your data stays yours — export anytime',
            ].map((text, i) => (
              <div key={i} className="flex items-baseline gap-4 py-3 border-t border-white/10 last:border-b">
                <span className="font-mono text-[11px] text-brand-300/80 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[13px] text-brand-100/90">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="font-mono text-[11px] text-brand-300/50 tracking-wide">© 2026 RxFlow · built for Indian pharma</p>
      </div>

      {/* Right panel — register form */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-md py-6">
          <div className="flex items-baseline gap-2 mb-8 lg:hidden">
            <Pill className="w-4 h-4 text-brand-600 self-center" />
            <span className="font-display text-xl font-bold text-surface-900 tracking-tight">RxFlow</span>
          </div>

          <div className="mb-6">
            <p className="microlabel text-brand-600 mb-1.5">New workspace</p>
            <h2 className="font-display text-2xl font-semibold text-surface-900 tracking-tight">Create your account</h2>
            <p className="text-surface-500 text-sm mt-1.5">Set up your pharmacy workspace. You&apos;ll be the admin.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Pharmacy / business name *</label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="input pl-9" placeholder="Sunrise Medical Store" {...register('pharmacyName')} />
              </div>
              {errors.pharmacyName && <p className="text-red-500 text-xs mt-1">{errors.pharmacyName.message}</p>}
            </div>

            <div>
              <label className="label">Business type</label>
              <select className="input" {...register('tenantType')}>
                {Object.entries(TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Your name *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="input pl-9" placeholder="Dr. Ramesh Kumar" autoComplete="name" {...register('name')} />
              </div>
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input className="input pl-9" type="email" placeholder="you@store.com" autoComplete="email" {...register('email')} />
                </div>
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label">Phone *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input className="input pl-9" placeholder="9876543210" autoComplete="tel" {...register('phone')} />
                </div>
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="input pl-9 pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  {...register('password')}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </span>
              ) : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
