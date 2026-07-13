import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
// Resend's shared sandbox sender works without domain verification, BUT it only
// delivers to the Resend account owner's own address. For real recipients, set
// EMAIL_FROM to an address on a domain verified in Resend.
const FROM = process.env.EMAIL_FROM || 'RxFlow <onboarding@resend.dev>'

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

// Loud, one-time startup diagnostics — a misconfigured mailer should never be silent.
if (!RESEND_API_KEY) {
  console.warn(
    '⚠️  [email] RESEND_API_KEY is not set — emails will be logged to the console, not delivered. ' +
    'Set RESEND_API_KEY (and EMAIL_FROM with a verified domain) for real delivery.'
  )
} else if (!process.env.EMAIL_FROM) {
  console.warn(
    '⚠️  [email] Using the Resend sandbox sender (onboarding@resend.dev). ' +
    'Sandbox mail is ONLY delivered to the Resend account owner\'s own email. ' +
    'Set EMAIL_FROM to an address on a domain verified in Resend to reach real users.'
  )
}

interface SendArgs {
  to: string
  subject: string
  html: string
}

/**
 * Sends an email via Resend. Returns true when handed off for delivery.
 * With no API key (local dev) the email is logged to the console and this
 * returns false, so callers can decide on a fallback.
 */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  if (!resend) {
    console.info(`\n📧 [email:dev] To: ${to}\n   Subject: ${subject}\n   ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n`)
    return false
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) {
    // Surface Resend's own explanation — the classic one is the sandbox-sender
    // 403 ("You can only send testing emails to your own email address").
    throw new Error(`Email send failed (${error.name ?? 'error'}): ${error.message}`)
  }
  return true
}

export function otpEmailHtml(code: string, purpose: 'reset' | 'login'): string {
  const heading = purpose === 'reset' ? 'Reset your RxFlow password' : 'Your RxFlow login code'
  const action = purpose === 'reset' ? 'reset your password' : 'sign in'
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px">
    <div style="margin-bottom:20px">
      <span style="font-size:18px;font-weight:700;color:#1f231f">RxFlow</span>
      <span style="font-size:10px;letter-spacing:2px;color:#0e5f52;margin-left:8px">PHARMACY OS</span>
    </div>
    <h1 style="font-size:18px;color:#1f231f;margin:0 0 8px">${heading}</h1>
    <p style="font-size:14px;color:#57564e;margin:0 0 20px">Use this code to ${action}. It expires in 10 minutes.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0e5f52;background:#eef7f3;border:1px solid #b0dbc9;border-radius:4px;padding:16px;text-align:center;margin-bottom:20px">${code}</div>
    <p style="font-size:12px;color:#77756b;margin:0">If you didn't request this, you can safely ignore this email.</p>
  </div>`
}
