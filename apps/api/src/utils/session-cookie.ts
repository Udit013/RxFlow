/**
 * Refresh-token cookie.
 *
 * The refresh token (7-day, rotating) lives ONLY in an httpOnly cookie, so injected script can't
 * read or exfiltrate it. The web app reaches the auth endpoints through a same-origin proxy
 * (Next.js rewrite of /api/v1/auth/*), which makes this a first-party cookie on the web app's
 * own domain — unaffected by third-party-cookie blocking. Scoped to the auth path so it's never
 * sent with ordinary API calls.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyReply, FastifyRequest } from 'fastify'

export const REFRESH_COOKIE = 'rxflow_rt'
const PATH = '/api/v1/auth'
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60

function attrs(maxAge: number) {
  const parts = [`Path=${PATH}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.header('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(token)}; ${attrs(MAX_AGE_SECONDS)}`)
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.header('Set-Cookie', `${REFRESH_COOKIE}=; ${attrs(0)}`)
}

export function readRefreshCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === REFRESH_COOKIE) {
      const value = part.slice(eq + 1).trim()
      try { return value ? decodeURIComponent(value) : null } catch { return null }
    }
  }
  return null
}

// ── Stored refresh-token hash ─────────────────────────────────────────────────
// bcrypt only reads the first 72 bytes of its input, and every JWT for a user shares that
// prefix (header + userId) — so a bcrypt hash "matched" ANY refresh token of the user and
// rotation never revoked old ones. Refresh tokens are long random-ish secrets, so a fast
// SHA-256 digest is the right tool. Legacy bcrypt hashes are still accepted once; the
// rotation that follows stores the new format.

const PREFIX = 'sha256:'

export function hashRefreshToken(token: string): string {
  return PREFIX + createHash('sha256').update(token).digest('hex')
}

export async function refreshTokenMatches(token: string, stored: string): Promise<boolean> {
  if (stored.startsWith(PREFIX)) {
    const a = Buffer.from(hashRefreshToken(token))
    const b = Buffer.from(stored)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  return bcrypt.compare(token, stored) // legacy row, replaced on this refresh
}
