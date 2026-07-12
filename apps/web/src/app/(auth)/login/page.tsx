'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Pill } from 'lucide-react'
import { authService } from '@/lib/auth'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      await authService.login(data)
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Login failed'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  // ── OTP (passwordless) login ──
  const [mode, setMode] = useState<'password' | 'otp'>('password')
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request')
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authService.requestLoginOtp(identifier)
      if (res.sent) {
        setMaskedEmail(res.maskedEmail)
        setOtpStep('verify')
        toast.success(`Code sent to ${res.maskedEmail}`)
      } else {
        toast.error('No account found for that email or phone')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authService.loginWithOtp(identifier, otp)
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Invalid code')
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
            The pharmacy&rsquo;s<br />book of record.
          </h1>
          <p className="text-brand-200/80 text-[15px] mt-4 max-w-sm leading-relaxed">
            Stock, batches, expiries, GST, dues — every entry accounted for, on every device, in real time.
          </p>

          <div className="mt-12 max-w-sm">
            {[
              'Batch & expiry-true inventory across stores',
              'GST billing, returns and debit notes',
              'Distributor CSV import, any format',
              'Payroll, commissions and ledgers',
            ].map((text, i) => (
              <div key={i} className="flex items-baseline gap-4 py-3 border-t border-white/10 last:border-b">
                <span className="font-mono text-[11px] text-brand-300/80 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[13px] text-brand-100/90">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="font-mono text-[11px] text-brand-300/50 tracking-wide">
          © 2026 RxFlow · built for Indian pharma
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-baseline gap-2 mb-8 lg:hidden">
            <Pill className="w-4 h-4 text-brand-600 self-center" />
            <span className="font-display text-xl font-bold text-surface-900 tracking-tight">RxFlow</span>
          </div>

          <div className="mb-8">
            <p className="microlabel text-brand-600 mb-1.5">Sign in</p>
            <h2 className="font-display text-2xl font-semibold text-surface-900 tracking-tight">Open the counter</h2>
            <p className="text-surface-500 text-sm mt-1.5">Enter your credentials to continue.</p>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="label" htmlFor="email">Email address *</label>
                <input id="email" type="email" className="input" placeholder="you@pharmacy.com" autoComplete="email" {...register('email')} />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="password">Password *</label>
                  <Link href="/forgot-password" className="text-xs text-brand-600 hover:underline mb-1">Forgot password?</Link>
                </div>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} className="input pr-10" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : otpStep === 'request' ? (
            <form onSubmit={requestOtp} className="space-y-5">
              <div>
                <label className="label">Email or mobile number</label>
                <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@pharmacy.com or 9876543210" autoFocus />
                <p className="help-text">We&apos;ll email a 6-digit code to your registered address.</p>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">{loading ? 'Sending…' : 'Send login code'}</button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-5">
              <div>
                <label className="label">Enter the code sent to {maskedEmail}</label>
                <input className="input tracking-[0.4em] font-mono" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">{loading ? 'Verifying…' : 'Sign in'}</button>
              <button type="button" onClick={() => setOtpStep('request')} className="text-xs text-surface-500 hover:text-surface-700 w-full text-center">Use a different account</button>
            </form>
          )}

          <button
            onClick={() => { setMode(mode === 'password' ? 'otp' : 'password'); setOtpStep('request') }}
            className="text-sm text-brand-600 hover:underline w-full text-center mt-4"
          >
            {mode === 'password' ? 'Sign in with a code instead' : 'Sign in with password instead'}
          </button>

          <p className="text-center text-sm text-slate-500 mt-5">
            New to RxFlow?{' '}
            <Link href="/register" className="text-brand-600 font-medium hover:underline">Create your pharmacy account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
