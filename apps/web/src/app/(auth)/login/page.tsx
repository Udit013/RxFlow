'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AuthAside } from '@/components/auth/auth-aside'
import { BrandMark } from '@/components/brand-mark'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
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
    <div className="min-h-screen min-h-dvh flex bg-paper">
      <AuthAside
        title={<>The pharmacy&rsquo;s<br />book of record.</>}
        lede="Stock, batches, expiries, tax, dues — every entry accounted for, on every device, in real time."
        points={[
          'Batch & expiry-true inventory across stores',
          'Tax-compliant billing — GST, VAT, sales tax',
          'Distributor CSV import, any format',
          'Payroll, commissions and ledgers',
        ]}
      />

      {/* Right panel — login form */}
      <main className="flex-1 flex items-center justify-center px-5 py-10 sm:p-8">
        <div className="w-full max-w-[22rem]">
          {/* Mobile logo */}
          <BrandMark className="mb-10 lg:hidden" />

          <div className="mb-7">
            <h2 className="font-display text-[22px] leading-7 font-semibold text-surface-950 tracking-[-0.015em]">Sign in to RxFlow</h2>
            <p className="text-surface-500 text-[13px] mt-1">Open the counter with your pharmacy account.</p>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <input id="email" type="email" className="input" placeholder="you@pharmacy.com" autoComplete="email" {...register('email')} />
                {errors.email && <p className="text-danger-600 text-xs mt-1.5">{errors.email.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="password">Password</label>
                  <Link href="/forgot-password" className="text-xs font-medium text-surface-500 hover:text-surface-900 mb-1.5">Forgot password?</Link>
                </div>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} className="input pr-10" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-surface-400 hover:text-surface-700" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-danger-600 text-xs mt-1.5">{errors.password.message}</p>}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-2 mt-2">
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
              <button type="submit" disabled={loading} className="btn-primary w-full py-2">{loading ? 'Sending…' : 'Send login code'}</button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-5">
              <div>
                <label className="label">Enter the code sent to {maskedEmail}</label>
                <input className="input tracking-[0.4em] font-mono" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-2">{loading ? 'Verifying…' : 'Sign in'}</button>
              <button type="button" onClick={() => setOtpStep('request')} className="text-xs text-surface-500 hover:text-surface-700 w-full text-center">Use a different account</button>
            </form>
          )}

          <div className="flex items-center gap-3 my-5 text-xs text-surface-400" aria-hidden="true">
            <span className="h-px flex-1 bg-surface-200" />or<span className="h-px flex-1 bg-surface-200" />
          </div>
          <button
            type="button"
            onClick={() => { setMode(mode === 'password' ? 'otp' : 'password'); setOtpStep('request') }}
            className="btn-secondary w-full py-2"
          >
            {mode === 'password' ? 'Sign in with a code instead' : 'Sign in with password instead'}
          </button>

          <p className="text-center text-[13px] text-surface-500 mt-8">
            New to RxFlow?{' '}
            <Link href="/register" className="text-surface-950 font-medium underline decoration-surface-300 underline-offset-[3px] hover:decoration-surface-950">Create your pharmacy account</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
