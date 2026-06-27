import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
// Resend's shared sandbox sender works without domain verification for testing.
const FROM = process.env.EMAIL_FROM || 'RxFlow <onboarding@resend.dev>'

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

interface SendArgs {
  to: string
  subject: string
  html: string
}

/**
 * Sends an email via Resend. If no API key is configured (local dev), it logs
 * the email to the console instead so flows are still testable.
 */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  if (!resend) {
    console.info(`\n📧 [email:dev] To: ${to}\n   Subject: ${subject}\n   ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n`)
    return
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}

export function otpEmailHtml(code: string, purpose: 'reset' | 'login'): string {
  const heading = purpose === 'reset' ? 'Reset your RxFlow password' : 'Your RxFlow login code'
  const action = purpose === 'reset' ? 'reset your password' : 'sign in'
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
      <div style="width:32px;height:32px;background:#0a8a52;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">Rx</div>
      <span style="font-size:18px;font-weight:700;color:#12161a">RxFlow</span>
    </div>
    <h1 style="font-size:18px;color:#12161a;margin:0 0 8px">${heading}</h1>
    <p style="font-size:14px;color:#4b555f;margin:0 0 20px">Use this code to ${action}. It expires in 10 minutes.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0a8a52;background:#ecfdf3;border:1px solid #a6f4c5;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px">${code}</div>
    <p style="font-size:12px;color:#6a7681;margin:0">If you didn't request this, you can safely ignore this email.</p>
  </div>`
}
