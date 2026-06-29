'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Pill, Mail, Lock, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { authService } from '@/lib/auth'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      toast.success('If that email is registered, a reset code is on its way.')
      setStep('reset')
    } catch {
      toast.error('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const reset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await authService.resetPassword(email, otp, newPassword)
      toast.success('Password updated — please sign in')
      router.push('/login')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Invalid or expired code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-100">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-surface-900">RxFlow</span>
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold text-surface-900">
            {step === 'request' ? 'Forgot your password?' : 'Enter your reset code'}
          </h1>
          <p className="text-sm text-surface-500 mt-1 mb-5">
            {step === 'request'
              ? 'Enter your account email and we’ll send a 6-digit code.'
              : `We sent a code to ${email}. It expires in 10 minutes.`}
          </p>

          {step === 'request' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label className="label">Email address *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input className="input pl-8" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.com" autoFocus />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-2">
                {loading ? 'Sending…' : 'Send reset code'}
              </button>
            </form>
          ) : (
            <form onSubmit={reset} className="space-y-4">
              <div>
                <label className="label">6-digit code *</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input className="input pl-8 tracking-[0.4em] font-mono" inputMode="numeric" maxLength={6} required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus />
                </div>
              </div>
              <div>
                <label className="label">New password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input className="input pl-8 pr-9" type={showPw ? 'text' : 'password'} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-2">
                {loading ? 'Updating…' : 'Reset password'}
              </button>
              <button type="button" onClick={() => setStep('request')} className="text-xs text-surface-500 hover:text-surface-700 w-full text-center">
                Didn’t get a code? Try again
              </button>
            </form>
          )}
        </div>

        <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-surface-500 hover:text-surface-900 mt-5">
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      </div>
    </div>
  )
}
