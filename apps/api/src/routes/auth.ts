import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { randomInt, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@rxflow/db'
import { authenticate } from '../middleware/auth.js'
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie, hashRefreshToken, refreshTokenMatches } from '../utils/session-cookie.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = z.object({
  pharmacyName: z.string().min(2),
  tenantType: z.enum(['RETAIL_PHARMACY', 'WHOLESALE_DISTRIBUTOR', 'CHAIN_PHARMACY', 'HOSPITAL', 'CLINIC', 'SUPPLIER']).default('RETAIL_PHARMACY'),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(10),
})

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'pharmacy'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

// Compared against when no user matches, so a miss costs the same bcrypt time as a wrong
// password — response timing can't reveal which emails are registered. A precomputed cost-12
// hash: computing it at import used to block server start-up for ~0.35s (seconds on a
// fractional-CPU host).
const DUMMY_PASSWORD_HASH = '$2a$12$.jXlRifB/7NSBtFuiV40UO0T/eHznEaq/FKpvdPhN1NUNkYFQl1We'

// Body token is accepted only as a one-time migration path for sessions created before the
// refresh token moved into an httpOnly cookie; the cookie is the normal source.
const refreshSchema = z.object({
  refreshToken: z.string().optional(),
}).default({})

export async function authRoutes(app: FastifyInstance) {
  // Build the full auth response (tokens + user) for a given user id.
  // The refresh token is set as an httpOnly cookie on `reply` and never returned in the body.
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

  /** Sign a refresh token for session `sid` and store its hash (rotation = call again). */
  async function rotateSession(userId: string, sid: string, reply: FastifyReply) {
    const token = app.jwt.sign({ userId, sid, jti: randomUUID() }, { expiresIn: '7d' })
    await prisma.authSession.update({
      where: { id: sid },
      data: { tokenHash: hashRefreshToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    })
    setRefreshCookie(reply, token)
  }

  /** Start a new device session for the user (other devices stay signed in). */
  async function startDeviceSession(userId: string, request: FastifyRequest, reply: FastifyReply) {
    const sid = randomUUID()
    await prisma.$transaction([
      prisma.authSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }), // prune
      prisma.authSession.create({
        data: {
          id: sid, userId, tokenHash: 'pending',
          userAgent: request.headers['user-agent']?.slice(0, 255) ?? null,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      }),
    ])
    await rotateSession(userId, sid, reply)
  }

  async function issueSession(userId: string, request: FastifyRequest, reply: FastifyReply) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { tenant: true, stores: { include: { store: true } } },
    })
    const payload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeIds: user.stores.map((us) => us.storeId),
    }
    const accessToken = app.jwt.sign(payload, { expiresIn: '15m' })
    await startDeviceSession(user.id, request, reply)
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return {
      accessToken,
      expiresIn: 900,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId,
        tenant: {
          id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, type: user.tenant.type, plan: user.tenant.plan,
          gstin: user.tenant.gstin ?? null, drugLicenseNumber: user.tenant.drugLicenseNumber ?? null,
          phone: user.tenant.phone ?? null, email: user.tenant.email ?? null,
          addressLine1: user.tenant.addressLine1 ?? null, city: user.tenant.city ?? null,
          state: user.tenant.state ?? null, pincode: user.tenant.pincode ?? null,
          allowNegativeStock: user.tenant.allowNegativeStock ?? false,
        },
        stores: user.stores.map((us) => ({ id: us.store.id, name: us.store.name, code: us.store.code, isPrimary: us.isPrimary })),
      },
    }
  }

  // POST /api/v1/auth/login
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body)

    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, isActive: true },
      include: { tenant: { select: { isActive: true } } },
    })

    const passwordMatch = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
    if (!user || !passwordMatch) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' })
    }

    if (!user.tenant.isActive) {
      return reply.status(403).send({ success: false, error: 'Account suspended' })
    }

    return reply.send({ success: true, data: await issueSession(user.id, request, reply) })
  })

  // POST /api/v1/auth/register
  app.post('/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body)

    const existingUser = await prisma.user.findFirst({ where: { email: { equals: body.email.trim(), mode: 'insensitive' } } })
    if (existingUser) {
      return reply.status(409).send({ success: false, error: 'An account with this email already exists. Try signing in.' })
    }

    const passwordHash = await bcrypt.hash(body.password, 12)

    // Generate a unique slug (retry on the rare collision)
    let slug = slugify(body.pharmacyName)
    for (let i = 0; i < 5; i++) {
      const taken = await prisma.tenant.findUnique({ where: { slug } })
      if (!taken) break
      slug = slugify(body.pharmacyName)
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.pharmacyName,
          slug,
          type: body.tenantType as any,
          phone: body.phone,
          email: body.email,
          settings: {
            currency: 'INR', timezone: 'Asia/Kolkata', gstEnabled: true,
            creditDays: 30, lowStockThreshold: 10, expiryAlertDays: 90,
          },
        },
      })

      const store = await tx.store.create({
        data: {
          tenantId: tenant.id, name: body.pharmacyName, code: 'MAIN',
          city: '', state: '', pincode: '', addressLine1: '', isHeadOffice: true,
        },
      })

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id, name: body.name, email: body.email, phone: body.phone,
          passwordHash, role: 'TENANT_ADMIN',
        },
      })

      await tx.userStore.create({ data: { userId: user.id, storeId: store.id, isPrimary: true } })
      return { user }
    })

    // Auto-login: return the same session payload the login endpoint does
    const session = await issueSession(result.user.id, request, reply)
    return reply.status(201).send({ success: true, message: 'Welcome to RxFlow', data: session })
  })

  /**
   * Resolve a refresh token to its user + device session. Tokens minted before per-device
   * sessions existed (no `sid`) are checked against the legacy User.refreshToken slot once and
   * then upgraded into a session.
   */
  async function resolveRefreshToken(token: string | null | undefined) {
    if (!token) return null
    let payload: { userId?: string; sid?: string }
    try {
      payload = app.jwt.verify<{ userId?: string; sid?: string }>(token)
    } catch {
      return null
    }
    if (!payload.userId) return null
    const user = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true },
      include: { stores: true, tenant: { select: { isActive: true } } },
    })
    if (!user || !user.tenant.isActive) return null

    if (payload.sid) {
      const session = await prisma.authSession.findUnique({ where: { id: payload.sid } })
      if (!session || session.userId !== user.id || session.expiresAt < new Date()) return null
      if (!(await refreshTokenMatches(token, session.tokenHash))) return null
      return { user, sid: session.id, legacy: false }
    }
    if (!user.refreshToken || !(await refreshTokenMatches(token, user.refreshToken))) return null
    return { user, sid: null, legacy: true }
  }

  // POST /api/v1/auth/refresh — rotate the refresh cookie, return a fresh access token
  app.post('/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = refreshSchema.parse(request.body ?? {})
    const resolved = await resolveRefreshToken(readRefreshCookie(request) ?? body.refreshToken)
    if (!resolved) {
      clearRefreshCookie(reply)
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' })
    }
    const { user } = resolved

    const newPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeIds: user.stores.map((us) => us.storeId),
    }

    const accessToken = app.jwt.sign(newPayload, { expiresIn: '15m' })
    if (resolved.sid) {
      await rotateSession(user.id, resolved.sid, reply)
    } else {
      // Legacy single-slot token → upgrade to a device session and retire the old slot.
      await startDeviceSession(user.id, request, reply)
      await prisma.user.update({ where: { id: user.id }, data: { refreshToken: null } })
    }

    return reply.send({
      success: true,
      data: { accessToken, expiresIn: 900, role: user.role },
    })
  })

  // POST /api/v1/auth/logout — works even with an expired access token: the refresh cookie
  // identifies the session, which is revoked server-side before the cookie is cleared.
  app.post('/logout', async (request, reply) => {
    const resolved = await resolveRefreshToken(readRefreshCookie(request))
    if (resolved?.sid) {
      await prisma.authSession.deleteMany({ where: { id: resolved.sid } }) // this device only
    } else if (resolved?.legacy) {
      await prisma.user.update({ where: { id: resolved.user.id }, data: { refreshToken: null } })
    }
    clearRefreshCookie(reply)
    return reply.send({ success: true, message: 'Logged out' })
  })

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      include: {
        tenant: true,
        stores: { include: { store: true } },
      },
    })

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' })
    }

    return reply.send({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenant: user.tenant,
        stores: user.stores.map((us) => ({ ...us.store, isPrimary: us.isPrimary })),
      },
    })
  })

  // ── OTP helpers ─────────────────────────────────────────────────────────────
  async function issueOtp(identifier: string, purpose: 'PASSWORD_RESET' | 'LOGIN') {
    const code = String(randomInt(100000, 1000000)) // 6 digits, CSPRNG (Math.random is predictable)
    const codeHash = await bcrypt.hash(code, 10)
    // Invalidate prior unconsumed OTPs for this identifier+purpose
    await prisma.otpToken.deleteMany({ where: { identifier, purpose, consumedAt: null } })
    await prisma.otpToken.create({
      data: { identifier, codeHash, purpose, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    })
    return code
  }

  async function verifyOtp(identifier: string, purpose: 'PASSWORD_RESET' | 'LOGIN', code: string): Promise<boolean> {
    const token = await prisma.otpToken.findFirst({
      where: { identifier, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!token) return false
    if (token.attempts >= 5) return false
    const ok = await bcrypt.compare(code, token.codeHash)
    if (!ok) {
      await prisma.otpToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } })
      return false
    }
    await prisma.otpToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } })
    return true
  }

  // POST /auth/forgot-password — always responds 200 (no account enumeration)
  app.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body)
    const normalized = email.toLowerCase().trim()
    const user = await prisma.user.findFirst({ where: { email: normalized, isActive: true } })
    if (user) {
      const code = await issueOtp(normalized, 'PASSWORD_RESET')
      try {
        const { sendEmail, otpEmailHtml } = await import('../utils/email.js')
        await sendEmail({ to: normalized, subject: 'Reset your RxFlow password', html: otpEmailHtml(code, 'reset') })
      } catch (e) {
        // Delivery failed (misconfigured key / unverified sender). Log the code
        // as an operator rescue: an admin can read it from server logs and help
        // the user complete the reset. The OTP is short-lived and single-use.
        request.log.error({ err: e }, 'password-reset email failed — check RESEND_API_KEY / EMAIL_FROM (verified domain)')
        request.log.warn({ email: normalized, code }, '[rescue] password-reset OTP (email delivery failed)')
      }
    }
    return reply.send({ success: true, message: 'If an account exists for that email, a reset code has been sent.' })
  })

  // POST /auth/reset-password — verify OTP + set new password
  app.post('/reset-password', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      otp: z.string().length(6),
      newPassword: z.string().min(8),
    }).parse(request.body)
    const normalized = body.email.toLowerCase().trim()

    const ok = await verifyOtp(normalized, 'PASSWORD_RESET', body.otp)
    if (!ok) return reply.status(400).send({ success: false, error: 'Invalid or expired code' })

    const user = await prisma.user.findFirst({ where: { email: normalized, isActive: true } })
    if (!user) return reply.status(404).send({ success: false, error: 'Account not found' })

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12), refreshToken: null },
    })
    // A password reset signs the account out everywhere.
    await prisma.authSession.deleteMany({ where: { userId: user.id } })
    return reply.send({ success: true, message: 'Password updated. You can now sign in.' })
  })

  // POST /auth/otp/request — passwordless login. Accepts email OR registered phone.
  // The code is delivered to the account's email (free). True SMS needs a paid gateway.
  app.post('/otp/request', { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const { identifier } = z.object({ identifier: z.string().min(3) }).parse(request.body)
    const value = identifier.toLowerCase().trim()
    // Look up by email or phone
    const user = await prisma.user.findFirst({
      where: { isActive: true, OR: [{ email: value }, { phone: identifier.trim() }] },
    })
    let delivered = false
    if (user) {
      const code = await issueOtp(user.email.toLowerCase(), 'LOGIN')
      try {
        const { sendEmail, otpEmailHtml } = await import('../utils/email.js')
        await sendEmail({ to: user.email, subject: 'Your RxFlow login code', html: otpEmailHtml(code, 'login') })
        delivered = true
      } catch (e) {
        request.log.error({ err: e }, 'login OTP email failed — check RESEND_API_KEY / EMAIL_FROM (verified domain)')
        request.log.warn({ email: user.email, code }, '[rescue] login OTP (email delivery failed)')
      }
    }
    // Mask the email for the UI (e.g., r***@gmail.com) when we found a user
    const maskedEmail = user ? user.email.replace(/^(.).*(@.*)$/, '$1***$2') : null
    return reply.send({ success: true, data: { sent: delivered, maskedEmail } })
  })

  // POST /auth/otp/verify — verify login OTP, issue a session
  app.post('/otp/verify', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const body = z.object({ identifier: z.string().min(3), otp: z.string().length(6) }).parse(request.body)
    const value = body.identifier.toLowerCase().trim()
    const user = await prisma.user.findFirst({
      where: { isActive: true, OR: [{ email: value }, { phone: body.identifier.trim() }] },
      include: { tenant: true },
    })
    if (!user) return reply.status(401).send({ success: false, error: 'Invalid code' })
    if (!user.tenant.isActive) return reply.status(403).send({ success: false, error: 'Account suspended' })

    const ok = await verifyOtp(user.email.toLowerCase(), 'LOGIN', body.otp)
    if (!ok) return reply.status(401).send({ success: false, error: 'Invalid or expired code' })

    const session = await issueSession(user.id, request, reply)
    return reply.send({ success: true, data: session })
  })
}
