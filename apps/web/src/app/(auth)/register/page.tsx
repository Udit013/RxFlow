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
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 to-brand-900 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Pill className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold">RxFlow</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Start managing your<br />pharmacy in minutes
          </h1>
          <p className="text-brand-200 text-lg">
            Create your free workspace. Add inventory, bill customers, track GST, and run payroll — all in one place.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: '⚡', text: 'Set up in under a minute — no card needed' },
              { icon: '🏪', text: 'Your own private pharmacy workspace' },
              { icon: '👥', text: 'Invite staff with role-based access' },
              { icon: '🔒', text: 'Your data stays yours — export anytime' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-brand-100">
                <span className="text-xl">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-brand-300 text-sm">© 2026 RxFlow. Built for Indian pharma.</p>
      </div>

      {/* Right panel — register form */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-md py-6">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">RxFlow</span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
            <p className="text-slate-500 mt-1">Set up your pharmacy workspace. You&apos;ll be the admin.</p>
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
